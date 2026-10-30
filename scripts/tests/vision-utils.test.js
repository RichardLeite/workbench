#!/usr/bin/env node
/**
 * vision-utils.test.js — Unit tests for scripts/vision-utils.js
 *
 * Tests cover: validateMagicHeader, resolveOutputPath, getUrlCacheKey,
 * isSafeUrl, assertSizeCap, detectVisionError, listImageAttachments.
 *
 * Uses Node.js built-in node:test with describe/it/assert.
 * listImageAttachments tests use nock to mock Azure DevOps HTTPS API.
 */

const { describe, it, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const nock = require("nock");

const {
  validateMagicHeader,
  resolveOutputPath,
  resolveVisionPath,
  getUrlCacheKey,
  isSafeUrl,
  assertSizeCap,
  detectVisionError,
  listImageAttachments,
  extractAttachmentsFromFields,
  extractAttachmentsFromComments,
  adoGet,
  downloadAdoAttachment,
  VISION_ERROR_PATTERNS,
  DEFAULT_MAX_IMAGE_BYTES,
  DEFAULT_TIMEOUT_MS,
} = require("../vision-utils");

// ── validateMagicHeader ───────────────────────────────────────────────────────

describe("validateMagicHeader", () => {
  it("should detect PNG from 8 magic bytes", () => {
    const buf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    const result = validateMagicHeader(buf);
    assert.deepStrictEqual(result, { ok: true, mime: "image/png" });
  });

  it("should detect JPEG from 3 magic bytes (FF D8 FF)", () => {
    const buf = Buffer.from([0xFF, 0xD8, 0xFF]);
    const result = validateMagicHeader(buf);
    assert.deepStrictEqual(result, { ok: true, mime: "image/jpeg" });
  });

  it("should detect WebP from 12 bytes (RIFF + WEBP)", () => {
    const buf = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // file size (ignored)
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    const result = validateMagicHeader(buf);
    assert.deepStrictEqual(result, { ok: true, mime: "image/webp" });
  });

  it("should detect GIF87a from 6 bytes", () => {
    // GIF87a: 47 49 46 38 37 61
    const buf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]);
    const result = validateMagicHeader(buf);
    assert.deepStrictEqual(result, { ok: true, mime: "image/gif" });
  });

  it("should detect GIF89a from 6 bytes", () => {
    // GIF89a: 47 49 46 38 39 61
    const buf = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    const result = validateMagicHeader(buf);
    assert.deepStrictEqual(result, { ok: true, mime: "image/gif" });
  });

  it("should detect AVIF from 12 bytes (ftyp + avif)", () => {
    const buf = Buffer.from([
      0x00, 0x00, 0x00, 0x20, // box size (variable, ignored)
      0x66, 0x74, 0x79, 0x70, // ftyp
      0x61, 0x76, 0x69, 0x66, // avif
    ]);
    const result = validateMagicHeader(buf);
    assert.deepStrictEqual(result, { ok: true, mime: "image/avif" });
  });

  it("should return application/octet-stream for unknown format (PDF header) without throwing", () => {
    // PDF header: 25 50 44 46 (%PDF)
    const buf = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
    const result = validateMagicHeader(buf);
    assert.deepStrictEqual(result, { ok: true, mime: "application/octet-stream" });
  });

  it("should throw MIME_INVALID for buffer shorter than 3 bytes", () => {
    const buf = Buffer.from([0x89, 0x50]);
    assert.throws(() => validateMagicHeader(buf), /MIME_INVALID/);
  });

  it("should throw MIME_INVALID for empty buffer", () => {
    const buf = Buffer.alloc(0);
    assert.throws(() => validateMagicHeader(buf), /MIME_INVALID/);
  });

  it("should throw MIME_INVALID for non-Buffer input", () => {
    assert.throws(() => validateMagicHeader("not a buffer"), /MIME_INVALID/);
    assert.throws(() => validateMagicHeader(null), /MIME_INVALID/);
    assert.throws(() => validateMagicHeader(undefined), /MIME_INVALID/);
    assert.throws(() => validateMagicHeader(42), /MIME_INVALID/);
  });
});

// ── resolveOutputPath ─────────────────────────────────────────────────────────

describe("resolveOutputPath", () => {
  it("should return path ending in vision-abc-123.png under tmpdir", () => {
    const result = resolveOutputPath("abc-123", "png");
    assert.ok(result.endsWith(`vision-abc-123.png`), `Expected path to end with vision-abc-123.png, got: ${result}`);
    assert.ok(result.startsWith(os.tmpdir()), `Expected path under tmpdir, got: ${result}`);
  });

  it("should return path ending in vision-<8hex>.jpg for URL cache key", () => {
    const cacheKey = getUrlCacheKey("https://example.com/img.png");
    const result = resolveOutputPath(cacheKey, "jpg");
    assert.ok(result.endsWith(`vision-${cacheKey}.jpg`), `Expected path to end with vision-${cacheKey}.jpg, got: ${result}`);
    assert.strictEqual(cacheKey.length, 8, "Cache key should be 8 hex chars");
  });

  it("should throw SOURCE_INVALID for name with spaces", () => {
    assert.throws(() => resolveOutputPath("foo bar", "png"), /SOURCE_INVALID/);
  });

  it("should throw SOURCE_INVALID for extension with special chars", () => {
    assert.throws(() => resolveOutputPath("valid-name", "png.bak"), /SOURCE_INVALID/);
  });

  it("should create the opencode temp directory if it does not exist", () => {
    resolveOutputPath("test-mkdir", "png");
    const imgDir = path.join(os.tmpdir(), "opencode");
    assert.ok(fs.existsSync(imgDir), `Expected directory ${imgDir} to exist`);
  });
});

// ── resolveVisionPath ─────────────────────────────────────────────────────────

describe("resolveVisionPath", () => {
  it("should return a path under tmpdir/opencode with vision- prefix and correct extension", () => {
    const result = resolveVisionPath("webp");
    assert.ok(result.startsWith(path.join(os.tmpdir(), "opencode")), "Should be under tmpdir/opencode");
    assert.ok(path.basename(result).startsWith("vision-"), "Basename should start with vision-");
    assert.ok(result.endsWith(".webp"), `Should end with .webp, got: ${result}`);
  });
});

// ── getUrlCacheKey ────────────────────────────────────────────────────────────

describe("getUrlCacheKey", () => {
  it("should return exactly 8 hex characters", () => {
    const key = getUrlCacheKey("https://example.com/image.png");
    assert.strictEqual(key.length, 8);
    assert.ok(/^[0-9a-f]{8}$/.test(key), `Expected 8 hex chars, got: ${key}`);
  });

  it("should be deterministic: same URL produces same hash, different URLs produce different hashes", () => {
    const url1 = "https://example.com/img1.png";
    const url2 = "https://example.com/img2.png";

    const key1a = getUrlCacheKey(url1);
    const key1b = getUrlCacheKey(url1);
    const key2 = getUrlCacheKey(url2);

    assert.strictEqual(key1a, key1b, "Same URL should produce same hash");
    assert.notStrictEqual(key1a, key2, "Different URLs should produce different hashes");
  });

  it("should return different hashes for URLs that differ only by query string", () => {
    const key1 = getUrlCacheKey("https://example.com/img.png?v=1");
    const key2 = getUrlCacheKey("https://example.com/img.png?v=2");
    assert.notStrictEqual(key1, key2, "URLs with different query strings should produce different hashes");
  });
});

// ── isSafeUrl ─────────────────────────────────────────────────────────────────

describe("isSafeUrl", () => {
  it("should block 127.0.0.1 (loopback)", () => {
    const result = isSafeUrl("http://127.0.0.1/x");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, "SSRF_BLOCKED");
  });

  it("should block 169.254.169.254 (link-local / cloud metadata)", () => {
    const result = isSafeUrl("http://169.254.169.254/x");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, "SSRF_BLOCKED");
  });

  it("should block 10.0.0.5 (private Class A)", () => {
    const result = isSafeUrl("http://10.0.0.5/x");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, "SSRF_BLOCKED");
  });

  it("should block 192.168.1.1 (private Class C)", () => {
    const result = isSafeUrl("http://192.168.1.1/x");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, "SSRF_BLOCKED");
  });

  it("should allow 8.8.8.8 (public IP)", () => {
    const result = isSafeUrl("https://8.8.8.8/x");
    assert.strictEqual(result.ok, true);
  });

  it("should block file:// protocol", () => {
    const result = isSafeUrl("file:///etc/passwd");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, "SSRF_BLOCKED");
  });

  it("should block IPv6 link-local fe80::1", () => {
    const result = isSafeUrl("http://[fe80::1]/x");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, "SSRF_BLOCKED");
  });

  it("should block IPv6 multicast ff02::1", () => {
    const result = isSafeUrl("http://[ff02::1]/x");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, "SSRF_BLOCKED");
  });

  it("should block localhost hostname", () => {
    const result = isSafeUrl("http://localhost:3000/api");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, "SSRF_BLOCKED");
  });

  it("should block 0.0.0.0 (unspecified address)", () => {
    const result = isSafeUrl("http://0.0.0.0/x");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.reason, "SSRF_BLOCKED");
  });
});

// ── assertSizeCap ─────────────────────────────────────────────────────────────

describe("assertSizeCap", () => {
  it("should not throw for 5 MB buffer (under 10 MB default limit)", () => {
    const buf = Buffer.alloc(5 * 1024 * 1024);
    assert.doesNotThrow(() => assertSizeCap(buf));
  });

  it("should throw SIZE_EXCEEDED for 11 MB buffer", () => {
    const buf = Buffer.alloc(11 * 1024 * 1024);
    assert.throws(() => assertSizeCap(buf), /SIZE_EXCEEDED/);
  });

  it("should not throw for buffer exactly at the default limit", () => {
    const buf = Buffer.alloc(DEFAULT_MAX_IMAGE_BYTES);
    assert.doesNotThrow(() => assertSizeCap(buf));
  });

  it("should respect custom maxBytes parameter", () => {
    const buf = Buffer.alloc(100);
    assert.doesNotThrow(() => assertSizeCap(buf, 200));
    assert.throws(() => assertSizeCap(buf, 50), /SIZE_EXCEEDED/);
  });
});

// ── detectVisionError ─────────────────────────────────────────────────────────

describe("detectVisionError", () => {
  it("should detect known vision error patterns", () => {
    assert.strictEqual(detectVisionError("model does not support image input"), true);
    assert.strictEqual(detectVisionError("cannot process this image file"), true);
    assert.strictEqual(detectVisionError("Cannot read binary file as text"), true);
  });

  it("should return false for valid non-error text", () => {
    assert.strictEqual(detectVisionError("Layout: sidebar + main"), false);
    assert.strictEqual(detectVisionError("The image shows a login form with email and password fields"), false);
  });

  it("should match all 19 VISION_ERROR_PATTERNS with sample text", () => {
    const samples = [
      "model does not support image input",           // pattern 0
      "cannot process this image",                    // pattern 1
      "unable to analyze this content",               // pattern 2
      "i can't see images in this context",           // pattern 3
      "no vision capability available",                // pattern 4
      "image analysis not supported here",             // pattern 5
      "unsupported content type: image/png",           // pattern 6
      "vision-capable model required",                 // pattern 7
      "please provide a text description",             // pattern 8
      "i don't have access to image content",          // pattern 9
      "multimodal capability required",                // pattern 10
      "image input was not supported",                 // pattern 11
      "failed to decode image data",                   // pattern 12
      "content policy rejected: image",                // pattern 13
      "no image attachment found in request",          // pattern 14
      "this model cannot handle image files",          // pattern 15
      "image url was inaccessible",                    // pattern 16
      "cannot read binary file data",                  // pattern 17
      "unsupported format detected",                   // pattern 18
    ];

    assert.strictEqual(samples.length, VISION_ERROR_PATTERNS.length,
      `Expected ${VISION_ERROR_PATTERNS.length} samples, got ${samples.length}`);

    for (let i = 0; i < samples.length; i++) {
      assert.strictEqual(
        detectVisionError(samples[i]),
        true,
        `Pattern ${i} (${VISION_ERROR_PATTERNS[i]}) should match: "${samples[i]}"`
      );
    }
  });
});

// ── listImageAttachments (requires nock + ADO_MCP_AUTH_TOKEN) ─────────────────

describe("listImageAttachments", () => {
  const savedToken = process.env.ADO_MCP_AUTH_TOKEN;
  const ORG = "your-org";
  const WI_ID = 12345;
  const PROJECT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const ATT_ID_1 = "11111111-1111-1111-1111-111111111111";
  const ATT_ID_2 = "22222222-2222-2222-2222-222222222222";

  before(() => {
    process.env.ADO_MCP_AUTH_TOKEN = "test-token";
  });

  after(() => {
    if (savedToken !== undefined) {
      process.env.ADO_MCP_AUTH_TOKEN = savedToken;
    } else {
      delete process.env.ADO_MCP_AUTH_TOKEN;
    }
  });

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it("should return 1 entry with source=attached_file for work item with 1 AttachedFile relation", async () => {
    const wiUrl = `/${ORG}/_apis/wit/workItems/${WI_ID}`;
    const commentsUrl = `/${ORG}/_apis/wit/workItems/${WI_ID}/comments`;

    nock("https://dev.azure.com")
      .get(wiUrl)
      .query({ $expand: "relations", "api-version": "7.0" })
      .reply(200, {
        id: WI_ID,
        relations: [
          {
            rel: "AttachedFile",
            url: `https://dev.azure.com/${ORG}/_apis/wit/attachments/${ATT_ID_1}`,
            attributes: {
              name: "screenshot.png",
              resourceSize: 204800,
            },
          },
        ],
      });

    nock("https://dev.azure.com")
      .get(wiUrl)
      .query({ "api-version": "7.0" })
      .reply(200, {
        id: WI_ID,
        _links: {
          workItemComments: {
            href: `https://dev.azure.com/${ORG}/_apis/wit/workItems/${WI_ID}/comments`,
          },
        },
      });

    nock("https://dev.azure.com")
      .get(commentsUrl)
      .query({ $top: "100" })
      .reply(200, { comments: [] });

    const results = await listImageAttachments(WI_ID, ORG);

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].source, "attached_file");
    assert.strictEqual(results[0].attachmentId, ATT_ID_1);
    assert.strictEqual(results[0].name, "screenshot.png");
    assert.strictEqual(results[0].resourceSize, 204800);
    assert.ok(nock.isDone(), `Not all nock mocks were consumed. Pending: ${JSON.stringify(nock.pendingMocks())}`);
  });

  it("should return empty array for work item with no AttachedFile relations", async () => {
    const wiUrl = `/${ORG}/_apis/wit/workItems/${WI_ID}`;
    const commentsUrl = `/${ORG}/_apis/wit/workItems/${WI_ID}/comments`;

    nock("https://dev.azure.com")
      .get(wiUrl)
      .query({ $expand: "relations", "api-version": "7.0" })
      .reply(200, {
        id: WI_ID,
        relations: [
          {
            rel: "Hyperlink",
            url: "https://example.com",
            attributes: {},
          },
        ],
      });

    nock("https://dev.azure.com")
      .get(wiUrl)
      .query({ "api-version": "7.0" })
      .reply(200, {
        id: WI_ID,
        _links: {
          workItemComments: {
            href: `https://dev.azure.com/${ORG}/_apis/wit/workItems/${WI_ID}/comments`,
          },
        },
      });

    nock("https://dev.azure.com")
      .get(commentsUrl)
      .query({ $top: "100" })
      .reply(200, { comments: [] });

    const results = await listImageAttachments(WI_ID, ORG);

    assert.strictEqual(results.length, 0);
    assert.deepStrictEqual(results, []);
    assert.ok(nock.isDone(), `Not all nock mocks were consumed. Pending: ${JSON.stringify(nock.pendingMocks())}`);
  });

  it("should deduplicate when AttachedFile relation and inline HTML in Description reference same attachment", async () => {
    const wiUrl = `/${ORG}/_apis/wit/workItems/${WI_ID}`;
    const commentsUrl = `/${ORG}/_apis/wit/workItems/${WI_ID}/comments`;

    const descriptionHtml =
      `<p>See screenshot:</p>` +
      `<img src="https://dev.azure.com/${ORG}/${PROJECT_ID}/_apis/wit/attachments/${ATT_ID_1}?fileName=screenshot.png" />`;

    // 1st call: listImageAttachments → work item with $expand=relations
    nock("https://dev.azure.com")
      .get(wiUrl)
      .query({ $expand: "relations", "api-version": "7.0" })
      .reply(200, {
        id: WI_ID,
        fields: {
          "System.Description": descriptionHtml,
        },
        relations: [
          {
            rel: "AttachedFile",
            url: `https://dev.azure.com/${ORG}/_apis/wit/attachments/${ATT_ID_1}`,
            attributes: {
              name: "screenshot.png",
              resourceSize: 204800,
            },
          },
        ],
      });

    // 2nd call: extractAttachmentsFromComments → work item without $expand
    nock("https://dev.azure.com")
      .get(wiUrl)
      .query({ "api-version": "7.0" })
      .reply(200, {
        id: WI_ID,
        _links: {
          workItemComments: {
            href: `https://dev.azure.com/${ORG}/_apis/wit/workItems/${WI_ID}/comments`,
          },
        },
      });

    // 3rd call: extractAttachmentsFromComments → comments API
    nock("https://dev.azure.com")
      .get(commentsUrl)
      .query({ $top: "100" })
      .reply(200, { comments: [] });

    const results = await listImageAttachments(WI_ID, ORG);

    // Same ATT_ID_1 appears in both relation and inline HTML → deduplicated to 1 entry
    assert.strictEqual(results.length, 1, `Expected 1 deduplicated entry, got ${results.length}`);
    assert.strictEqual(results[0].attachmentId, ATT_ID_1);
    assert.strictEqual(results[0].source, "attached_file");
    assert.ok(nock.isDone(), `Not all nock mocks were consumed. Pending: ${JSON.stringify(nock.pendingMocks())}`);
  });

  it("should return multiple entries for multiple AttachedFile relations with different IDs", async () => {
    const wiUrl = `/${ORG}/_apis/wit/workItems/${WI_ID}`;
    const commentsUrl = `/${ORG}/_apis/wit/workItems/${WI_ID}/comments`;

    nock("https://dev.azure.com")
      .get(wiUrl)
      .query({ $expand: "relations", "api-version": "7.0" })
      .reply(200, {
        id: WI_ID,
        relations: [
          {
            rel: "AttachedFile",
            url: `https://dev.azure.com/${ORG}/_apis/wit/attachments/${ATT_ID_1}`,
            attributes: { name: "img1.png", resourceSize: 1024 },
          },
          {
            rel: "AttachedFile",
            url: `https://dev.azure.com/${ORG}/_apis/wit/attachments/${ATT_ID_2}`,
            attributes: { name: "img2.jpg", resourceSize: 2048 },
          },
        ],
      });

    nock("https://dev.azure.com")
      .get(wiUrl)
      .query({ "api-version": "7.0" })
      .reply(200, {
        id: WI_ID,
        _links: {
          workItemComments: {
            href: `https://dev.azure.com/${ORG}/_apis/wit/workItems/${WI_ID}/comments`,
          },
        },
      });

    nock("https://dev.azure.com")
      .get(commentsUrl)
      .query({ $top: "100" })
      .reply(200, { comments: [] });

    const results = await listImageAttachments(WI_ID, ORG);

    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].attachmentId, ATT_ID_1);
    assert.strictEqual(results[0].name, "img1.png");
    assert.strictEqual(results[1].attachmentId, ATT_ID_2);
    assert.strictEqual(results[1].name, "img2.jpg");
    assert.ok(nock.isDone(), `Not all nock mocks were consumed. Pending: ${JSON.stringify(nock.pendingMocks())}`);
  });

  it("should extract inline image from Description field with source=field_html", async () => {
    const wiUrl = `/${ORG}/_apis/wit/workItems/${WI_ID}`;
    const commentsUrl = `/${ORG}/_apis/wit/workItems/${WI_ID}/comments`;

    const descriptionHtml =
      `<p>Bug screenshot:</p>` +
      `<img src="https://dev.azure.com/${ORG}/${PROJECT_ID}/_apis/wit/attachments/${ATT_ID_1}?fileName=bug.png" />`;

    // No AttachedFile relations — only inline HTML in Description
    nock("https://dev.azure.com")
      .get(wiUrl)
      .query({ $expand: "relations", "api-version": "7.0" })
      .reply(200, {
        id: WI_ID,
        fields: {
          "System.Description": descriptionHtml,
        },
        relations: [],
      });

    nock("https://dev.azure.com")
      .get(wiUrl)
      .query({ "api-version": "7.0" })
      .reply(200, {
        id: WI_ID,
        _links: {
          workItemComments: {
            href: `https://dev.azure.com/${ORG}/_apis/wit/workItems/${WI_ID}/comments`,
          },
        },
      });

    nock("https://dev.azure.com")
      .get(commentsUrl)
      .query({ $top: "100" })
      .reply(200, { comments: [] });

    const results = await listImageAttachments(WI_ID, ORG);

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].attachmentId, ATT_ID_1);
    assert.strictEqual(results[0].name, "bug.png");
    assert.strictEqual(results[0].source, "field_html");
    assert.strictEqual(results[0].projectId, PROJECT_ID);
    assert.ok(nock.isDone(), `Not all nock mocks were consumed. Pending: ${JSON.stringify(nock.pendingMocks())}`);
  });

  it("should throw FETCH_FAILED for non-number workItemId", async () => {
    await assert.rejects(
      () => listImageAttachments("not-a-number"),
      /FETCH_FAILED/
    );
  });

  it("should throw FETCH_FAILED for zero workItemId", async () => {
    await assert.rejects(
      () => listImageAttachments(0),
      /FETCH_FAILED/
    );
  });

  it("should propagate FETCH_FAILED when ADO returns HTTP error", async () => {
    nock("https://dev.azure.com")
      .get(`/${ORG}/_apis/wit/workItems/${WI_ID}`)
      .query({ $expand: "relations", "api-version": "7.0" })
      .reply(500, { message: "Internal Server Error" });

    await assert.rejects(
      () => listImageAttachments(WI_ID, ORG),
      /FETCH_FAILED/
    );
    assert.ok(nock.isDone(), `Not all nock mocks were consumed. Pending: ${JSON.stringify(nock.pendingMocks())}`);
  });

  it("should include comment-sourced attachments with source=comment_html", async () => {
    const wiUrl = `/${ORG}/_apis/wit/workItems/${WI_ID}`;
    const commentsUrl = `/${ORG}/_apis/wit/workItems/${WI_ID}/comments`;

    const commentHtml =
      `<p>See this:</p>` +
      `<img src="https://dev.azure.com/${ORG}/${PROJECT_ID}/_apis/wit/attachments/${ATT_ID_1}?fileName=comment-img.png" />`;

    // No relations, no field images
    nock("https://dev.azure.com")
      .get(wiUrl)
      .query({ $expand: "relations", "api-version": "7.0" })
      .reply(200, { id: WI_ID, relations: [] });

    nock("https://dev.azure.com")
      .get(wiUrl)
      .query({ "api-version": "7.0" })
      .reply(200, {
        id: WI_ID,
        _links: {
          workItemComments: {
            href: `https://dev.azure.com/${ORG}/_apis/wit/workItems/${WI_ID}/comments`,
          },
        },
      });

    nock("https://dev.azure.com")
      .get(commentsUrl)
      .query({ $top: "100" })
      .reply(200, {
        comments: [
          { id: 100, text: commentHtml },
        ],
      });

    const results = await listImageAttachments(WI_ID, ORG);

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].attachmentId, ATT_ID_1);
    assert.strictEqual(results[0].name, "comment-img.png");
    assert.strictEqual(results[0].source, "comment_html");
    assert.strictEqual(results[0].commentId, 100);
    assert.ok(nock.isDone(), `Not all nock mocks were consumed. Pending: ${JSON.stringify(nock.pendingMocks())}`);
  });

  it("should handle work item with no relations array gracefully", async () => {
    const wiUrl = `/${ORG}/_apis/wit/workItems/${WI_ID}`;
    const commentsUrl = `/${ORG}/_apis/wit/workItems/${WI_ID}/comments`;

    nock("https://dev.azure.com")
      .get(wiUrl)
      .query({ $expand: "relations", "api-version": "7.0" })
      .reply(200, { id: WI_ID });

    nock("https://dev.azure.com")
      .get(wiUrl)
      .query({ "api-version": "7.0" })
      .reply(200, {
        id: WI_ID,
        _links: {
          workItemComments: {
            href: `https://dev.azure.com/${ORG}/_apis/wit/workItems/${WI_ID}/comments`,
          },
        },
      });

    nock("https://dev.azure.com")
      .get(commentsUrl)
      .query({ $top: "100" })
      .reply(200, { comments: [] });

    const results = await listImageAttachments(WI_ID, ORG);

    assert.strictEqual(results.length, 0);
    assert.deepStrictEqual(results, []);
    assert.ok(nock.isDone(), `Not all nock mocks were consumed. Pending: ${JSON.stringify(nock.pendingMocks())}`);
  });

  it("should deduplicate across all three sources (relation + field + comment)", async () => {
    const wiUrl = `/${ORG}/_apis/wit/workItems/${WI_ID}`;
    const commentsUrl = `/${ORG}/_apis/wit/workItems/${WI_ID}/comments`;

    const inlineHtml =
      `<img src="https://dev.azure.com/${ORG}/${PROJECT_ID}/_apis/wit/attachments/${ATT_ID_1}?fileName=dup.png" />`;

    const commentHtml =
      `<img src="https://dev.azure.com/${ORG}/${PROJECT_ID}/_apis/wit/attachments/${ATT_ID_1}?fileName=dup.png" />`;

    // Same ATT_ID_1 in all three sources
    nock("https://dev.azure.com")
      .get(wiUrl)
      .query({ $expand: "relations", "api-version": "7.0" })
      .reply(200, {
        id: WI_ID,
        fields: { "System.Description": inlineHtml },
        relations: [
          {
            rel: "AttachedFile",
            url: `https://dev.azure.com/${ORG}/_apis/wit/attachments/${ATT_ID_1}`,
            attributes: { name: "dup.png", resourceSize: 512 },
          },
        ],
      });

    nock("https://dev.azure.com")
      .get(wiUrl)
      .query({ "api-version": "7.0" })
      .reply(200, {
        id: WI_ID,
        _links: {
          workItemComments: {
            href: `https://dev.azure.com/${ORG}/_apis/wit/workItems/${WI_ID}/comments`,
          },
        },
      });

    nock("https://dev.azure.com")
      .get(commentsUrl)
      .query({ $top: "100" })
      .reply(200, {
        comments: [{ id: 200, text: commentHtml }],
      });

    const results = await listImageAttachments(WI_ID, ORG);

    // All three sources reference the same ATT_ID_1 → deduplicated to 1
    assert.strictEqual(results.length, 1, `Expected 1 deduplicated entry, got ${results.length}`);
    assert.strictEqual(results[0].attachmentId, ATT_ID_1);
    // First source wins: attached_file
    assert.strictEqual(results[0].source, "attached_file");
    assert.ok(nock.isDone(), `Not all nock mocks were consumed. Pending: ${JSON.stringify(nock.pendingMocks())}`);
  });
});

// ── adoGet (direct tests) ──────────────────────────────────────────────────────

describe("adoGet", () => {
  const savedToken = process.env.ADO_MCP_AUTH_TOKEN;
  const ORG = "your-org";

  before(() => {
    process.env.ADO_MCP_AUTH_TOKEN = "test-token";
  });

  after(() => {
    if (savedToken !== undefined) {
      process.env.ADO_MCP_AUTH_TOKEN = savedToken;
    } else {
      delete process.env.ADO_MCP_AUTH_TOKEN;
    }
  });

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it("should make GET request and return parsed JSON with Authorization header", async () => {
    nock("https://dev.azure.com")
      .get(`/${ORG}/_apis/wit/workItems/123`)
      .query({ "api-version": "7.0" })
      .reply(200, { id: 123 });

    const result = await adoGet(`https://dev.azure.com/${ORG}/_apis/wit/workItems/123?api-version=7.0`);
    assert.deepStrictEqual(result, { id: 123 });
    assert.ok(nock.isDone(), `Not all nock mocks were consumed. Pending: ${JSON.stringify(nock.pendingMocks())}`);
  });

  it("should throw FETCH_FAILED: ADO_MCP_AUTH_TOKEN not set when token is missing", async () => {
    const tok = process.env.ADO_MCP_AUTH_TOKEN;
    delete process.env.ADO_MCP_AUTH_TOKEN;
    try {
      await assert.rejects(
        () => adoGet(`https://dev.azure.com/${ORG}/_apis/wit/workItems/1?api-version=7.0`),
        /FETCH_FAILED: ADO_MCP_AUTH_TOKEN not set/
      );
      // No HTTP request should have been made
      assert.strictEqual(nock.pendingMocks().length, 0, "No nock mocks should be registered");
    } finally {
      process.env.ADO_MCP_AUTH_TOKEN = tok;
    }
  });

  it("should throw FETCH_FAILED: status 404 with body on HTTP 404", async () => {
    nock("https://dev.azure.com")
      .get(`/${ORG}/_apis/wit/workItems/999`)
      .query({ "api-version": "7.0" })
      .reply(404, { message: "Not Found" });

    await assert.rejects(
      () => adoGet(`https://dev.azure.com/${ORG}/_apis/wit/workItems/999?api-version=7.0`),
      /FETCH_FAILED.*404/
    );
    assert.ok(nock.isDone(), `Not all nock mocks were consumed. Pending: ${JSON.stringify(nock.pendingMocks())}`);
  });
});

// ── downloadAdoAttachment (direct tests) ───────────────────────────────────────

describe("downloadAdoAttachment", () => {
  const savedToken = process.env.ADO_MCP_AUTH_TOKEN;
  const ORG = "your-org";
  const ATT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

  // Minimal valid PNG: 8-byte signature + IHDR chunk
  const PNG_BUFFER = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
  ]);

  before(() => {
    process.env.ADO_MCP_AUTH_TOKEN = "test-token";
  });

  after(() => {
    if (savedToken !== undefined) {
      process.env.ADO_MCP_AUTH_TOKEN = savedToken;
    } else {
      delete process.env.ADO_MCP_AUTH_TOKEN;
    }
  });

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it("should download attachment and return Buffer with valid PNG header", async () => {
    nock("https://dev.azure.com")
      .get(`/${ORG}/_apis/wit/attachments/${ATT_ID}`)
      .query({ "api-version": "7.0" })
      .reply(200, PNG_BUFFER);

    const result = await downloadAdoAttachment({ workItemId: 123, attachmentId: ATT_ID, org: ORG });
    assert.ok(Buffer.isBuffer(result), "Result should be a Buffer");
    assert.strictEqual(result[0], 0x89);
    assert.strictEqual(result[1], 0x50);
    assert.strictEqual(result[2], 0x4E);
    assert.strictEqual(result[3], 0x47);
    assert.ok(nock.isDone(), `Not all nock mocks were consumed. Pending: ${JSON.stringify(nock.pendingMocks())}`);
  });

  it("should throw FETCH_FAILED: ADO_MCP_AUTH_TOKEN not set when token is missing", async () => {
    const tok = process.env.ADO_MCP_AUTH_TOKEN;
    delete process.env.ADO_MCP_AUTH_TOKEN;
    try {
      await assert.rejects(
        () => downloadAdoAttachment({ workItemId: 123, attachmentId: ATT_ID, org: ORG }),
        /FETCH_FAILED: ADO_MCP_AUTH_TOKEN not set/
      );
      assert.strictEqual(nock.pendingMocks().length, 0, "No HTTP request should have been made");
    } finally {
      process.env.ADO_MCP_AUTH_TOKEN = tok;
    }
  });

  it("should throw FETCH_FAILED on HTTP 404", async () => {
    nock("https://dev.azure.com")
      .get(`/${ORG}/_apis/wit/attachments/${ATT_ID}`)
      .query({ "api-version": "7.0" })
      .reply(404);

    await assert.rejects(
      () => downloadAdoAttachment({ workItemId: 123, attachmentId: ATT_ID, org: ORG }),
      /FETCH_FAILED.*404/
    );
    assert.ok(nock.isDone(), `Not all nock mocks were consumed. Pending: ${JSON.stringify(nock.pendingMocks())}`);
  });
});

// ── extractAttachmentsFromFields (direct tests — synchronous, no nock) ─────────

describe("extractAttachmentsFromFields", () => {
  const ORG = "your-org";
  const PROJECT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const ATT_ID = "11111111-1111-1111-1111-111111111111";

  it("should extract HTML img from System.Description with source=field_html", () => {
    const html = `<img src="https://dev.azure.com/${ORG}/${PROJECT_ID}/_apis/wit/attachments/${ATT_ID}?fileName=bug.png" />`;
    const workItem = { fields: { "System.Description": html } };
    const result = extractAttachmentsFromFields(workItem, ORG);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].source, "field_html");
    assert.strictEqual(result[0].attachmentId, ATT_ID);
    assert.strictEqual(result[0].name, "bug.png");
    assert.strictEqual(result[0].projectId, PROJECT_ID);
  });

  it("should extract Markdown image from AcceptanceCriteria with source=field_markdown", () => {
    const md = `![screenshot](https://dev.azure.com/${ORG}/${PROJECT_ID}/_apis/wit/attachments/${ATT_ID}?fileName=screen.png)`;
    const workItem = { fields: { "Microsoft.VSTS.Common.AcceptanceCriteria": md } };
    const result = extractAttachmentsFromFields(workItem, ORG);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].source, "field_markdown");
    assert.strictEqual(result[0].attachmentId, ATT_ID);
    assert.strictEqual(result[0].name, "screen.png");
  });

  it("should decode URL-encoded fileName", () => {
    const encodedName = "erro%20de%20valida%C3%A7%C3%A3o.png";
    const html = `<img src="https://dev.azure.com/${ORG}/${PROJECT_ID}/_apis/wit/attachments/${ATT_ID}?fileName=${encodedName}" />`;
    const workItem = { fields: { "System.Description": html } };
    const result = extractAttachmentsFromFields(workItem, ORG);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].name, "erro de validação.png");
  });

  it("should deduplicate when same attachmentId appears in HTML+Markdown", () => {
    const html = `<img src="https://dev.azure.com/${ORG}/${PROJECT_ID}/_apis/wit/attachments/${ATT_ID}?fileName=dup.png" />`;
    const md = `![alt](https://dev.azure.com/${ORG}/${PROJECT_ID}/_apis/wit/attachments/${ATT_ID}?fileName=dup.png)`;
    const combined = html + md;
    const workItem = { fields: { "System.Description": combined } };
    const result = extractAttachmentsFromFields(workItem, ORG);
    assert.strictEqual(result.length, 1, `Expected 1 deduplicated entry, got ${result.length}`);
    assert.strictEqual(result[0].attachmentId, ATT_ID);
  });

  it("should return [] when workItem has no fields", () => {
    const result = extractAttachmentsFromFields({}, ORG);
    assert.deepStrictEqual(result, []);
  });

  it("should return [] when fields has no Description nor AcceptanceCriteria", () => {
    const workItem = { fields: { "System.Title": "Some title" } };
    const result = extractAttachmentsFromFields(workItem, ORG);
    assert.deepStrictEqual(result, []);
  });
});

// ── extractAttachmentsFromComments (direct tests — async, with nock) ───────────

describe("extractAttachmentsFromComments", () => {
  const savedToken = process.env.ADO_MCP_AUTH_TOKEN;
  const ORG = "your-org";
  const WI_ID = 12345;
  const PROJECT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const ATT_ID_1 = "11111111-1111-1111-1111-111111111111";
  const ATT_ID_2 = "22222222-2222-2222-2222-222222222222";

  before(() => {
    process.env.ADO_MCP_AUTH_TOKEN = "test-token";
  });

  after(() => {
    if (savedToken !== undefined) {
      process.env.ADO_MCP_AUTH_TOKEN = savedToken;
    } else {
      delete process.env.ADO_MCP_AUTH_TOKEN;
    }
  });

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  /** Helper: mock the work item GET (for _links.workItemComments) */
  function mockWiWithComments(wiId, org) {
    nock("https://dev.azure.com")
      .get(`/${org}/_apis/wit/workItems/${wiId}`)
      .query({ "api-version": "7.0" })
      .reply(200, {
        id: wiId,
        _links: {
          workItemComments: {
            href: `https://dev.azure.com/${org}/_apis/wit/workItems/${wiId}/comments`,
          },
        },
      });
  }

  /** Helper: mock the comments API */
  function mockComments(wiId, org, comments) {
    nock("https://dev.azure.com")
      .get(`/${org}/_apis/wit/workItems/${wiId}/comments`)
      .query({ $top: "100" })
      .reply(200, { comments });
  }

  it("should extract HTML img from comment", async () => {
    const commentHtml = `<img src="https://dev.azure.com/${ORG}/${PROJECT_ID}/_apis/wit/attachments/${ATT_ID_1}?fileName=comment.png" />`;
    mockWiWithComments(WI_ID, ORG);
    mockComments(WI_ID, ORG, [{ id: 1, text: commentHtml }]);

    const result = await extractAttachmentsFromComments(WI_ID, ORG);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].source, "comment_html");
    assert.strictEqual(result[0].attachmentId, ATT_ID_1);
    assert.strictEqual(result[0].commentId, 1);
    assert.strictEqual(result[0].name, "comment.png");
    assert.ok(nock.isDone(), `Not all nock mocks were consumed. Pending: ${JSON.stringify(nock.pendingMocks())}`);
  });

  it("should extract Markdown image from comment", async () => {
    const commentMd = `![alt](https://dev.azure.com/${ORG}/${PROJECT_ID}/_apis/wit/attachments/${ATT_ID_1}?fileName=md.png)`;
    mockWiWithComments(WI_ID, ORG);
    mockComments(WI_ID, ORG, [{ id: 2, text: commentMd }]);

    const result = await extractAttachmentsFromComments(WI_ID, ORG);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].source, "comment_markdown");
    assert.strictEqual(result[0].attachmentId, ATT_ID_1);
    assert.strictEqual(result[0].commentId, 2);
    assert.ok(nock.isDone(), `Not all nock mocks were consumed. Pending: ${JSON.stringify(nock.pendingMocks())}`);
  });

  it("should extract 2 entries from 2 comments with different attachmentIds", async () => {
    const html1 = `<img src="https://dev.azure.com/${ORG}/${PROJECT_ID}/_apis/wit/attachments/${ATT_ID_1}?fileName=img1.png" />`;
    const html2 = `<img src="https://dev.azure.com/${ORG}/${PROJECT_ID}/_apis/wit/attachments/${ATT_ID_2}?fileName=img2.png" />`;
    mockWiWithComments(WI_ID, ORG);
    mockComments(WI_ID, ORG, [
      { id: 1, text: html1 },
      { id: 2, text: html2 },
    ]);

    const result = await extractAttachmentsFromComments(WI_ID, ORG);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].attachmentId, ATT_ID_1);
    assert.strictEqual(result[1].attachmentId, ATT_ID_2);
    assert.ok(nock.isDone(), `Not all nock mocks were consumed. Pending: ${JSON.stringify(nock.pendingMocks())}`);
  });

  it("should deduplicate when 2 comments reference same attachmentId", async () => {
    const html = `<img src="https://dev.azure.com/${ORG}/${PROJECT_ID}/_apis/wit/attachments/${ATT_ID_1}?fileName=dup.png" />`;
    mockWiWithComments(WI_ID, ORG);
    mockComments(WI_ID, ORG, [
      { id: 1, text: html },
      { id: 2, text: html },
    ]);

    const result = await extractAttachmentsFromComments(WI_ID, ORG);
    assert.strictEqual(result.length, 1, `Expected 1 deduplicated entry, got ${result.length}`);
    assert.strictEqual(result[0].attachmentId, ATT_ID_1);
    assert.ok(nock.isDone(), `Not all nock mocks were consumed. Pending: ${JSON.stringify(nock.pendingMocks())}`);
  });

  it("should return [] when comments API returns 403", async () => {
    // First call (work item) succeeds, second call (comments) returns 403
    nock("https://dev.azure.com")
      .get(`/${ORG}/_apis/wit/workItems/${WI_ID}`)
      .query({ "api-version": "7.0" })
      .reply(200, {
        id: WI_ID,
        _links: {
          workItemComments: {
            href: `https://dev.azure.com/${ORG}/_apis/wit/workItems/${WI_ID}/comments`,
          },
        },
      });

    nock("https://dev.azure.com")
      .get(`/${ORG}/_apis/wit/workItems/${WI_ID}/comments`)
      .query({ $top: "100" })
      .reply(403, { message: "Forbidden" });

    const result = await extractAttachmentsFromComments(WI_ID, ORG);
    assert.deepStrictEqual(result, []);
    assert.ok(nock.isDone(), `Not all nock mocks were consumed. Pending: ${JSON.stringify(nock.pendingMocks())}`);
  });

  it("should return [] when workItem has no _links.workItemComments", async () => {
    nock("https://dev.azure.com")
      .get(`/${ORG}/_apis/wit/workItems/${WI_ID}`)
      .query({ "api-version": "7.0" })
      .reply(200, { id: WI_ID }); // No _links

    const result = await extractAttachmentsFromComments(WI_ID, ORG);
    assert.deepStrictEqual(result, []);
    assert.ok(nock.isDone(), `Not all nock mocks were consumed. Pending: ${JSON.stringify(nock.pendingMocks())}`);
  });

  it("should append &$top=100 to comments URL", async () => {
    // The function appends &$top=100 to the comments href (which already has ?)
    // or ?$top=100 if no query string. Verify nock matches the $top=100 query param.
    mockWiWithComments(WI_ID, ORG);
    mockComments(WI_ID, ORG, []);

    const result = await extractAttachmentsFromComments(WI_ID, ORG);
    assert.deepStrictEqual(result, []);
    // If nock.isDone() passes, the $top=100 query was matched
    assert.ok(nock.isDone(), `Not all nock mocks were consumed. Pending: ${JSON.stringify(nock.pendingMocks())}`);
  });
});
