#!/usr/bin/env node
// discover-teams.js — Lista times e canais do Teams via Graph API
// Usa o cache de autenticação do @floriscornel/teams-mcp

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const AUTH_FILE = path.join(
  process.env.USERPROFILE || process.env.HOME,
  ".msgraph-mcp-auth.json"
);

async function main() {
  // 1. Check if auth exists
  if (!fs.existsSync(AUTH_FILE)) {
    console.error("❌ Auth file not found. Run authenticate first.");
    process.exit(1);
  }

  const auth = JSON.parse(fs.readFileSync(AUTH_FILE, "utf8"));
  console.log(`👤 Autenticado como: ${auth.account || "desconhecido"}`);
  console.log(`📁 Auth file: ${AUTH_FILE}\n`);

  // 2. Use the teams-mcp CLI's cached token to fetch teams
  // We'll use npx to run a small inline script
  const token = auth.accessToken || auth.token;

  if (!token) {
    console.log("⚠️ Token não encontrado no cache. Tentando renovar...");
    // Fallback: run the MCP server and send it a tools/call
    console.log(
      "Use o MCP 'teams-graph' no OpenCode para listar os times."
    );
    console.log("Comando alternativo: npx @floriscornel/teams-mcp@0.9.0");
    process.exit(0);
  }

  // Fetch teams using Graph API
  const teamsUrl = "https://graph.microsoft.com/v1.0/me/joinedTeams";
  const teamResp = await fetch(teamsUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!teamResp.ok) {
    console.error(`❌ Erro ao buscar times: ${teamResp.status}`);
    console.error(await teamResp.text());
    process.exit(1);
  }

  const teamsData = await teamResp.json();
  const teams = teamsData.value || [];

  if (teams.length === 0) {
    console.log("⚠️ Nenhum time encontrado.");
    process.exit(0);
  }

  console.log(`📋 ${teams.length} time(s) encontrado(s):\n`);

  for (const team of teams) {
    console.log(`━━━ ${team.displayName} ━━━`);
    console.log(`   ID: ${team.id}`);
    console.log(`   Description: ${team.description || "—"}`);

    // Fetch channels for this team
    const chUrl = `https://graph.microsoft.com/v1.0/teams/${team.id}/channels`;
    const chResp = await fetch(chUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (chResp.ok) {
      const chData = await chResp.json();
      const channels = chData.value || [];
      for (const ch of channels) {
        console.log(`   📢 ${ch.displayName} (ID: ${ch.id})`);
      }
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error("❌ Erro:", err.message);
  process.exit(1);
});
