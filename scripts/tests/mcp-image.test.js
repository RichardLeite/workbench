#!/usr/bin/env node
/**
 * mcp-image.test.js — Integration tests for scripts/mcp-image.js
 *
 * Tests spawn the MCP server as a subprocess and communicate via JSON-RPC 2.0
 * over stdio. Covers handshake, all 4 tools (image_get_dir, image_validate,
 * check_vision_error, image_save with path/url/ado sources), and robustness.
 *
 * Uses Node.js built-in node:test with describe/it/assert.
 * HTTP mocking via nock for url and ado source tests.
 */

const { describe, it, before, after, afterEach } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");

const mcpPath = path.resolve(__dirname, "..", "mcp-image.js");
const VISION_DIR = path.join(os.tmpdir(), "opencode");

// Track all spawned processes for cleanup
const spawnedProcs = new Set();

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Spawn the MCP server as a child process.
 */
function spawnMCP() {
  const proc = spawn("node", [mcpPath], {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env },
  });
  spawnedProcs.add(proc);
  proc.on("exit", () => spawnedProcs.delete(proc));
  return proc;
}

/**
 * Kill a spawned MCP process and clean up its streams.
 */
function killProc(proc) {
  if (!proc) return;
  try {
    proc.stdin.destroy();
    proc.stdout.destroy();
    proc.stderr.destroy();
  } catch { /* best-effort */ }
  try {
    proc.kill("SIGKILL");
  } catch { /* already dead */ }
  spawnedProcs.delete(proc);
}

/**
 * Send a JSON-RPC request to the MCP process and wait for a response.
 * Resolves with the parsed JSON response object.
 */
function sendRequest(proc, req) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      killProc(proc);
      reject(new Error("timeout waiting for MCP response"));
    }, 10000);

    let data = "";
    const onData = (chunk) => {
      data += chunk.toString();
      try {
        const parsed = JSON.parse(data);
        proc.stdout.removeListener("data", onData);
        clearTimeout(timeout);
        resolve(parsed);
      } catch (_e) {
        // incomplete chunk — wait for more
      }
    };
    proc.stdout.on("data", onData);
    proc.stdin.write(JSON.stringify(req) + "\n");
  });
}

/**
 * Create a minimal valid 1x1 PNG file at the given path.
 * PNG magic: 89 50 4E 47 0D 0A 1A 0A + minimal IHDR + IDAT + IEND.
 */
function createMinimalPNG(filePath) {
  // Minimal valid PNG: 1x1 pixel, RGBA, all zeros
  const png = Buffer.from([
    // PNG signature
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
    // IHDR chunk (length=13, type=IHDR, 1x1, 8-bit RGBA)
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89,
    // IDAT chunk (minimal compressed data)
    0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54,
    0x78, 0x9C, 0x62, 0x00, 0x00, 0x00, 0x02, 0x00,
    0x01, 0xE5, 0x27, 0xDE, 0xFC,
    // IEND chunk
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,
    0xAE, 0x42, 0x60, 0x82,
  ]);
  fs.writeFileSync(filePath, png);
  return png;
}

/**
 * Clean up vision temp files created during tests.
 */
function cleanupVisionFiles() {
  if (!fs.existsSync(VISION_DIR)) return;
  const files = fs.readdirSync(VISION_DIR);
  for (const f of files) {
    if (f.startsWith("vision-") || f === "test-fixture.png") {
      try { fs.unlinkSync(path.join(VISION_DIR, f)); } catch { /* best-effort */ }
    }
  }
}

// ── Group: Handshake ───────────────────────────────────────────────────────────

describe("mcp-image — Handshake", () => {
  let proc;

  afterEach(() => {
    if (proc) { killProc(proc); proc = null; }
  });

  it("1. initialize: response has result.serverInfo.name === 'mcp-image'", async () => {
    proc = spawnMCP();
    const res = await sendRequest(proc, {
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: { protocolVersion: "2024-11-05" },
    });
    assert.strictEqual(res.jsonrpc, "2.0");
    assert.strictEqual(res.id, 1);
    assert.strictEqual(res.result.serverInfo.name, "mcp-image");
    assert.strictEqual(res.result.protocolVersion, "2024-11-05");
  });

  it("2. tools/list: result.tools has 4 tools", async () => {
    proc = spawnMCP();
    const res = await sendRequest(proc, {
      jsonrpc: "2.0", id: 2, method: "tools/list",
    });
    assert.strictEqual(res.jsonrpc, "2.0");
    assert.strictEqual(res.id, 2);
    assert.ok(Array.isArray(res.result.tools));
    assert.strictEqual(res.result.tools.length, 4);
    const names = res.result.tools.map((t) => t.name).sort();
    assert.deepStrictEqual(names, ["check_vision_error", "image_get_dir", "image_save", "image_validate"]);
  });

  it("3. ping: response has result: {}", async () => {
    proc = spawnMCP();
    const res = await sendRequest(proc, {
      jsonrpc: "2.0", id: 3, method: "ping",
    });
    assert.strictEqual(res.jsonrpc, "2.0");
    assert.strictEqual(res.id, 3);
    assert.deepStrictEqual(res.result, {});
  });
});

// ── Group: image_get_dir ───────────────────────────────────────────────────────

describe("mcp-image — image_get_dir", () => {
  let proc;

  afterEach(() => {
    if (proc) { killProc(proc); proc = null; }
  });

  it("4. returns { ok: true, dir, platform }", async () => {
    proc = spawnMCP();
    const res = await sendRequest(proc, {
      jsonrpc: "2.0", id: 4, method: "tools/call",
      params: { name: "image_get_dir", arguments: {} },
    });
    assert.strictEqual(res.id, 4);
    const content = JSON.parse(res.result.content[0].text);
    assert.strictEqual(content.ok, true);
    assert.strictEqual(typeof content.dir, "string");
    assert.strictEqual(content.dir, path.join(os.tmpdir(), "opencode"));
    assert.strictEqual(content.platform, process.platform);
  });
});

// ── Group: image_validate ──────────────────────────────────────────────────────

describe("mcp-image — image_validate", () => {
  let proc;
  const fixturePath = path.join(VISION_DIR, "test-fixture-validate.png");

  before(() => {
    if (!fs.existsSync(VISION_DIR)) fs.mkdirSync(VISION_DIR, { recursive: true });
    createMinimalPNG(fixturePath);
  });

  after(() => {
    if (proc) { killProc(proc); proc = null; }
    try { fs.unlinkSync(fixturePath); } catch { /* best-effort */ }
  });

  it("5. validate a known good PNG file → ok: true", async () => {
    proc = spawnMCP();
    const res = await sendRequest(proc, {
      jsonrpc: "2.0", id: 5, method: "tools/call",
      params: { name: "image_validate", arguments: { path: fixturePath } },
    });
    const content = JSON.parse(res.result.content[0].text);
    assert.strictEqual(content.ok, true);
    assert.strictEqual(content.mime, "image/png");
    assert.strictEqual(typeof content.size_bytes, "number");
  });

  it("6. validate non-existent path → ok: false, code: SOURCE_INVALID", async () => {
    proc = spawnMCP();
    const res = await sendRequest(proc, {
      jsonrpc: "2.0", id: 6, method: "tools/call",
      params: { name: "image_validate", arguments: { path: "/tmp/opencode/nonexistent-xyz.png" } },
    });
    const content = JSON.parse(res.result.content[0].text);
    assert.strictEqual(content.ok, false);
    assert.strictEqual(content.code, "SOURCE_INVALID");
  });
});

// ── Group: check_vision_error ──────────────────────────────────────────────────

describe("mcp-image — check_vision_error", () => {
  let proc;

  afterEach(() => {
    if (proc) { killProc(proc); proc = null; }
  });

  it("7. error text → is_error: true", async () => {
    proc = spawnMCP();
    const res = await sendRequest(proc, {
      jsonrpc: "2.0", id: 7, method: "tools/call",
      params: { name: "check_vision_error", arguments: { text: "I cannot process this image" } },
    });
    const content = JSON.parse(res.result.content[0].text);
    assert.strictEqual(content.is_error, true);
    assert.ok(Array.isArray(content.matched_patterns));
    assert.ok(content.matched_patterns.length > 0);
  });

  it("8. non-error text → is_error: false", async () => {
    proc = spawnMCP();
    const res = await sendRequest(proc, {
      jsonrpc: "2.0", id: 8, method: "tools/call",
      params: { name: "check_vision_error", arguments: { text: "Layout: sidebar" } },
    });
    const content = JSON.parse(res.result.content[0].text);
    assert.strictEqual(content.is_error, false);
    assert.deepStrictEqual(content.matched_patterns, []);
  });
});

// ── Group: image_save — path source ────────────────────────────────────────────

describe("mcp-image — image_save (path source)", () => {
  let proc;
  const fixturePath = path.join(VISION_DIR, "test-fixture.png");

  before(() => {
    if (!fs.existsSync(VISION_DIR)) fs.mkdirSync(VISION_DIR, { recursive: true });
    createMinimalPNG(fixturePath);
  });

  after(() => {
    if (proc) { killProc(proc); proc = null; }
    cleanupVisionFiles();
    try { fs.unlinkSync(fixturePath); } catch { /* best-effort */ }
  });

  it("9. save valid PNG from path → ok: true, saved_path ends with .png", async () => {
    proc = spawnMCP();
    const res = await sendRequest(proc, {
      jsonrpc: "2.0", id: 9, method: "tools/call",
      params: { name: "image_save", arguments: { source: "path", value: fixturePath } },
    });
    const content = JSON.parse(res.result.content[0].text);
    assert.strictEqual(content.ok, true);
    assert.strictEqual(typeof content.saved_path, "string");
    assert.ok(content.saved_path.endsWith(".png"), `Expected saved_path to end with .png, got: ${content.saved_path}`);
    assert.strictEqual(content.mime, "image/png");
  });

  it("10. save non-existent file → ok: false, code: SOURCE_INVALID", async () => {
    proc = spawnMCP();
    const res = await sendRequest(proc, {
      jsonrpc: "2.0", id: 10, method: "tools/call",
      params: { name: "image_save", arguments: { source: "path", value: "/tmp/opencode/nonexistent.png" } },
    });
    const content = JSON.parse(res.result.content[0].text);
    assert.strictEqual(content.ok, false);
    assert.strictEqual(content.code, "SOURCE_INVALID");
  });
});

// ── Group: image_save — url source ─────────────────────────────────────────────
//
// NOTE: nock does NOT intercept HTTP requests in child processes.
// The MCP server runs as a subprocess, so we test error paths that don't
// require HTTP mocking. For successful URL downloads, integration tests
// with a real server or mocked DNS would be needed (out of scope for unit tests).

describe("mcp-image — image_save (url source)", () => {
  let proc;

  before(() => {
    if (!fs.existsSync(VISION_DIR)) fs.mkdirSync(VISION_DIR, { recursive: true });
  });

  afterEach(() => {
    if (proc) { killProc(proc); proc = null; }
    cleanupVisionFiles();
  });

  it("11. URL with invalid domain → ok: false, code: SSRF_BLOCKED", async () => {
    // DNS lookup for non-existent domain will fail → SSRF_BLOCKED (invalid host)
    proc = spawnMCP();
    const res = await sendRequest(proc, {
      jsonrpc: "2.0", id: 11, method: "tools/call",
      params: { name: "image_save", arguments: { source: "url", value: "https://nonexistent-domain-xyz123456.example.com/test.png" } },
    });
    const content = JSON.parse(res.result.content[0].text);
    assert.strictEqual(content.ok, false);
    // SSRF check runs before DNS resolution; non-existent domain fails DNS → SSRF_BLOCKED
    assert.strictEqual(content.code, "SSRF_BLOCKED");
  });

  it("12. URL pointing to 127.0.0.1 → ok: false, code: SSRF_BLOCKED", async () => {
    proc = spawnMCP();
    const res = await sendRequest(proc, {
      jsonrpc: "2.0", id: 12, method: "tools/call",
      params: { name: "image_save", arguments: { source: "url", value: "http://127.0.0.1/evil.png" } },
    });
    const content = JSON.parse(res.result.content[0].text);
    assert.strictEqual(content.ok, false);
    assert.strictEqual(content.code, "SSRF_BLOCKED");
  });

  it("13. URL with file:// protocol → ok: false, code: SOURCE_INVALID", async () => {
    proc = spawnMCP();
    const res = await sendRequest(proc, {
      jsonrpc: "2.0", id: 13, method: "tools/call",
      params: { name: "image_save", arguments: { source: "url", value: "file:///etc/passwd" } },
    });
    const content = JSON.parse(res.result.content[0].text);
    assert.strictEqual(content.ok, false);
    // file:///etc/passwd has no dot → entire URL becomes guessedExt → fails extension regex → SOURCE_INVALID
    // (extension validation runs before SSRF check in handleImageSaveUrl)
    assert.strictEqual(content.code, "SOURCE_INVALID");
  });
});

// ── Group: image_save — ado source ─────────────────────────────────────────────
//
// NOTE: nock does NOT intercept HTTP requests in child processes.
// The MCP server runs as a subprocess, so ADO API calls go to the real
// dev.azure.com. We test error paths that don't require HTTP mocking:
// missing token, invalid input, and graceful failure handling.

describe("mcp-image — image_save (ado source)", () => {
  let proc;
  const savedToken = process.env.ADO_MCP_AUTH_TOKEN;
  const WI_ID = 99999;
  const ATT_ID_1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";

  before(() => {
    if (!fs.existsSync(VISION_DIR)) fs.mkdirSync(VISION_DIR, { recursive: true });
  });

  afterEach(() => {
    if (proc) { killProc(proc); proc = null; }
    cleanupVisionFiles();
  });

  after(() => {
    if (savedToken !== undefined) {
      process.env.ADO_MCP_AUTH_TOKEN = savedToken;
    } else {
      delete process.env.ADO_MCP_AUTH_TOKEN;
    }
  });

  it("14. ADO singular without token → ok: false, code: FETCH_FAILED", async () => {
    // Remove token to test missing auth
    delete process.env.ADO_MCP_AUTH_TOKEN;

    proc = spawnMCP();
    const res = await sendRequest(proc, {
      jsonrpc: "2.0", id: 14, method: "tools/call",
      params: {
        name: "image_save",
        arguments: {
          source: "ado",
          value: { workItemId: WI_ID, attachmentId: ATT_ID_1 },
        },
      },
    });
    const content = JSON.parse(res.result.content[0].text);
    assert.strictEqual(content.ok, false);
    assert.strictEqual(content.code, "FETCH_FAILED");
  });

  it("15. ADO with invalid workItemId (string) → ok: false, code: SOURCE_INVALID", async () => {
    process.env.ADO_MCP_AUTH_TOKEN = "test-token";

    proc = spawnMCP();
    const res = await sendRequest(proc, {
      jsonrpc: "2.0", id: 15, method: "tools/call",
      params: {
        name: "image_save",
        arguments: {
          source: "ado",
          value: { workItemId: "not-a-number" },
        },
      },
    });
    const content = JSON.parse(res.result.content[0].text);
    assert.strictEqual(content.ok, false);
    assert.strictEqual(content.code, "SOURCE_INVALID");
  });

  it("16. ADO with workItemId = 0 → ok: false, code: SOURCE_INVALID", async () => {
    process.env.ADO_MCP_AUTH_TOKEN = "test-token";

    proc = spawnMCP();
    const res = await sendRequest(proc, {
      jsonrpc: "2.0", id: 16, method: "tools/call",
      params: {
        name: "image_save",
        arguments: {
          source: "ado",
          value: { workItemId: 0 },
        },
      },
    });
    const content = JSON.parse(res.result.content[0].text);
    assert.strictEqual(content.ok, false);
    assert.strictEqual(content.code, "SOURCE_INVALID");
  });

  it("17. ADO with missing workItemId → ok: false, code: SOURCE_INVALID", async () => {
    process.env.ADO_MCP_AUTH_TOKEN = "test-token";

    proc = spawnMCP();
    const res = await sendRequest(proc, {
      jsonrpc: "2.0", id: 17, method: "tools/call",
      params: {
        name: "image_save",
        arguments: {
          source: "ado",
          value: { attachmentId: ATT_ID_1 },
        },
      },
    });
    const content = JSON.parse(res.result.content[0].text);
    assert.strictEqual(content.ok, false);
    assert.strictEqual(content.code, "SOURCE_INVALID");
  });

  it("18. ADO plural without token → ok: false, code: FETCH_FAILED", async () => {
    delete process.env.ADO_MCP_AUTH_TOKEN;

    proc = spawnMCP();
    const res = await sendRequest(proc, {
      jsonrpc: "2.0", id: 18, method: "tools/call",
      params: {
        name: "image_save",
        arguments: {
          source: "ado",
          value: { workItemId: WI_ID },
        },
      },
    });
    const content = JSON.parse(res.result.content[0].text);
    assert.strictEqual(content.ok, false);
    assert.strictEqual(content.code, "FETCH_FAILED");
  });
});

// ── Group: Robustness ──────────────────────────────────────────────────────────

describe("mcp-image — Robustness", () => {
  let proc;

  afterEach(() => {
    if (proc) { killProc(proc); proc = null; }
  });

  it("19. invalid JSON-RPC (no jsonrpc field) → server doesn't crash, responds to next valid request", async () => {
    proc = spawnMCP();

    // Send invalid message (no jsonrpc field) — server should silently ignore
    proc.stdin.write(JSON.stringify({ id: 99, method: "ping" }) + "\n");

    // Wait a bit for the server to process the invalid message
    await new Promise((r) => setTimeout(r, 200));

    // Now send a valid request — server should still respond
    const res = await sendRequest(proc, {
      jsonrpc: "2.0", id: 20, method: "ping",
    });
    assert.strictEqual(res.jsonrpc, "2.0");
    assert.strictEqual(res.id, 20);
    assert.deepStrictEqual(res.result, {});
  });

  it("20. unknown method → response has error.code === -32601", async () => {
    proc = spawnMCP();
    const res = await sendRequest(proc, {
      jsonrpc: "2.0", id: 21, method: "nonexistent/method",
    });
    assert.strictEqual(res.jsonrpc, "2.0");
    assert.strictEqual(res.id, 21);
    assert.ok(res.error);
    assert.strictEqual(res.error.code, -32601);
  });
});

// ── Testing limitation ─────────────────────────────────────────────────
//
// URL download and ADO API success paths cannot be tested via subprocess
// because nock does NOT intercept HTTP requests inside child processes.
// These paths are covered indirectly:
//   - vision-utils.test.js tests isSafeUrlAsync, adoGet, downloadAdoAttachment
//   - mcp-image.js handlers delegate all HTTP to vision-utils
//
// For true end-to-end testing of HTTP success paths, consider:
//   (a) Adding --mock-responses flag to mcp-image.js for test injection
//   (b) Refactoring handlers to be externally testable

// ── Global cleanup ─────────────────────────────────────────────────────────────

after(() => {
  // Kill any remaining spawned processes
  for (const proc of spawnedProcs) {
    killProc(proc);
  }
  spawnedProcs.clear();
  // Clean up vision temp files
  cleanupVisionFiles();
});
