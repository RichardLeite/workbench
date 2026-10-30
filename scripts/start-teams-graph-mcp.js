#!/usr/bin/env node
// scripts/start-teams-graph-mcp.js
// Wrapper para @floriscornel/teams-mcp com Node 22+ garantido.
// Lê TEAMS_MCP_NODE_PATH do .env (ou auto-descobre nvm) via lib compartilhada.
// Usa --experimental-require-module para contornar ERR_REQUIRE_ESM na cadeia
// html-encoding-sniffer@6 → @exodus/bytes (ESM-only).
//
// Uso no opencode.json:
//   "command": ["node", "scripts/start-teams-graph-mcp.js"]

const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

// Garante Node >= 22 (re-executa se necessário)
const nodePath = require("./lib/ensure-node-version")(22, "TEAMS_MCP_NODE_PATH");

// Localiza o binário do teams-mcp instalado localmente (devDependency)
const serverBin = path.resolve(__dirname, "..", "node_modules", "@floriscornel", "teams-mcp", "dist", "index.js");

if (!fs.existsSync(serverBin)) {
  console.error(`[MCP teams-graph] ERRO: dependência não encontrada em ${serverBin}`);
  console.error(`  Execute: npm install @floriscornel/teams-mcp`);
  process.exit(1);
}

console.error(`[MCP teams-graph] Spawn: ${nodePath} --experimental-require-module ${serverBin}`);

const child = spawn(nodePath, ["--experimental-require-module", serverBin], {
  stdio: "inherit",
  env: { ...process.env },
});

child.on("exit", (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});

child.on("error", (err) => {
  console.error(`[MCP teams-graph] Erro ao spawn: ${err.message}`);
  process.exit(1);
});
