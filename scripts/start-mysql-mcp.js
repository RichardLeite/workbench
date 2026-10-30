#!/usr/bin/env node
// mysql-mcp-server wrapper genérico — para qualquer projeto
// Uso: node scripts/start-mysql-mcp.js <project-name>
// Ex:  node scripts/start-mysql-mcp.js meu-projeto

const { spawn, spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");

const IS_WIN = process.platform === "win32";
const NODE_MIN = 20;
const NODE_EXE = IS_WIN ? "node.exe" : "node";
const NPX_CLI_FILE = "npx-cli.js";

// ── FASE 0: Identificar projeto ─────────────────────────────

const projectName = process.argv[2] || process.env.MCP_PROJECT || "";

if (!projectName) {
  console.error(`[MCP] ERRO: informe o nome do projeto.`);
  console.error(`  Uso: node scripts/start-mysql-mcp.js <project>`);
  console.error(`  Ex:  node scripts/start-mysql-mcp.js meu-projeto`);
  console.error(`  Ou defina env MCP_PROJECT=<project>`);
  process.exit(1);
}

// ── FASE 0.5: Carregar .env do projeto ─────────────────────

const workbenchRoot = path.resolve(__dirname, "..");

// Resolve o diretório do repositório a partir de project-mapping.json
let repoDir = projectName;
try {
  const mappingPath = path.join(workbenchRoot, ".opencode", "config", "project-mapping.json");
  const mapping = JSON.parse(fs.readFileSync(mappingPath, "utf8"));
  const project = mapping.projects && mapping.projects[projectName];
  const repos = project && project.repos ? Object.values(project.repos) : [];
  if (repos.length) repoDir = repos[0];
} catch { /* usa o nome informado como diretório */ }

(function loadEnv() {
  const envPath = path.resolve(workbenchRoot, repoDir, ".env");

  if (!fs.existsSync(envPath)) {
    console.error(`[MCP ${projectName}] ERRO: .env não encontrado em ${envPath}`);
    console.error(`  Crie o arquivo .env em ${repoDir}/ com as credenciais do MySQL.`);
    process.exit(1);
  }

  const content = fs.readFileSync(envPath, "utf8");
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim();
    process.env[key] = val.replace(/^['"]|['"]$/g, "");
  }
})();

// ── FASE 1: Garantir Node >= 20 ───────────────────────────────

const currentMajor = parseInt(process.version.replace("v", "").split(".")[0], 10);

if (currentMajor < NODE_MIN) {
  const node20Path = findNode20();
  if (!node20Path) {
    console.error(`[MCP ${projectName}] ERRO: Node.js ${NODE_MIN}+ é obrigatório.`);
    console.error(`  Versão atual: ${process.version}`);
    process.exit(1);
  }
  console.error(`[MCP ${projectName}] Node ${process.version} → respawn com ${node20Path}`);
  const result = spawnSync(node20Path, process.argv.slice(1), {
    stdio: "inherit",
    env: { ...process.env },
  });
  process.exit(result.status);
}

startMCPServer(process.execPath);

// ── FUNÇÕES ──────────────────────────────────────────────────

function findNode20() {
  const candidates = [];
  function testVersion(nodePath) {
    try {
      const r = spawnSync(nodePath, ["--version"], {
        encoding: "utf8", timeout: 10000, stdio: ["ignore", "pipe", "pipe"],
      });
      if (r.status !== 0) return;
      const ver = (r.stdout || "").trim();
      const major = parseInt(ver.replace("v", "").split(".")[0], 10);
      if (major >= NODE_MIN && !candidates.some((c) => c.path === nodePath)) {
        candidates.push({ path: nodePath, version: ver, major });
      }
    } catch { /* ignore */ }
  }

  function scanDir(dirPath, buildPathFn) {
    if (!fs.existsSync(dirPath)) return;
    try {
      for (const entry of fs.readdirSync(dirPath).sort().reverse()) {
        const major = parseInt(entry.replace(/^v/, "").split(".")[0], 10);
        if (major >= NODE_MIN) {
          const nodePath = buildPathFn(entry);
          if (fs.existsSync(nodePath)) testVersion(nodePath);
        }
      }
    } catch { /* ignore */ }
  }

  if (IS_WIN) {
    const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
    scanDir(path.join(appData, "nvm"), (ver) => path.join(appData, "nvm", ver, NODE_EXE));
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
    scanDir(path.join(localAppData, "fnm", "node-versions"),
      (ver) => path.join(localAppData, "fnm", "node-versions", ver, "installation", NODE_EXE));
  } else {
    scanDir(path.join(os.homedir(), ".nvm", "versions", "node"),
      (ver) => path.join(os.homedir(), ".nvm", "versions", "node", ver, "bin", NODE_EXE));
    for (const base of [
      path.join(os.homedir(), ".local", "share", "fnm", "node-versions"),
      path.join(os.homedir(), ".fnm", "node-versions"),
    ]) {
      scanDir(base, (ver) => path.join(base, ver, "installation", "bin", NODE_EXE));
    }
    scanDir(path.join(os.homedir(), ".asdf", "installs", "nodejs"),
      (ver) => path.join(os.homedir(), ".asdf", "installs", "nodejs", ver, "bin", NODE_EXE));
  }

  const visited = new Set();
  for (const dir of (process.env.PATH || "").split(path.delimiter)) {
    const normalized = path.resolve(dir.trim());
    if (!normalized || visited.has(normalized)) continue;
    visited.add(normalized);
    const nodePath = path.join(normalized, NODE_EXE);
    if (fs.existsSync(nodePath)) testVersion(nodePath);
  }

  const installPaths = IS_WIN
    ? [
        path.join(process.env.ProgramFiles || "C:\\Program Files", "nodejs", NODE_EXE),
        path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "nodejs", NODE_EXE),
        path.join("C:\\ProgramData\\chocolatey\\lib\\nodejs\\tools", NODE_EXE),
      ]
    : ["/usr/local/bin/node", "/usr/bin/node", "/opt/nodejs/current/bin/node",
       "/opt/node/bin/node", "/snap/bin/node"];

  for (const p of installPaths) { if (fs.existsSync(p)) testVersion(p); }

  candidates.sort((a, b) => {
    const nums = (v) => v.version.replace("v", "").split(".").map(Number);
    const [a1, a2, a3] = nums(a);
    const [b1, b2, b3] = nums(b);
    return b1 - a1 || b2 - a2 || b3 - a3;
  });

  return candidates[0]?.path || null;
}

function findNpxCli(nodeBinPath) {
  const nodeDir = path.dirname(nodeBinPath);
  const p1 = path.resolve(nodeDir, "..", "lib", "node_modules", "npm", "bin", NPX_CLI_FILE);
  if (fs.existsSync(p1)) return p1;
  const p2 = path.resolve(nodeDir, "node_modules", "npm", "bin", NPX_CLI_FILE);
  if (fs.existsSync(p2)) return p2;
  const p3 = path.resolve(nodeDir, "..", "node_modules", "npm", "bin", NPX_CLI_FILE);
  if (fs.existsSync(p3)) return p3;
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

function clearStaleNpxCache() {
  const npxCacheDir = path.join(os.homedir(), ".npm", "_npx");
  if (!fs.existsSync(npxCacheDir)) return;
  let removed = 0;
  try {
    for (const entry of fs.readdirSync(npxCacheDir)) {
      const entryPath = path.join(npxCacheDir, entry);
      try { if (!fs.statSync(entryPath).isDirectory()) continue; } catch { continue; }
      const mcpDir = path.join(entryPath, "node_modules", "mysql-mcp-server");
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
                if (match && parseInt(match[1], 10) > currentMajor) stale = true;
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
                    try { for (const sp of fs.readdirSync(subPath)) walkDirs.push(path.join(subPath, sp)); } catch { /* ignore */ }
                  } else { walkDirs.push(subPath); }
                }
              }
            } catch { /* ignore */ }
          }
        }
      } catch { stale = true; }
      if (stale) {
        try { fs.rmSync(entryPath, { recursive: true, force: true }); removed++; } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }
  if (removed > 0) console.error(`[MCP ${projectName}] ${removed} entrada(s) de cache limpa(s).`);
}

function buildMcpEnv(nodeBinPath, dbConfig) {
  const nodeDir = path.dirname(nodeBinPath);
  return {
    ...process.env,
    PATH: nodeDir + path.delimiter + (process.env.PATH || ""),
    MYSQL_HOST: dbConfig.host,
    MYSQL_PORT: dbConfig.port,
    MYSQL_DATABASE: dbConfig.database,
    MYSQL_USER: dbConfig.user,
    MYSQL_PASSWORD: dbConfig.password,
  };
}

function loadDatabaseConfig() {
  // Tenta database.js específico do projeto
  const dbConfigPaths = [
    path.resolve(workbenchRoot, repoDir, "src", "config", "database"),
    path.resolve(workbenchRoot, repoDir, "src", "config", "database.js"),
    path.resolve(workbenchRoot, repoDir, "config", "database.js"),
    path.resolve(workbenchRoot, repoDir, "database.js"),
  ];

  for (const cfgPath of dbConfigPaths) {
    try {
      const resolved = require(cfgPath);
      // Pode ser função (env-aware) ou objeto
      const config = typeof resolved === "function" ? resolved() : resolved;
      return {
        host: config.host || config.MYSQL_HOST || "localhost",
        port: String(config.port || config.MYSQL_PORT || 3306),
        database: config.database || config.MYSQL_DATABASE || "",
        user: config.username || config.user || config.MYSQL_USER || "root",
        password: config.password || config.MYSQL_PASSWORD || "",
      };
    } catch { /* try next */ }
  }

  // Fallback: variáveis de ambiente
  return {
    host: process.env.MYSQL_HOST || "localhost",
    port: process.env.MYSQL_PORT || "3306",
    database: process.env.MYSQL_DATABASE || "",
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
  };
}

function startMCPServer(nodeBinPath) {
  const dbConfig = loadDatabaseConfig();

  if (!dbConfig.database) {
    console.error(`[MCP ${projectName}] ERRO: database não configurado.`);
    console.error(`  Defina MYSQL_DATABASE no .env ou configure database no database.js`);
    process.exit(1);
  }

  clearStaleNpxCache();
  console.error(`[MCP ${projectName}] Iniciando (${process.version})...`);
  console.error(`[MCP ${projectName}] Conectando ao MySQL:`);
  console.error(`  Host: ${dbConfig.host}`);
  console.error(`  Port: ${dbConfig.port}`);
  console.error(`  Database: ${dbConfig.database}`);
  console.error(`  User: ${dbConfig.user}`);

  const env = buildMcpEnv(nodeBinPath, dbConfig);
  const npxCli = findNpxCli(nodeBinPath);

  if (!npxCli) {
    console.error(`[MCP ${projectName}] AVISO: npx-cli.js não encontrado. Usando npx do PATH.`);
    const child = spawn(IS_WIN ? "npx.cmd" : "npx", ["-y", "mysql-mcp-server"], {
      stdio: "inherit", env,
    });
    child.on("exit", (code, signal) => {
      if (signal) { process.kill(process.pid, signal); return; }
      process.exit(code || 0);
    });
    return;
  }

  console.error(`[MCP ${projectName}] npx: ${npxCli}`);
  const child = spawn(nodeBinPath, [npxCli, "-y", "mysql-mcp-server"], {
    stdio: "inherit", env,
  });
  child.on("exit", (code, signal) => {
    if (signal) { process.kill(process.pid, signal); return; }
    process.exit(code || 0);
  });
}
