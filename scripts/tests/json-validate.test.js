#!/usr/bin/env node
/**
 * json-validate.test.js — Validate all JSON config files
 *
 * Checks that all JSON files in .opencode/config/ and root are valid JSON.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");

const JSON_FILES = [
  "opencode.json",
  ".opencode/config/agent-catalog.json",
  ".opencode/config/project-mapping.json",
  ".opencode/config/eligible-reviewers.json",
  ".opencode/config/branch-conventions.json",
  ".opencode/config/commit-conventions.json",
  ".opencode/config/pipeline-rules.json",
];

describe("json-validate — JSON config files", () => {
  for (const relPath of JSON_FILES) {
    const fullPath = path.join(ROOT, relPath);

    it(`✅ should be valid JSON — ${relPath}`, () => {
      assert.ok(fs.existsSync(fullPath), `File not found: ${relPath}`);
      const content = fs.readFileSync(fullPath, "utf8");
      try {
        JSON.parse(content);
      } catch (err) {
        assert.fail(`Invalid JSON in ${relPath}: ${err.message}`);
      }
    });

    // Also check it has some expected structure
    if (relPath === "opencode.json") {
      it(`✅ opencode.json should have required sections`, () => {
        const content = fs.readFileSync(fullPath, "utf8");
        const data = JSON.parse(content);
        assert.ok(data.agent, "Missing 'agent' section");
        assert.ok(data.mcp, "Missing 'mcp' section");
        assert.ok(data.instructions, "Missing 'instructions' section");
        assert.ok(data.reference, "Missing 'reference' section");

        // Check agent count
        const agentCount = Object.keys(data.agent).length;
        assert.ok(agentCount >= 20, `Expected >= 20 agents, got ${agentCount}`);
      });
    }

    if (relPath === ".opencode/config/agent-catalog.json") {
      it(`✅ agent-catalog.json should have categories with agents`, () => {
        const data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
        assert.ok(data.categories, "Missing 'categories' section");
        assert.ok(data.total_agents, "Missing 'total_agents'");
        assert.ok(typeof data.categories === "object", "'categories' must be an object");

        // Collect all agents from all categories
        const allAgents = [];
        for (const [catName, cat] of Object.entries(data.categories)) {
          assert.ok(Array.isArray(cat.agents), `Category "${catName}" missing 'agents' array`);
          for (const agent of cat.agents) {
            assert.ok(agent.name, `Agent missing 'name' in category "${catName}"`);
            assert.ok(agent.description, `Agent ${agent.name} missing 'description'`);
            assert.ok(agent.mode, `Agent ${agent.name} missing 'mode'`);
            allAgents.push(agent);
          }
        }

        assert.ok(allAgents.length >= 25, `Expected >= 25 agents across categories, got ${allAgents.length}`);
        assert.strictEqual(allAgents.length, data.total_agents,
          `total_agents (${data.total_agents}) != actual count (${allAgents.length})`);
      });
    }

    if (relPath === ".opencode/config/project-mapping.json") {
      it(`✅ project-mapping.json should have projects`, () => {
        const data = JSON.parse(fs.readFileSync(fullPath, "utf8"));
        assert.ok(data.projects, "Missing 'projects' section");
        const projectCount = Object.keys(data.projects).length;
        assert.ok(projectCount >= 1, `Expected >= 1 project, got ${projectCount}`);
      });
    }
  }
});
