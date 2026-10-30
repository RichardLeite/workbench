#!/usr/bin/env node
/**
 * opencode-config.test.js — Tests for opencode.json mcp-image configuration
 *
 * Validates that the mcp-image MCP server is correctly configured and that
 * vision-related permissions are properly scoped to image-analyzer and
 * ux-analyzer agents (zero coupling with Orquestrador).
 *
 * Uses Node.js built-in node:test with describe/it/assert.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const config = JSON.parse(
  fs.readFileSync(path.join(ROOT, "opencode.json"), "utf8")
);

describe("opencode.json — mcp-image configuration", () => {
  it("should have mcp-image type set to 'local'", () => {
    assert.strictEqual(config.mcp["mcp-image"].type, "local");
  });

  it("should have mcp-image command pointing to node scripts/mcp-image.js", () => {
    const cmd = config.mcp["mcp-image"].command;
    assert.ok(Array.isArray(cmd), "command should be an array");
    assert.strictEqual(cmd[0], "node");
    assert.strictEqual(cmd[1], "scripts/mcp-image.js");
  });

  it("should have mcp-image enabled set to true", () => {
    assert.strictEqual(config.mcp["mcp-image"].enabled, true);
  });
});

describe("opencode.json — image-analyzer agent permissions", () => {
  const perms = config.agent["image-analyzer"].permission;

  it("should allow all 4 mcp-image tools for image-analyzer", () => {
    assert.strictEqual(perms["mcp-image__image_save"], "allow");
    assert.strictEqual(perms["mcp-image__image_get_dir"], "allow");
    assert.strictEqual(perms["mcp-image__image_validate"], "allow");
    assert.strictEqual(perms["mcp-image__check_vision_error"], "allow");
  });
});

describe("opencode.json — ux-analyzer agent permissions", () => {
  const perms = config.agent["ux-analyzer"].permission;

  it("should allow all 4 mcp-image tools for ux-analyzer", () => {
    assert.strictEqual(perms["mcp-image__image_save"], "allow");
    assert.strictEqual(perms["mcp-image__image_get_dir"], "allow");
    assert.strictEqual(perms["mcp-image__image_validate"], "allow");
    assert.strictEqual(perms["mcp-image__check_vision_error"], "allow");
  });
});

describe("opencode.json — Orquestrador zero coupling with mcp-image", () => {
  it("should have NO permission key starting with 'mcp-image__' for Orquestrador", () => {
    const perms = config.agent["Orquestrador"].permission;
    const mcpImageKeys = Object.keys(perms).filter((k) =>
      k.startsWith("mcp-image__")
    );
    assert.strictEqual(
      mcpImageKeys.length,
      0,
      `Orquestrador should have zero mcp-image permissions, found: ${mcpImageKeys.join(", ")}`
    );
  });
});

describe("orquestrador.md — Delegation Matrix: image-pipeline", () => {
  it("should contain 'image-pipeline' in the skills delegation table", () => {
    const skillsPath = path.join(
      ROOT,
      ".opencode",
      "agents",
      "core",
      "orquestrador.md"
    );
    const content = fs.readFileSync(skillsPath, "utf8");
    assert.ok(
      content.includes("image-pipeline"),
      "orquestrador.md should reference 'image-pipeline' in the Delegation Matrix"
    );
  });
});

describe("opencode.json — key order integrity", () => {
  it("should have mcp-image at the end of the mcp block", () => {
    const config = JSON.parse(
      require("fs").readFileSync(
        path.join(__dirname, "..", "..", "opencode.json"),
        "utf8"
      )
    );
    const mcpKeys = Object.keys(config.mcp);
    const imageIdx = mcpKeys.indexOf("mcp-image");
    assert.ok(imageIdx >= 0, "mcp-image should exist in mcp block");
    // mcp-image should be the last entry
    assert.strictEqual(
      imageIdx,
      mcpKeys.length - 1,
      `mcp-image should be last in mcp block; position ${imageIdx} of ${mcpKeys.length}, keys: ${mcpKeys.join(", ")}`
    );
  });
});
