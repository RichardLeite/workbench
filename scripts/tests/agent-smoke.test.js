#!/usr/bin/env node
/**
 * agent-smoke.test.js — Smoke test for all agent .md files
 *
 * Validates that every agent .md file under .opencode/agents/ has:
 * - Valid YAML frontmatter (--- delimited)
 * - Required fields: name, description, mode
 * - Valid mode values (primary | subagent)
 * - Permission section if mode is primary
 * - No missing file references in opencode.json
 *
 * Run: node --test scripts/tests/agent-smoke.test.js
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const AGENTS_DIR = path.join(ROOT, ".opencode", "agents");

// ── Helpers ──────────────────────────────────────────────────────────

function walkDir(dir) {
  const files = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...walkDir(full));
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(full);
      }
    }
  } catch { /* skip missing dirs */ }
  return files;
}

function parseFrontmatter(content) {
  // Normalize Windows line endings
  const normalized = content.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const result = {};
  let currentKey = null;
  const stack = [{ obj: result, indent: -1 }];

  for (const line of yaml.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const indent = line.search(/\S/);
    const trimmed = line.trim();

    // Array item
    if (trimmed.startsWith("- ")) {
      const value = trimmed.slice(2).trim();
      const parent = stack[stack.length - 1].obj;
      if (currentKey && Array.isArray(parent[currentKey])) {
        parent[currentKey].push(
          value.startsWith('"') ? value.slice(1, -1) : value
        );
      }
      continue;
    }

    // Key: value pair
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) continue;

    const key = trimmed.slice(0, colonIdx).trim();
    const value = trimmed.slice(colonIdx + 1).trim();

    // Determine parent based on indent
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1].obj;

    if (value === "") {
      // Nested object (e.g., tools:, permission:)
      parent[key] = {};
      stack.push({ obj: parent[key], indent: indent });
      currentKey = key;
    } else if (value.startsWith("[")) {
      // YAML inline array like [repo-scan] or [meu-projeto, sample]
      // Convert to valid JSON by quoting each element
      parent[key] = parseYamlInlineArray(value);
      currentKey = null;
    } else {
      // Scalar value
      parent[key] = parseYamlScalar(value);
      currentKey = null;
    }
  }

  return result;
}

/**
 * Parse YAML inline array like [repo-scan, meu-projeto] into JavaScript array.
 * Handles unquoted strings (which are not valid JSON).
 */
function parseYamlInlineArray(str) {
  // Remove brackets and split by comma
  const inner = str.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(",").map((item) => {
    item = item.trim();
    // Remove surrounding quotes if present
    if ((item.startsWith('"') && item.endsWith('"')) ||
        (item.startsWith("'") && item.endsWith("'"))) {
      return item.slice(1, -1);
    }
    return item;
  });
}

/**
 * Parse a YAML scalar value — handles booleans, numbers, quoted strings.
 */
function parseYamlScalar(value) {
  // Quoted string
  if ((value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  // Boolean
  if (value === "true") return true;
  if (value === "false") return false;
  // Numeric
  const num = Number(value);
  if (!isNaN(num) && value !== "") return num;
  // String
  return value;
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("agent-smoke — frontmatter validation", () => {
  const agentFiles = walkDir(AGENTS_DIR);

  it(`✅ should find at least 30 agent .md files (found ${agentFiles.length})`, () => {
    assert.ok(agentFiles.length >= 30, `Expected >= 30 agent files, got ${agentFiles.length}`);
  });

  for (const filePath of agentFiles) {
    const relPath = path.relative(ROOT, filePath).replace(/\\/g, "/");
    const fileName = path.basename(filePath);

    it(`✅ ${relPath} should have valid frontmatter`, () => {
      const content = fs.readFileSync(filePath, "utf8");
      const fm = parseFrontmatter(content);

      assert.ok(fm !== null, `${relPath}: missing or invalid YAML frontmatter (--- blocks)`);
      assert.ok(fm.name, `${relPath}: missing required field 'name'`);
      assert.ok(fm.description, `${relPath}: missing required field 'description'`);
      assert.ok(fm.mode, `${relPath}: missing required field 'mode'`);

      const validModes = ["primary", "subagent"];
      assert.ok(
        validModes.includes(fm.mode),
        `${relPath}: mode '${fm.mode}' not in [${validModes.join(", ")}]`
      );

      // Validate field types
      assert.equal(
        typeof fm.name, "string",
        `${relPath}: 'name' should be string, got ${typeof fm.name}`
      );
      assert.equal(
        typeof fm.description, "string",
        `${relPath}: 'description' should be string, got ${typeof fm.description}`
      );

      // temperature must be a number if present
      if (fm.temperature !== undefined) {
        const temp = Number(fm.temperature);
        assert.ok(
          !isNaN(temp) && temp > 0 && temp <= 1,
          `${relPath}: 'temperature' should be a number between 0-1, got '${fm.temperature}'`
        );
      }
    });

    // Primary agents must have permission section with specific fields
    const content = fs.readFileSync(filePath, "utf8");
    const fm = parseFrontmatter(content);

    if (fm && fm.mode === "primary") {
      it(`✅ ${relPath} (primary) should have permission config`, () => {
        assert.ok(fm.permission, `${relPath}: primary agent missing 'permission' section`);
        assert.ok(
          typeof fm.permission === "object",
          `${relPath}: 'permission' should be an object`
        );
      });
    }
  }
});

describe("agent-smoke — cross-ref with opencode.json", () => {
  it("✅ all opencode.json agents should have corresponding .md files", () => {
    const opencode = JSON.parse(fs.readFileSync(path.join(ROOT, "opencode.json"), "utf8"));
    const agentFiles = walkDir(AGENTS_DIR);
    const agentNames = agentFiles.map((f) =>
      path.basename(f, ".md")
    );

    for (const [name, config] of Object.entries(opencode.agent)) {
      if (!config.prompt) continue;
      const match = config.prompt.match(/\{file:(.+?)\}/);
      if (!match) continue;

      const promptPath = path.join(ROOT, match[1]);
      assert.ok(
        fs.existsSync(promptPath),
        `Agent '${name}' references '${match[1]}' but file not found`
      );
    }
  });
});

describe("agent-smoke — agent-catalog.json integrity", () => {
  it("✅ all agents in catalog.json should have existing .md files", () => {
    const catalog = JSON.parse(
      fs.readFileSync(path.join(ROOT, ".opencode/config/agent-catalog.json"), "utf8")
    );

    let totalChecked = 0;
    const missing = [];

    for (const category of Object.values(catalog.categories)) {
      for (const agent of category.agents) {
        if (!agent.file) continue;
        totalChecked++;
        const filePath = path.join(ROOT, agent.file);
        if (!fs.existsSync(filePath)) {
          missing.push(`${agent.name} → ${agent.file}`);
        }
      }
    }

    assert.ok(totalChecked >= 30, `Expected >= 30 catalog agents, got ${totalChecked}`);
    if (missing.length > 0) {
      assert.fail(`Missing .md files:\n  ${missing.join("\n  ")}`);
    }
  });

  it("✅ all catalog agents should have name, description, mode, tier", () => {
    const catalog = JSON.parse(
      fs.readFileSync(path.join(ROOT, ".opencode/config/agent-catalog.json"), "utf8")
    );

    const issues = [];
    for (const [catKey, category] of Object.entries(catalog.categories)) {
      for (const agent of category.agents) {
        if (!agent.name) issues.push(`${catKey}: agent missing 'name'`);
        if (!agent.description) issues.push(`${catKey}/${agent.name}: missing 'description'`);
        if (!agent.mode) issues.push(`${catKey}/${agent.name}: missing 'mode'`);
        if (agent.tier === undefined) issues.push(`${catKey}/${agent.name}: missing 'tier'`);
        if (!agent.file) issues.push(`${catKey}/${agent.name}: missing 'file'`);
      }
    }

    if (issues.length > 0) {
      assert.fail(`Catalog issues:\n  ${issues.join("\n  ")}`);
    }
  });
});
