#!/usr/bin/env node
// list-teams-mcp.js — Start teams-graph MCP and list teams/channels
const { spawn } = require("child_process");

const mcp = spawn("npx.cmd", ["-y", "@floriscornel/teams-mcp@0.9.0"], {
  stdio: ["pipe", "pipe", "inherit"],
  env: {
    ...process.env,
    TEAMS_MCP_CLIENT_ID: process.env.TEAMS_MCP_CLIENT_ID || "",
  },
});

let buffer = "";
let requestId = 1;

mcp.stdout.on("data", (data) => {
  buffer += data.toString();
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      handleMessage(msg);
    } catch (e) {
      // ignore partial lines
    }
  }
});

function send(method, params = {}) {
  const id = requestId++;
  const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params });
  mcp.stdin.write(msg + "\n");
  return id;
}

let pending = [];

function handleMessage(msg) {
  if (msg.id) {
    const resolve = pending.find((p) => p.id === msg.id);
    if (resolve) {
      resolve.cb(msg);
      pending = pending.filter((p) => p.id !== msg.id);
    }
  }
}

function request(method, params = {}) {
  return new Promise((resolve) => {
    const id = send(method, params);
    pending.push({ id, cb: resolve });
  });
}

async function main() {
  // Wait for initialize
  await request("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "discover", version: "1.0.0" },
  });
  console.error("✅ MCP initialized");

  // Send initialized notification
  mcp.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) +
      "\n"
  );

  // List teams
  const teamsResp = await request("tools/call", {
    name: "list_teams",
    arguments: {},
  });

  if (teamsResp.error) {
    console.error("❌ Error listing teams:", teamsResp.error);
    mcp.kill();
    process.exit(1);
  }

  const teamsContent = teamsResp.result?.content?.[0]?.text || "[]";
  const teams = JSON.parse(teamsContent);

  if (teams.length === 0) {
    console.log("Nenhum time encontrado.");
    mcp.kill();
    process.exit(0);
  }

  console.log(`📋 ${teams.length} time(s) encontrado(s):\n`);

  for (const team of teams) {
    const teamId = team.id;
    console.log(`━━━ ${team.displayName} ━━━`);
    console.log(`   ID: ${team.id}`);

    // List channels
    const chResp = await request("tools/call", {
      name: "list_channels",
      arguments: { teamId },
    });

    if (!chResp.error) {
      const chContent = chResp.result?.content?.[0]?.text || "[]";
      const channels = JSON.parse(chContent);
      for (const ch of channels) {
        console.log(`   📢 ${ch.displayName}`);
        console.log(`      ID: ${ch.id}`);
        console.log(`      Topic: ${ch.description || "—"}`);
        console.log("");
      }
    }
  }

  mcp.kill();
}

main().catch((err) => {
  console.error("❌ Erro:", err.message);
  mcp.kill();
  process.exit(1);
});
