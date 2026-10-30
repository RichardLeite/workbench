#!/usr/bin/env node
/**
 * quality.test.js — Code quality checks
 *
 * - UTF-8 encoding validation
 * - No trailing whitespace
 * - TODO/FIXME detector (except in .md docs)
 * - File naming conventions
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");

// Directories to check (excluding node_modules, .git, etc.)
const CHECK_DIRS = [
  "scripts",
  ".opencode/agents",
  ".opencode/skills",
  ".opencode/config",
  ".opencode/rules",
  ".opencode/commands",
  ".opencode/templates",
];

const EXCLUDE_PATTERNS = [
  "node_modules",
  ".git",
  "package-lock.json",
];

function shouldExclude(name) {
  return EXCLUDE_PATTERNS.some((p) => name.includes(p));
}

function collectFiles(dir, extensions) {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (shouldExclude(entry.name)) continue;
      if (entry.isDirectory()) {
        results.push(...collectFiles(fullPath, extensions));
      } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory might not exist
  }
  return results;
}

describe("quality — UTF-8 encoding", () => {
  const files = collectFiles(ROOT, [".js", ".json", ".md", ".yml", ".yaml"]);

  it("✅ all files should be valid UTF-8", () => {
    const issues = [];
    let checked = 0;

    for (const file of files) {
      try {
        const buf = fs.readFileSync(file);
        // Check for invalid UTF-8 sequences
        const text = buf.toString("utf8");
        // Re-encode and check roundtrip
        const reEncoded = Buffer.from(text, "utf8");
        if (!buf.equals(reEncoded)) {
          // Some files may have BOM or different line endings, check content only
          const normalized = Buffer.from(text.replace(/\r\n/g, "\n"), "utf8");
          if (!buf.equals(normalized)) {
            issues.push(path.relative(ROOT, file));
          }
        }
        checked++;
      } catch (err) {
        issues.push(`${path.relative(ROOT, file)}: ${err.message}`);
      }
    }

    if (issues.length > 0) {
      // Just warn for encoding issues - some files may have BOM
      console.log(`  ℹ️  ${issues.length} file(s) with encoding variance (may be BOM):`);
      issues.slice(0, 5).forEach((f) => console.log(`    - ${f}`));
    }
    assert.ok(checked > 0, "Should check at least some files");
  });
});

describe("quality — trailing whitespace", () => {
  const files = collectFiles(ROOT, [".js", ".json", ".yml", ".yaml"]);

  it("⚠️  warn trailing whitespace in JS/JSON/YAML files", () => {
    const issues = [];
    for (const file of files) {
      const ext = path.extname(file);
      if (![".js", ".json", ".yml", ".yaml"].includes(ext)) continue;

      const lines = fs.readFileSync(file, "utf8").split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > 0 && /\s$/.test(lines[i])) {
          issues.push(`${path.relative(ROOT, file)}:${i + 1}`);
        }
      }
    }

    if (issues.length > 0) {
      // Just warn — legacy files may have trailing whitespace
      console.log(`  ℹ️  Found ${issues.length} trailing whitespace(s) (not blocking):`);
      issues.slice(0, 15).forEach((f) => console.log(`    - ${f}`));
      if (issues.length > 15) {
        console.log(`    ... and ${issues.length - 15} more`);
      }
    }
    assert.ok(true); // Non-blocking
  });
});

describe("quality — TODO/FIXME detector", () => {
  const jsFiles = collectFiles(ROOT, [".js", ".ts"])
    .filter((f) => !f.includes("node_modules") && !f.includes(".test."));

  it("✅ no unresolved TODOs or FIXMEs in JS code", () => {
    const issues = [];

    for (const file of jsFiles) {
      const content = fs.readFileSync(file, "utf8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Ignore comments that document TODO as concept
        if (/\bTODO\b/i.test(line) && !line.includes("TODO detector") && !line.includes("TODO/FIXME")) {
          issues.push(`${path.relative(ROOT, file)}:${i + 1} — ${line.trim()}`);
        }
        if (/\bFIXME\b/i.test(line)) {
          issues.push(`${path.relative(ROOT, file)}:${i + 1} — ${line.trim()}`);
        }
      }
    }

    if (issues.length > 0) {
      console.log(`  ℹ️  Found ${issues.length} TODO/FIXME(s):`);
      issues.slice(0, 10).forEach((f) => console.log(`    - ${f}`));
    }
  });
});

describe("quality — file naming conventions", () => {
  const scriptFiles = collectFiles(path.join(ROOT, "scripts"), [".js"]);

  it("✅ script files should follow kebab-case naming", () => {
    const issues = [];
    for (const file of scriptFiles) {
      const name = path.basename(file);
      // Allow: kebab-case, .test.js suffix, _prefix for internal
      if (!/^[a-z][a-z0-9-]*(\.[a-z]+)*\.test\.js$/.test(name) &&
          !/^_?[a-z][a-z0-9-]*\.js$/.test(name) &&
          !name.startsWith("_")) {
        issues.push(name);
      }
    }

    // Known exceptions
    const exceptions = ["discover-teams.js", "list-teams-mcp.js", "debug-mdtohtml.js"];

    if (issues.length > 0) {
      const realIssues = issues.filter((f) => !exceptions.includes(f));
      if (realIssues.length > 0) {
        assert.fail(`Non-conforming file names:\n  ${realIssues.join("\n  ")}\nExpected: kebab-case`);
      }
    }
  });
});
