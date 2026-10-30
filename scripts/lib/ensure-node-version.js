#!/usr/bin/env node
// scripts/lib/ensure-node-version.js
// Shared helper: garante Node.js mínima para MCP scripts.
// Priority: configKey env var (ex: TEAMS_MCP_NODE_PATH) → nvm → fnm → volta → PATH
//
// Uso:
//   const nodePath = require('./lib/ensure-node-version')(20);
//   const nodePath = require('./lib/ensure-node-version')(20, 'TEAMS_MCP_NODE_PATH');
//
// Se a versão atual for insuficiente, re-executa o script com Node correto
// e encerra o processo atual (nunca retorna nesse caso).

const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

/**
 * Carrega variáveis do .env (raiz do workbench) para process.env
 */
function loadEnv() {
  const envPath = path.resolve(__dirname, "..", "..", ".env");
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, "utf8");
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, "");
    process.env[key] = val;
  }
}

/**
 * Descobre candidatos a Node >= minMajor no sistema
 */
function findNodeCandidates(minMajor) {
  const candidates = [];
  const IS_WIN = process.platform === "win32";
  const NODE_EXE = IS_WIN ? "node.exe" : "node";
  const home = os.homedir();

  function testVersion(nodePath) {
    try {
      const r = spawnSync(nodePath, ["--version"], {
        encoding: "utf8",
        timeout: 10000,
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (r.status !== 0) return;
      const ver = (r.stdout || "").trim();
      const major = parseInt(ver.replace("v", "").split(".")[0], 10);
      if (major >= minMajor && !candidates.some((c) => c.path === nodePath)) {
        candidates.push({ path: nodePath, version: ver, major });
      }
    } catch {
      /* ignore */
    }
  }

  function scanDir(dirPath, buildPathFn) {
    if (!fs.existsSync(dirPath)) return;
    try {
      for (const entry of fs.readdirSync(dirPath).sort().reverse()) {
        const major = parseInt(entry.replace(/^v/, "").split(".")[0], 10);
        if (major >= minMajor) {
          const nodePath = buildPathFn(entry);
          if (fs.existsSync(nodePath)) testVersion(nodePath);
        }
      }
    } catch {
      /* ignore */
    }
  }

  // 1. Version managers
  if (IS_WIN) {
    // nvm-windows
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    scanDir(path.join(appData, "nvm"), (ver) => path.join(appData, "nvm", ver, NODE_EXE));
    // fnm (Windows)
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    scanDir(path.join(localAppData, "fnm", "node-versions"),
      (ver) => path.join(localAppData, "fnm", "node-versions", ver, "installation", NODE_EXE));
  } else {
    // nvm (Linux/Mac)
    const nvmDir = process.env.NVM_DIR || path.join(home, ".nvm");
    scanDir(path.join(nvmDir, "versions", "node"),
      (ver) => path.join(nvmDir, "versions", "node", ver, "bin", NODE_EXE));
    // fnm (Linux/Mac)
    for (const base of [
      path.join(home, ".local", "share", "fnm", "node-versions"),
      path.join(home, ".fnm", "node-versions"),
    ]) {
      scanDir(base, (ver) => path.join(base, ver, "installation", "bin", NODE_EXE));
    }
    // Volta
    const voltaDir = path.join(home, ".volta", "tools", "image", "node");
    scanDir(voltaDir, (entry) => path.join(voltaDir, entry, "bin", NODE_EXE));
    // asdf
    scanDir(path.join(home, ".asdf", "installs", "nodejs"),
      (ver) => path.join(home, ".asdf", "installs", "nodejs", ver, "bin", NODE_EXE));
  }

  // 2. Varre PATH completo
  const visited = new Set();
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    const normalized = path.resolve(dir.trim());
    if (!normalized || visited.has(normalized)) continue;
    visited.add(normalized);
    const nodeExe = path.join(normalized, NODE_EXE);
    if (fs.existsSync(nodeExe)) testVersion(nodeExe);
  }

  // 3. Locais comuns de instalação
  const installPaths = IS_WIN
    ? [
        path.join(process.env.ProgramFiles || "C:\\Program Files", "nodejs", NODE_EXE),
        path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "nodejs", NODE_EXE),
        path.join("C:\\ProgramData\\chocolatey\\lib\\nodejs\\tools", NODE_EXE),
      ]
    : ["/usr/local/bin/node", "/usr/bin/node", "/opt/nodejs/current/bin/node",
       "/opt/node/bin/node", "/snap/bin/node"];

  for (const p of installPaths) {
    if (fs.existsSync(p)) testVersion(p);
  }

  return candidates.sort(
    (a, b) => b.major - a.major || b.version.localeCompare(a.version),
  );
}

/**
 * Garante que o script atual roda com Node >= minMajor.
 * Retorna o path do Node atual se já OK.
 * Se precisar trocar, re-executa e process.exit() — nunca retorna.
 */
function ensureNodeVersion(minMajor = 20, configKey = "TEAMS_MCP_NODE_PATH") {
  loadEnv();

  const currentMajor = parseInt(
    process.version.replace("v", "").split(".")[0],
    10,
  );

  // Já está na versão correta
  if (currentMajor >= minMajor) return process.execPath;

  const scriptName = process.argv[1] ? path.basename(process.argv[1], ".js") : "unknown";

  // Tenta configKey (ex: TEAMS_MCP_NODE_PATH)
  const explicitPath = process.env[configKey];
  if (explicitPath) {
    return respawnWith(explicitPath, scriptName);
  }

  // Auto-discover
  const found = findNodeCandidates(minMajor);
  if (found.length > 0) {
    return respawnWith(found[0].path, scriptName);
  }

  // Não encontrou
  console.error(
    `[MCP ${scriptName}] ERRO: Node.js ${minMajor}+ é obrigatório.`,
  );
  console.error(`  Versão atual: ${process.version}`);
  console.error(
    `  Defina ${configKey}=<path> no .env ou instale Node ${minMajor}+`,
  );
  process.exit(1);
}

function respawnWith(nodePath, scriptName) {
  // Valida o Node alvo
  const r = spawnSync(nodePath, ["--version"], {
    encoding: "utf8",
    timeout: 10000,
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (r.status !== 0) {
    console.error(
      `[MCP ${scriptName}] ERRO: Node em ${nodePath} não é executável`,
    );
    process.exit(1);
  }

  const targetVer = (r.stdout || "").trim();
  console.error(
    `[MCP ${scriptName}] Node ${process.version} → respawn com ${nodePath} (${targetVer})`,
  );

  const result = spawnSync(nodePath, process.argv.slice(1), {
    stdio: "inherit",
    env: { ...process.env },
  });
  process.exit(result.status ?? 1);
}

module.exports = ensureNodeVersion;
