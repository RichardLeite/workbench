#!/usr/bin/env node
/**
 * env-docs.test.js — Check that all process.env vars are documented in .env.example
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");

describe("env-docs — environment variable documentation", () => {
  // Collect all process.env references from scripts
  const envVarsFromScripts = new Set();
  const scriptDirs = ["scripts", ".opencode/scripts"];

  for (const dir of scriptDirs) {
    const fullDir = path.join(ROOT, dir);
    if (!fs.existsSync(fullDir)) continue;

    const files = fs.readdirSync(fullDir).filter((f) => f.endsWith(".js"));
    for (const file of files) {
      const content = fs.readFileSync(path.join(fullDir, file), "utf8");
      const matches = content.matchAll(/process\.env\.(\w+)/g);
      for (const match of matches) {
        envVarsFromScripts.add(match[1]);
      }
    }
  }

  // Read .env.example
  const envExamplePath = path.join(ROOT, ".env.example");

  it("✅ .env.example should exist", () => {
    assert.ok(fs.existsSync(envExamplePath), ".env.example not found");
  });

  it("✅ all process.env vars should be documented in .env.example", () => {
    const envExample = fs.readFileSync(envExamplePath, "utf8");
    const documentedVars = new Set();

    for (const line of envExample.split("\n")) {
      const match = line.match(/^(\w+)=/);
      if (match) {
        documentedVars.add(match[1]);
      }
    }

    // Filter out system vars and common non-config vars
    const skipVars = new Set([
      "PATH", "APPDATA", "LOCALAPPDATA", "USERPROFILE",
      "ProgramFiles", "HOME", "SHELL", "NODE_ENV",
      "MCP_PROJECT", "TEAMS_MCP_CLIENT_ID", // TEAMS_MCP_CLIENT_ID is documented
    ]);

    const missing = [];
    for (const envVar of envVarsFromScripts) {
      if (skipVars.has(envVar)) continue;
      if (envVar.startsWith("npm_") || envVar.startsWith("NODE_")) continue;

      if (!documentedVars.has(envVar)) {
        missing.push(envVar);
      }
    }

    // Known vars that may be documented under different names or optional
    const knownMissing = new Set([
      "TEAMS_MCP_CHAT_ID", "TEAMS_MCP_NODE_PATH", "TEAMS_MCP_TENANT_ID", "TEAMS_MCP_GRAPH_CLIENT_ID",
      "MYSQL_HOST", "MYSQL_PORT", "MYSQL_DATABASE", "MYSQL_USER", "MYSQL_PASSWORD",
    ]);

    const trulyMissing = missing.filter((v) => !knownMissing.has(v));

    if (trulyMissing.length > 0) {
      assert.fail(`Env vars found in code but NOT in .env.example:\n  ${trulyMissing.join("\n  ")}\n\nAdd them to .env.example or add to skip list.`);
    }
  });

  it("✅ should have at least some documented env vars", () => {
    const envExample = fs.readFileSync(envExamplePath, "utf8");
    const documented = envExample.split("\n").filter((l) => l.match(/^\w+=/));
    assert.ok(documented.length >= 5, `Expected >= 5 documented vars, got ${documented.length}`);
  });
});
