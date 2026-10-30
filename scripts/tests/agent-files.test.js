#!/usr/bin/env node
/**
 * agent-files.test.js — Static validation tests for vision subagent .md files
 *
 * Tests verify that image-analyzer.md and ux-analyzer.md have correct frontmatter
 * (skills: ["image-pipeline"]), do not contain hardcoded /tmp/opencode/ paths,
 * and properly reference the image-pipeline skill.
 *
 * Uses Node.js built-in node:test with describe/it/assert.
 * No subprocess spawning — pure fs + regex validation.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { VISION_ERROR_PATTERNS } = require("../vision-utils");

// ── Paths ──────────────────────────────────────────────────────────────────────

const AGENTS_DIR = path.resolve(__dirname, "..", "..", ".opencode", "agents", "analysis");
const IMAGE_ANALYZER_PATH = path.join(AGENTS_DIR, "image-analyzer.md");
const UX_ANALYZER_PATH = path.join(AGENTS_DIR, "ux-analyzer.md");

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Parse YAML frontmatter from a markdown file content.
 * Simple key: value parser — handles scalar values and JSON-like arrays on a single line.
 *
 * @param {string} content — full file content
 * @returns {object} parsed frontmatter key-value pairs
 */
function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  match[1].split("\n").forEach((line) => {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) return;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key && value) {
      fm[key] = value;
    }
  });
  return fm;
}

/**
 * Read a file and return its content as a string.
 * @param {string} filePath
 * @returns {string}
 */
function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

/**
 * Convert a VISION_ERROR_PATTERN (regex string or RegExp) to a RegExp object.
 */
function patternToRegex(pattern) {
  if (pattern instanceof RegExp) return pattern;
  return new RegExp(pattern, "i");
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("agent-files — image-analyzer.md", () => {
  const content = readFile(IMAGE_ANALYZER_PATH);
  const fm = parseFrontmatter(content);

  it("1. frontmatter contains skills: [\"image-pipeline\"]", () => {
    assert.ok(fm.skills, "Expected 'skills' key in frontmatter");
    assert.strictEqual(
      fm.skills,
      `["image-pipeline"]`,
      `Expected skills to be exactly '["image-pipeline"]', got: ${fm.skills}`
    );
  });

  it("2. does NOT contain hardcoded /tmp/opencode/ or absolute temp paths", () => {
    assert.ok(
      !content.includes("/tmp/opencode/"),
      "image-analyzer.md should NOT contain hardcoded '/tmp/opencode/' path"
    );
    assert.ok(
      !/\/tmp\/opencode\b/.test(content),
      "image-analyzer.md should NOT contain any '/tmp/opencode' pattern (hardcoded temp path)"
    );
  });

  it("3. contains activation instruction for image-pipeline skill", () => {
    const body = content.slice(content.indexOf("---", 4)); // skip frontmatter
    // Strip markdown formatting (bold **, backticks) for flexible matching
    const plainBody = body.replace(/\*\*/g, "").replace(/`/g, "");
    const hasActivation =
      /ativar\s+a\s+skill\s+image-pipeline/i.test(plainBody) ||
      /image-pipeline\s+skill/i.test(plainBody);
    assert.ok(
      hasActivation,
      "image-analyzer.md body should contain skill activation instruction"
    );
  });
});

describe("agent-files — ux-analyzer.md", () => {
  const content = readFile(UX_ANALYZER_PATH);
  const fm = parseFrontmatter(content);

  it("4. frontmatter contains skills: [\"image-pipeline\"]", () => {
    assert.ok(fm.skills, "Expected 'skills' key in frontmatter");
    assert.strictEqual(
      fm.skills,
      `["image-pipeline"]`,
      `Expected skills to be exactly '["image-pipeline"]', got: ${fm.skills}`
    );
  });

  it("5. does NOT contain /tmp/opencode/ literal", () => {
    assert.ok(
      !content.includes("/tmp/opencode/"),
      "ux-analyzer.md should NOT contain hardcoded '/tmp/opencode/' path"
    );
  });
});

describe("agent-files — frontmatter parsing (both files)", () => {
  it("6. both files have valid frontmatter with required keys", () => {
    const imageContent = readFile(IMAGE_ANALYZER_PATH);
    const uxContent = readFile(UX_ANALYZER_PATH);

    const imageFm = parseFrontmatter(imageContent);
    const uxFm = parseFrontmatter(uxContent);

    // Both must have name, description, mode, skills
    const requiredKeys = ["name", "description", "mode", "skills"];

    for (const key of requiredKeys) {
      assert.ok(
        imageFm[key],
        `image-analyzer.md frontmatter missing key: '${key}'`
      );
      assert.ok(
        uxFm[key],
        `ux-analyzer.md frontmatter missing key: '${key}'`
      );
    }

    // Verify name values match filenames
    assert.strictEqual(imageFm.name, "image-analyzer");
    assert.strictEqual(uxFm.name, "ux-analyzer");

    // Verify mode is subagent for both
    assert.strictEqual(imageFm.mode, "subagent");
    assert.strictEqual(uxFm.mode, "subagent");

    // Verify both have image-pipeline skill
    assert.ok(imageFm.skills.includes("image-pipeline"));
    assert.ok(uxFm.skills.includes("image-pipeline"));
  });
});

describe("agent-files — no inline vision patterns", () => {
  it("7. image-analyzer.md does NOT contain inline vision error patterns", () => {
    const content = readFile(IMAGE_ANALYZER_PATH);
    for (const pattern of VISION_ERROR_PATTERNS) {
      const re = patternToRegex(pattern);
      assert.ok(
        !re.test(content),
        `image-analyzer.md should NOT contain inline vision error pattern: ${pattern}`
      );
    }
  });

  it("8. ux-analyzer.md does NOT contain inline vision error patterns", () => {
    const content = readFile(UX_ANALYZER_PATH);
    for (const pattern of VISION_ERROR_PATTERNS) {
      const re = patternToRegex(pattern);
      assert.ok(
        !re.test(content),
        `ux-analyzer.md should NOT contain inline vision error pattern: ${pattern}`
      );
    }
  });
});
