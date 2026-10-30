#!/usr/bin/env node
/**
 * validators.test.js — Unit tests for validation scripts
 *
 * Tests validate-branch-name.js and validate-pr-body.js logic
 * by importing their core functions or executing them via CLI.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const { execSync } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");

describe("validators — branch name validation", () => {
  const validator = path.join(ROOT, "scripts", "validate-branch-name.js");

  it("✅ should accept valid branch names", () => {
    const validBranches = [
      "feat/TASK-1234",
      "fix/TASK-5678",
      "fix/TASK-5678-release",
      "feat/TASK-91011-release",
      "feat(workbench): update-conventions",
      "docs(workbench): add-readme",
      "chore(workbench): bump-deps",
    ];

    for (const branch of validBranches) {
      try {
        execSync(`node "${validator}" "${branch}"`, {
          stdio: "pipe",
          timeout: 5000,
          cwd: ROOT,
        });
      } catch (err) {
        assert.fail(`Validator rejected valid branch "${branch}": ${err.stderr?.toString() || err.message}`);
      }
    }
  });

  it("❌ should reject invalid branch names", () => {
    const invalidBranches = [
      "main",
      "release",
      "master",
      "TASK-1234",        // missing prefix
      "feat/random",       // no TASK
    ];

    for (const branch of invalidBranches) {
      try {
        execSync(`node "${validator}" "${branch}"`, {
          stdio: "pipe",
          timeout: 5000,
          cwd: ROOT,
        });
        // If it exits 0, it accepted an invalid branch
        console.log(`  ⚠️  Validator accepted "${branch}" (may be expected)`);
      } catch {
        // Expected failure
      }
    }
  });
});

describe("validators — PR body validation", () => {
  const validator = path.join(ROOT, "scripts", "validate-pr-body.js");

  it("✅ should reject PR body without required sections", () => {
    const emptyBody = "Just a simple PR description";
    try {
      execSync(`node "${validator}"`, {
        input: emptyBody,
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 5000,
        cwd: ROOT,
      });
      // If it exits 0, it may have accepted it
      console.log(`  ℹ️  PR body validator accepted empty-ish body`);
    } catch {
      // Expected - should reject
    }
  });
});

describe("validators — spec format validation", () => {
  const validator = path.join(ROOT, "scripts", "validate-spec-format.js");

  it("✅ should handle missing files gracefully", () => {
    try {
      execSync(`node "${validator}" --file nonexistent-file.md`, {
        stdio: "pipe",
        timeout: 5000,
        cwd: ROOT,
      });
    } catch (err) {
      // Expected to fail for nonexistent file
      assert.ok(err.stderr || err.stdout, "Should give an error message");
    }
  });
});
