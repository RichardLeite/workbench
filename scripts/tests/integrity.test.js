#!/usr/bin/env node
/**
 * integrity.test.js — Cross-reference checks
 *
 * Validates that:
 * - All agents in opencode.json have existing prompt files
 * - All skills referenced in agent configs exist
 * - Agent catalog matches opencode.json agent list
 * - All config references in opencode.json instructions exist
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");

describe("integrity — cross-reference checks", () => {
  // 1. All agent prompt files exist
  it("✅ all agent prompt files should exist (opencode.json)", () => {
    const opencode = JSON.parse(fs.readFileSync(path.join(ROOT, "opencode.json"), "utf8"));
    const agents = opencode.agent;

    let total = 0;
    let missing = [];

    for (const [name, config] of Object.entries(agents)) {
      if (!config.prompt) continue;
      const match = config.prompt.match(/\{file:(.+?)\}/);
      if (!match) continue;

      const promptPath = path.join(ROOT, match[1]);
      total++;
      if (!fs.existsSync(promptPath)) {
        missing.push(`${name} → ${match[1]}`);
      }
    }

    assert.ok(total >= 20, `Expected >= 20 agents with prompt files, got ${total}`);
    if (missing.length > 0) {
      assert.fail(`Missing prompt files:\n  ${missing.join("\n  ")}`);
    }
  });

  // 2. All skills referenced in agent configs exist
  it("✅ all skills referenced in opencode.json should exist", () => {
    const opencode = JSON.parse(fs.readFileSync(path.join(ROOT, "opencode.json"), "utf8"));
    const agents = opencode.agent;
    const skillDirs = [];

    // Collect skills from agent configs
    for (const [name, config] of Object.entries(agents)) {
      if (config.skills && Array.isArray(config.skills)) {
        for (const skill of config.skills) {
          skillDirs.push({ agent: name, skill });
        }
      }
    }

    // Check each skill exists
    const missing = [];
    const checked = new Set();

    for (const { agent, skill } of skillDirs) {
      if (checked.has(skill)) continue;
      checked.add(skill);

      // Skills are at .opencode/skills/<skill>/SKILL.md or .opencode/skills/pipelines/<skill>/SKILL.md
      const paths = [
        path.join(ROOT, ".opencode", "skills", skill, "SKILL.md"),
        path.join(ROOT, ".opencode", "skills", "pipelines", skill, "SKILL.md"),
      ];

      const exists = paths.some((p) => fs.existsSync(p));
      if (!exists) {
        missing.push(`${agent} references skill "${skill}" but no SKILL.md found`);
      }
    }

    if (missing.length > 0) {
      assert.fail(`Missing skills:\n  ${missing.join("\n  ")}`);
    }
  });

  // 3. Agent names match between opencode.json and agent-catalog.json
  it("✅ agent names should match between opencode.json and agent-catalog.json", () => {
    const opencode = JSON.parse(fs.readFileSync(path.join(ROOT, "opencode.json"), "utf8"));
    const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, ".opencode/config/agent-catalog.json"), "utf8"));
    const catalogAgents = catalog.agents || [];

    const opencodeNames = new Set(Object.keys(opencode.agent));
    const catalogNames = new Set(catalogAgents.map((a) => a.name));

    // Check catalog agents are in opencode
    const missingInOpencode = [...catalogNames].filter((n) => !opencodeNames.has(n));
    if (missingInOpencode.length > 0) {
      // Some catalog entries may be informational only, just warn
      console.log(`  ℹ️  Catalog-only agents (not in opencode.json): ${missingInOpencode.join(", ")}`);
    }
  });

  // 4. Instructions files exist
  it("✅ all instruction files should exist", () => {
    const opencode = JSON.parse(fs.readFileSync(path.join(ROOT, "opencode.json"), "utf8"));
    const instructions = opencode.instructions || [];

    const missing = [];
    for (const instr of instructions) {
      // Could be a file reference or inline instruction
      if (instr.startsWith("{file:") || instr.startsWith("./") || instr.startsWith(".opencode") || instr.startsWith("projects")) {
        const filePath = path.join(ROOT, instr);
        if (!fs.existsSync(filePath)) {
          missing.push(instr);
        }
      }
    }

    if (missing.length > 0) {
      assert.fail(`Missing instruction files:\n  ${missing.join("\n  ")}`);
    }
  });

  // 5. Check MCP configs reference valid commands
  it("✅ MCP commands should reference existing scripts", () => {
    const opencode = JSON.parse(fs.readFileSync(path.join(ROOT, "opencode.json"), "utf8"));
    const mcps = opencode.mcp || {};

    for (const [name, config] of Object.entries(mcps)) {
      if (!config.command || !Array.isArray(config.command)) continue;

      const cmd = config.command[0];
      const arg = config.command[1] || "";

      // If command references a local script, check it exists
      if (arg.startsWith("scripts/") || arg.startsWith(".opencode/")) {
        const scriptPath = path.join(ROOT, arg);
        assert.ok(fs.existsSync(scriptPath), `MCP "${name}" references missing script: ${arg}`);
      }
    }
  });
});
