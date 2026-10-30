#!/usr/bin/env node
// @azure-devops/mcp wrapper — Multi-platform (Linux / Windows)
// Uso: "command": ["node", "scripts/start-azure-devops-mcp.js"]

const { spawn, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const IS_WIN = process.platform === "win32";
const NODE_MIN = 20;
const NODE_EXE = IS_WIN ? "node.exe" : "node";
const NPX_CLI_FILE = "npx-cli.js";

// ── FASE 0: Garantir Node 20+ (lib compartilhada) ──────────
const nodePath = require("./lib/ensure-node-version")(NODE_MIN, "TEAMS_MCP_NODE_PATH");

// Node 20+ → MCP
startMCPServer(nodePath);

// Localiza npx-cli.js no instalamento do Node alvo
function findNpxCli(nodeBinPath) {
  const nodeDir = path.dirname(nodeBinPath);

  // Linux nvm: node em bin/, npx-cli em ../lib/node_modules/npm/bin/
  const p1 = path.resolve(nodeDir, "..", "lib", "node_modules", "npm", "bin", NPX_CLI_FILE);
  if (fs.existsSync(p1)) return p1;

  // Windows nvm-windows: flat — npx-cli no mesmo dir que node.exe
  const p2 = path.resolve(nodeDir, "node_modules", "npm", "bin", NPX_CLI_FILE);
  if (fs.existsSync(p2)) return p2;

  // Windows oficial: node.exe em raiz, npm em subpasta
  const p3 = path.resolve(nodeDir, "..", "node_modules", "npm", "bin", NPX_CLI_FILE);
  if (fs.existsSync(p3)) return p3;

  // Fallback: require.resolve no node alvo
  try {
    const r = spawnSync(nodeBinPath, ["-e",
      "const p=require('path');const pkg=require.resolve('npm/package.json');console.log(p.join(p.dirname(pkg),'bin','npx-cli.js'));"
    ], { encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "pipe"] });
    if (r.status === 0 && r.stdout.trim()) {
      const resolved = r.stdout.trim();
      if (fs.existsSync(resolved)) return resolved;
    }
  } catch { /* ignore */ }

  return null;
}

// Remove caches npx obsoletos (@azure-devops/mcp) criados com Node diferente
function clearStaleNpxCache() {
  const npxCacheDir = path.join(os.homedir(), ".npm", "_npx");
  if (!fs.existsSync(npxCacheDir)) return;

  let removed = 0;

  try {
    for (const entry of fs.readdirSync(npxCacheDir)) {
      const entryPath = path.join(npxCacheDir, entry);
      try { if (!fs.statSync(entryPath).isDirectory()) continue; } catch { continue; }

      const mcpDir = path.join(entryPath, "node_modules", "@azure-devops", "mcp");
      if (!fs.existsSync(mcpDir)) continue;

      const modulesDir = path.join(entryPath, "node_modules");
      if (!fs.existsSync(modulesDir)) continue;

      let stale = false;
      try {
        const walkDirs = [modulesDir];
        const visited = new Set();
        while (walkDirs.length > 0 && !stale) {
          const dir = walkDirs.pop();
          if (!dir || visited.has(dir)) continue;
          visited.add(dir);
          const pkgJsonPath = path.join(dir, "package.json");
          if (fs.existsSync(pkgJsonPath)) {
            try {
              const meta = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
              const engineReq = meta.engines?.node;
              if (engineReq && typeof engineReq === "string") {
                const match = engineReq.match(/>=\s*(\d+)/);
                if (match && parseInt(match[1], 10) > parseInt(process.version.replace("v", "").split(".")[0], 10)) stale = true;
              }
            } catch { /* ignore */ }
          }
          if (path.basename(dir) === "node_modules" || dir === modulesDir) {
            try {
              for (const sub of fs.readdirSync(dir)) {
                if (sub.startsWith(".")) continue;
                const subPath = path.join(dir, sub);
                if (fs.statSync(subPath).isDirectory()) {
                  if (sub.startsWith("@")) {
                    try {
                      for (const sp of fs.readdirSync(subPath)) walkDirs.push(path.join(subPath, sp));
                    } catch { /* ignore */ }
                  } else {
                    walkDirs.push(subPath);
                  }
                }
              }
            } catch { /* ignore */ }
          }
        }
      } catch { stale = true; }

      if (stale) {
        try {
          fs.rmSync(entryPath, { recursive: true, force: true });
          removed++;
          console.error(`[MCP azure-devops] Cache npx obsoleto removido: ${entry}`);
        } catch (err) {
          console.error(`[MCP azure-devops] AVISO: falha ao remover cache ${entry}: ${err.message}`);
        }
      }
    }
  } catch { /* cache inacessível */ }

  if (removed > 0) console.error(`[MCP azure-devops] ${removed} entrada(s) de cache limpa(s).`);
}

// Prepara env com Node alvo no PATH para subprocessos do npx
function buildMcpEnv(nodeBinPath) {
  const nodeDir = path.dirname(nodeBinPath);
  return {
    ...process.env,
    PATH: nodeDir + path.delimiter + (process.env.PATH || ""),
    ADO_MCP_AUTH_TOKEN: process.env.ADO_MCP_AUTH_TOKEN,
    AZURE_DEVOPS_ORG: process.env.AZURE_DEVOPS_ORG || "",
  };
}

// Inicia o MCP server
// 1. Limpa cache obsoleto → 2. Localiza npx → 3. Spawna node npx-cli.js @azure-devops/mcp
function startMCPServer(nodeBinPath) {
  const token = process.env.ADO_MCP_AUTH_TOKEN;
  const org = process.env.AZURE_DEVOPS_ORG;
  if (!token) {
    console.error("[MCP azure-devops] ERRO: ADO_MCP_AUTH_TOKEN não configurado");
    process.exit(1);
  }
  if (!org) {
    console.error("[MCP azure-devops] ERRO: AZURE_DEVOPS_ORG não configurado");
    process.exit(1);
  }

  clearStaleNpxCache();
  console.error(`[MCP azure-devops] Iniciando (${process.version})...`);
  console.error(`  Token: ${token.slice(0, 8)}...${token.slice(-4)}`);

  const env = buildMcpEnv(nodeBinPath);
  const npxCli = findNpxCli(nodeBinPath);

  if (!npxCli) {
    // Fallback: npx do PATH com PATH modificado
    console.error(`[MCP azure-devops] AVISO: npx-cli.js não encontrado. Usando npx do PATH.`);
    const child = spawn(IS_WIN ? "npx.cmd" : "npx", [
      "-y", "@azure-devops/mcp", org,
      "--authentication", "envvar", "-d", "core", "work", "work-items",
    ], { stdio: "inherit", env });
    child.on("exit", (code, signal) => {
      if (signal) { process.kill(process.pid, signal); return; }
      process.exit(code || 0);
    });
    return;
  }

  console.error(`[MCP azure-devops] npx: ${npxCli}`);
  const child = spawn(nodeBinPath, [npxCli,
    "-y", "@azure-devops/mcp", org,
    "--authentication", "envvar", "-d", "core", "work", "work-items",
  ], { stdio: "inherit", env });
  child.on("exit", (code, signal) => {
    if (signal) { process.kill(process.pid, signal); return; }
    process.exit(code || 0);
  });
}
