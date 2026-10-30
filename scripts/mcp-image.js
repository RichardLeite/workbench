#!/usr/bin/env node
// mcp-image.js — MCP Server for image operations
// Protocol: JSON-RPC 2.0 over stdio
//
// Tools:
//   image_save({ source, value, options? })  — save image from path/url/ado
//   image_get_dir()                           — get temp directory
//   image_validate({ path })                 — validate existing image
//   check_vision_error({ text })             — detect vision errors
//
// Logging: structured JSON to stderr only (stdout is reserved for JSON-RPC).
// Tokens/secrets are NEVER logged.

'use strict';

// ── FASE 0: Garantir Node 20+ ──────────────────────────────
// Auto-descobre Node via nvm/fnm/volta/asdf se o atual for < 20
// Side-effect: encerra processo se Node < 20; nunca retorna nesse caso
require('./lib/ensure-node-version')(20, 'TEAMS_MCP_NODE_PATH');

const fs = require('fs');
const path = require('path');
const os = require('os');
const readline = require('readline');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');

const visionUtils = require('./vision-utils');

// ── Constants ──────────────────────────────────────────────────────────────────

const SERVER_NAME = 'mcp-image';
const SERVER_VERSION = '0.1.0';
const PROTOCOL_VERSION = '2024-11-05';
const DEFAULT_MAX_BYTES = visionUtils.DEFAULT_MAX_IMAGE_BYTES;
const FETCH_TIMEOUT_MS = 10_000;

// ── Logger ─────────────────────────────────────────────────────────────────────

/**
 * Structured JSON logger — writes ONLY to stderr.
 * Never logs tokens, secrets, or full URLs with auth.
 *
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {string} event
 * @param {object} [data]
 */
function logger(level, event, data = {}) {
  // Sanitize: strip any field that looks like a token
  const sanitized = {};
  for (const [k, v] of Object.entries(data)) {
    if (/token|secret|password|auth|authorization/i.test(k)) {
      sanitized[k] = '[REDACTED]';
    } else {
      sanitized[k] = v;
    }
  }

  const entry = {
    level,
    event,
    ts: new Date().toISOString(),
    ...sanitized,
  };

  try {
    process.stderr.write(JSON.stringify(entry) + '\n');
  } catch {
    // If stderr is broken, swallow — never crash
  }
}

// ── JSON-RPC helpers ───────────────────────────────────────────────────────────

/**
 * Send a JSON-RPC 2.0 response to stdout.
 * @param {object} msg — complete JSON-RPC message
 */
function sendResponse(msg) {
  try {
    process.stdout.write(JSON.stringify(msg) + '\n');
  } catch {
    logger('error', 'stdout_write_failed');
  }
}

/**
 * Build a success response.
 */
function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

/**
 * Build an error response.
 * @param {number} code — JSON-RPC error code
 * @param {string} message
 * @param {object} [data]
 */
function rpcError(id, code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  return { jsonrpc: '2.0', id, error: err };
}

// ── Tool: image_get_dir ────────────────────────────────────────────────────────

function handleImageGetDir() {
  const dir = path.join(os.tmpdir(), 'opencode');
  return {
    ok: true,
    dir,
    platform: process.platform,
  };
}

// ── Tool: image_validate ───────────────────────────────────────────────────────

function handleImageValidate(args) {
  const warnings = [];
  const filePath = args && args.path;

  if (!filePath || typeof filePath !== 'string') {
    return { ok: false, code: 'SOURCE_INVALID', warnings: ['path is required'] };
  }

  try {
    if (!fs.existsSync(filePath)) {
      return { ok: false, code: 'SOURCE_INVALID', warnings: ['file not found'] };
    }

    const buffer = fs.readFileSync(filePath);
    const { mime } = visionUtils.validateMagicHeader(buffer);
    visionUtils.assertSizeCap(buffer);

    return {
      ok: true,
      mime,
      size_bytes: buffer.length,
    };
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.startsWith('SIZE_EXCEEDED')) {
      return { ok: false, code: 'SIZE_EXCEEDED', warnings: [msg] };
    }
    return { ok: false, code: 'SOURCE_INVALID', warnings: [msg] };
  }
}

// ── Tool: check_vision_error ───────────────────────────────────────────────────

function handleCheckVisionError(args) {
  const text = args && typeof args.text === 'string' ? args.text : '';
  const is_error = visionUtils.detectVisionError(text);

  // Return matched patterns for diagnostics
  const matched_patterns = is_error
    ? visionUtils.VISION_ERROR_PATTERNS.filter((p) => p.test(text)).map((p) => p.source)
    : [];

  return { is_error, matched_patterns };
}

// ── Tool: image_save ───────────────────────────────────────────────────────────

/**
 * Determine file extension from MIME type.
 * @param {string} mime
 * @returns {string} extension without dot
 */
function extFromMime(mime) {
  const map = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
  };
  return map[mime] || 'bin';
}

/**
 * Save a buffer to the vision temp directory.
 * @param {Buffer} buffer
 * @param {string} mime
 * @returns {string} saved file path
 */
function saveToVisionDir(buffer, mime) {
  const ext = extFromMime(mime);
  const destPath = visionUtils.resolveVisionPath(ext);
  fs.writeFileSync(destPath, buffer);
  return destPath;
}

/**
 * Cleanup: remove a file if it exists (best-effort).
 * @param {string} filePath
 */
function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // best-effort cleanup
  }
}

/**
 * Handle image_save for source="path".
 */
async function handleImageSavePath(value, maxBytes, requestId) {
  const warnings = [];

  // 1. Check file exists
  if (!fs.existsSync(value)) {
    return { ok: false, code: 'SOURCE_INVALID', warnings: ['file not found'], saved_path: null };
  }

  // 2. Read file
  const buffer = fs.readFileSync(value);

  // 3. Validate magic header
  const { mime } = visionUtils.validateMagicHeader(buffer);

  // 4. Assert size cap
  visionUtils.assertSizeCap(buffer, maxBytes);

  // 5. Save to deterministic output path (cache by basename)
  const baseName = path.basename(value);
  const rawName = baseName.replace(/\.[^.]+$/, '') || 'unnamed';
  const name = rawName.replace(/[^a-z0-9._-]/gi, '_').substring(0, 128);
  const ext = extFromMime(mime);
  const outputPath = visionUtils.resolveOutputPath(name, ext);

  // Check cache: same basename + same content → same path
  if (fs.existsSync(outputPath)) {
    try {
      const cachedBuf = fs.readFileSync(outputPath);
      const { mime: cachedMime } = visionUtils.validateMagicHeader(cachedBuf);
      visionUtils.assertSizeCap(cachedBuf, maxBytes);
      logger('info', 'image_save.success', { request_id: requestId, size_bytes: cachedBuf.length, source: 'path', mime: cachedMime, cached: true });
      return { ok: true, saved_path: outputPath, warnings, size_bytes: cachedBuf.length, mime: cachedMime, cached: true };
    } catch {
      safeUnlink(outputPath);
    }
  }

  fs.writeFileSync(outputPath, buffer);

  logger('info', 'image_save.success', { request_id: requestId, size_bytes: buffer.length, source: 'path', mime });

  return {
    ok: true,
    saved_path: outputPath,
    warnings,
    size_bytes: buffer.length,
    mime,
  };
}

/**
 * Handle image_save for source="url".
 */
async function handleImageSaveUrl(value, maxBytes, timeoutMs, requestId) {
  const warnings = [];

  // 0. Deterministic output path (cache by URL hash)
  const name = visionUtils.getUrlCacheKey(value);
  const guessedExt = value.split('.').pop()?.split('?')[0]?.toLowerCase() || 'bin';
  const outputPath = visionUtils.resolveOutputPath(name, guessedExt);

  // Check cache: file exists + valid magic header + size cap
  if (fs.existsSync(outputPath)) {
    try {
      const buf = fs.readFileSync(outputPath);
      const { mime } = visionUtils.validateMagicHeader(buf);
      visionUtils.assertSizeCap(buf, maxBytes);
      logger('info', 'image_save.success', { request_id: requestId, size_bytes: buf.length, source: 'url', mime, cached: true });
      return { ok: true, saved_path: outputPath, warnings: [], size_bytes: buf.length, mime, cached: true };
    } catch {
      // Cache corrupted — remove and re-download
      safeUnlink(outputPath);
    }
  }

  // 1. SSRF check
  const safety = await visionUtils.isSafeUrlAsync(value);
  if (!safety.ok) {
    logger('warn', 'image_save.error', { request_id: requestId, code: 'SSRF_BLOCKED', source: 'url' });
    return { ok: false, code: 'SSRF_BLOCKED', warnings: [safety.reason || 'SSRF_BLOCKED'], saved_path: null };
  }

  // 2. Download with timeout
  let buffer;
  try {
    buffer = await downloadUrl(value, maxBytes, timeoutMs);
  } catch (err) {
    const msg = err.message || String(err);
    if (msg.startsWith('SIZE_EXCEEDED')) {
      logger('warn', 'image_save.error', { request_id: requestId, code: 'SIZE_EXCEEDED', source: 'url' });
      return { ok: false, code: 'SIZE_EXCEEDED', warnings: [msg], saved_path: null };
    }
    logger('warn', 'image_save.error', { request_id: requestId, code: 'FETCH_FAILED', source: 'url' });
    return { ok: false, code: 'FETCH_FAILED', warnings: [msg], saved_path: null };
  }

  // 3. Validate size cap + detect MIME, save to deterministic output path
  try {
    const { mime } = visionUtils.validateMagicHeader(buffer);
    visionUtils.assertSizeCap(buffer, maxBytes);

    fs.writeFileSync(outputPath, buffer);

    logger('info', 'image_save.success', { request_id: requestId, size_bytes: buffer.length, source: 'url', mime });

    return {
      ok: true,
      saved_path: outputPath,
      warnings,
      size_bytes: buffer.length,
      mime,
    };
  } catch (err) {
    const msg = err.message || String(err);
    safeUnlink(outputPath);

    if (msg.startsWith('SIZE_EXCEEDED')) {
      logger('warn', 'image_save.error', { request_id: requestId, code: 'SIZE_EXCEEDED', source: 'url' });
      return { ok: false, code: 'SIZE_EXCEEDED', warnings: [msg], saved_path: null };
    }
    logger('warn', 'image_save.error', { request_id: requestId, code: 'MCP_UNAVAILABLE', source: 'url' });
    return { ok: false, code: 'MCP_UNAVAILABLE', warnings: [msg], saved_path: null };
  }
}

/**
 * Download a URL into a Buffer with timeout and size cap.
 * @param {string} urlString
 * @param {number} maxBytes
 * @returns {Promise<Buffer>}
 */
const MAX_REDIRECTS = 5;

function downloadUrl(urlString, maxBytes, timeoutMs = FETCH_TIMEOUT_MS, _depth = 0) {
  return new Promise((resolve, reject) => {
    if (_depth > MAX_REDIRECTS) {
      return reject(new Error('SSRF_BLOCKED: too many redirects'));
    }

    let parsed;
    try {
      parsed = new URL(urlString);
    } catch {
      return reject(new Error('FETCH_FAILED: invalid URL'));
    }

    const client = parsed.protocol === 'https:' ? https : http;

    const req = client.get(urlString, { timeout: timeoutMs }, (res) => {
      // Follow one redirect (max MAX_REDIRECTS hops)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); // drain
        // Validate redirect target for SSRF
        visionUtils.isSafeUrlAsync(res.headers.location).then((safety) => {
          if (!safety.ok) {
            return reject(new Error('SSRF_BLOCKED: redirect target blocked'));
          }
          // Follow redirect with incremented depth counter
          downloadUrl(res.headers.location, maxBytes, timeoutMs, _depth + 1).then(resolve, reject);
        });
        return;
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`FETCH_FAILED: HTTP ${res.statusCode}`));
      }

      const chunks = [];
      let totalBytes = 0;

      res.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) {
          const maxMB = (maxBytes / (1024 * 1024)).toFixed(1);
          const actualMB = (totalBytes / (1024 * 1024)).toFixed(1);
          req.destroy(new Error(`SIZE_EXCEEDED: ${actualMB} MB exceeds ${maxMB} MB limit`));
          return;
        }
        chunks.push(chunk);
      });

      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', (err) => reject(new Error(`FETCH_FAILED: ${err.message}`)));
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`FETCH_FAILED: timeout after ${timeoutMs}ms`));
    });

    req.on('error', (err) => {
      reject(new Error(`FETCH_FAILED: ${err.message}`));
    });
  });
}

/**
 * Handle image_save for source="ado".
 *
 * If attachmentId is provided, downloads that single attachment (original behavior).
 * If attachmentId is omitted, lists all image attachments on the work item and
 * downloads every one of them, returning an array of saved paths.
 */
async function handleImageSaveAdo(value, maxBytes, requestId) {
  const warnings = [];

  if (!value || typeof value !== 'object') {
    return { ok: false, code: 'SOURCE_INVALID', warnings: ['value must be { workItemId, attachmentId? }'], saved_path: null };
  }

  const { workItemId, attachmentId } = value;

  if (!workItemId || typeof workItemId !== 'number') {
    return { ok: false, code: 'SOURCE_INVALID', warnings: ['workItemId (number) is required'], saved_path: null };
  }

  // ── Single-attachment mode (backward-compatible) ──────────────────────────
  if (attachmentId) {
    // Deterministic output path (cache by attachmentId)
    const ext = 'png'; // will be corrected after download based on actual MIME
    const outputPath = visionUtils.resolveOutputPath(attachmentId, ext);

    // Check cache
    if (fs.existsSync(outputPath)) {
      try {
        const buf = fs.readFileSync(outputPath);
        const { mime } = visionUtils.validateMagicHeader(buf);
        visionUtils.assertSizeCap(buf, maxBytes);
        logger('info', 'image_save.success', { request_id: requestId, size_bytes: buf.length, source: 'ado', mime, cached: true });
        return { ok: true, saved_path: outputPath, warnings, size_bytes: buf.length, mime, cached: true };
      } catch {
        safeUnlink(outputPath);
      }
    }

    let buffer;
    try {
      buffer = await visionUtils.downloadAdoAttachment({ workItemId, attachmentId }, maxBytes);
    } catch (err) {
      const msg = err.message || String(err);
      if (msg.startsWith('SIZE_EXCEEDED')) {
        logger('warn', 'image_save.error', { request_id: requestId, code: 'SIZE_EXCEEDED', source: 'ado' });
        return { ok: false, code: 'SIZE_EXCEEDED', warnings: [msg], saved_path: null };
      }
      logger('warn', 'image_save.error', { request_id: requestId, code: 'FETCH_FAILED', source: 'ado' });
      return { ok: false, code: 'FETCH_FAILED', warnings: [msg], saved_path: null };
    }

    try {
      const { mime } = visionUtils.validateMagicHeader(buffer);
      visionUtils.assertSizeCap(buffer, maxBytes);

      // Use correct extension from MIME — may differ from initial guess
      const correctExt = extFromMime(mime);
      const finalPath = visionUtils.resolveOutputPath(attachmentId, correctExt);

      // Remove initial-guess file if ext changed
      if (finalPath !== outputPath) safeUnlink(outputPath);

      fs.writeFileSync(finalPath, buffer);

      logger('info', 'image_save.success', { request_id: requestId, size_bytes: buffer.length, source: 'ado', mime });

      return {
        ok: true,
        saved_path: finalPath,
        warnings,
        size_bytes: buffer.length,
        mime,
      };
    } catch (err) {
      const msg = err.message || String(err);
      safeUnlink(outputPath);
      if (msg.startsWith('SIZE_EXCEEDED')) {
        logger('warn', 'image_save.error', { request_id: requestId, code: 'SIZE_EXCEEDED', source: 'ado' });
        return { ok: false, code: 'SIZE_EXCEEDED', warnings: [msg], saved_path: null };
      }
      logger('warn', 'image_save.error', { request_id: requestId, code: 'MCP_UNAVAILABLE', source: 'ado' });
      return { ok: false, code: 'MCP_UNAVAILABLE', warnings: [msg], saved_path: null };
    }
  }

  // ── All-images mode (attachmentId omitted) ────────────────────────────────
  let attachments;
  try {
    attachments = await visionUtils.listImageAttachments(workItemId);
  } catch (err) {
    const msg = err.message || String(err);
    logger('warn', 'image_save.error', { request_id: requestId, code: 'FETCH_FAILED', source: 'ado', step: 'listImageAttachments' });
    return { ok: false, code: 'FETCH_FAILED', warnings: [msg], saved_path: null, count: 0 };
  }

  if (!attachments || attachments.length === 0) {
    logger('warn', 'image_save.no_attachments', { request_id: requestId, source: 'ado', workItemId });
    return {
      ok: false,
      code: 'SOURCE_INVALID',
      warnings: [`No image attachments found in work item ${workItemId}`],
      saved_path: null,
      count: 0,
    };
  }

  const savedPaths = [];
  const downloadWarnings = [];
  let cachedCount = 0;

  for (const att of attachments) {
    // Deterministic output path (cache by attachmentId)
    const nameExt = att.name.split('.').pop()?.toLowerCase() || 'png';
    const outputPath = visionUtils.resolveOutputPath(att.attachmentId, nameExt);

    // Check cache: file exists + valid magic header + size cap
    if (fs.existsSync(outputPath)) {
      try {
        const buf = fs.readFileSync(outputPath);
        const { mime } = visionUtils.validateMagicHeader(buf);
        visionUtils.assertSizeCap(buf, maxBytes);
        savedPaths.push(outputPath);
        cachedCount++;
        logger('info', 'image_save.success', {
          request_id: requestId, size_bytes: buf.length,
          source: 'ado', mime,
          attachment_name: att.name, cached: true,
        });
        continue;
      } catch {
        // Cache corrupted — remove and re-download
        safeUnlink(outputPath);
      }
    }

    let buffer;
    try {
      buffer = await visionUtils.downloadAdoAttachment(
        { workItemId, attachmentId: att.attachmentId },
        maxBytes
      );
    } catch (err) {
      const msg = err.message || String(err);
      downloadWarnings.push(`Failed to download ${att.name} (${att.attachmentId}): ${msg}`);
      logger('warn', 'image_save.attachment_failed', {
        request_id: requestId,
        attachment_id: att.attachmentId,
        name: att.name,
        error: msg,
      });
      continue;
    }

    try {
      const { mime } = visionUtils.validateMagicHeader(buffer);
      visionUtils.assertSizeCap(buffer, maxBytes);

      // Use correct extension from MIME — may differ from filename guess
      const correctExt = extFromMime(mime);
      const finalPath = visionUtils.resolveOutputPath(att.attachmentId, correctExt);

      // Remove initial-guess file if ext changed
      if (finalPath !== outputPath) safeUnlink(outputPath);

      fs.writeFileSync(finalPath, buffer);
      savedPaths.push(finalPath);

      logger('info', 'image_save.success', {
        request_id: requestId,
        size_bytes: buffer.length,
        source: 'ado',
        mime,
        attachment_name: att.name,
      });
    } catch (err) {
      const msg = err.message || String(err);
      safeUnlink(outputPath);
      downloadWarnings.push(`Failed to validate/save ${att.name}: ${msg}`);
      logger('warn', 'image_save.validate_failed', {
        request_id: requestId,
        attachment_id: att.attachmentId,
        name: att.name,
        error: msg,
      });
    }
  }

  if (savedPaths.length === 0) {
    return {
      ok: false,
      code: 'FETCH_FAILED',
      warnings: [...downloadWarnings, 'All attachments failed to download or validate'],
      saved_path: null,
      saved_paths: [],
      count: 0,
    };
  }

  return {
    ok: true,
    saved_paths: savedPaths,
    warnings: downloadWarnings,
    count: savedPaths.length,
    cached_count: cachedCount,
  };
}

/**
 * Main dispatcher for image_save.
 */
async function handleImageSave(args, requestId) {
  const source = args && args.source;
  const value = args && args.value;
  const options = args && args.options;
  const maxBytes = (options && typeof options.maxBytes === 'number')
    ? options.maxBytes
    : DEFAULT_MAX_BYTES;
  const timeoutMs = (options && typeof options.timeoutMs === 'number')
    ? options.timeoutMs
    : FETCH_TIMEOUT_MS;

  try {
    switch (source) {
      case 'path':
        return await handleImageSavePath(value, maxBytes, requestId);
      case 'url':
        return await handleImageSaveUrl(value, maxBytes, timeoutMs, requestId);
      case 'ado':
        return await handleImageSaveAdo(value, maxBytes, requestId);
      default:
        return {
          ok: false,
          code: 'SOURCE_INVALID',
          warnings: [`unknown source '${source}', expected 'path'|'url'|'ado'`],
          saved_path: null,
        };
    }
  } catch (err) {
    const msg = err.message || String(err);
    logger('error', 'image_save_unexpected', { source, request_id: requestId, error: msg });

    // Map known error prefixes
    if (msg.startsWith('SOURCE_INVALID')) {
      return { ok: false, code: 'SOURCE_INVALID', warnings: [msg], saved_path: null };
    }
    if (msg.startsWith('SIZE_EXCEEDED')) {
      return { ok: false, code: 'SIZE_EXCEEDED', warnings: [msg], saved_path: null };
    }
    if (msg.startsWith('SSRF_BLOCKED')) {
      return { ok: false, code: 'SSRF_BLOCKED', warnings: [msg], saved_path: null };
    }
    if (msg.startsWith('FETCH_FAILED')) {
      return { ok: false, code: 'FETCH_FAILED', warnings: [msg], saved_path: null };
    }

    return { ok: false, code: 'MCP_UNAVAILABLE', warnings: [msg], saved_path: null };
  }
}

// ── Tool definitions (for tools/list) ──────────────────────────────────────────

const TOOL_DEFINITIONS = [
  {
    name: 'image_save',
    description: 'Save a file from a local path, URL, or Azure DevOps attachment to the vision temp directory. Detects known image formats (PNG/JPEG/WebP/GIF/AVIF) via magic header for metadata; unknown formats are saved as application/octet-stream. Enforces size cap.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          enum: ['path', 'url', 'ado'],
          description: 'Source type: "path" (local file), "url" (HTTP/HTTPS), or "ado" (Azure DevOps attachment).',
        },
        value: {
          description: 'Source value. For "path": file path string. For "url": URL string. For "ado": { workItemId: number, attachmentId?: string }. If attachmentId is omitted, ALL image attachments are downloaded.',
          oneOf: [
            { type: 'string', description: 'File path (source="path") or URL (source="url")' },
            {
              type: 'object',
              properties: {
                workItemId: { type: 'number', description: 'Azure DevOps work item ID (required for source="ado")' },
                attachmentId: { type: 'string', description: 'Optional: specific attachment GUID. If omitted, all image attachments are downloaded.' },
              },
              required: ['workItemId'],
              additionalProperties: false,
            },
          ],
        },
        options: {
          type: 'object',
          properties: {
            maxBytes: {
              type: 'number',
              description: 'Override default max image size (default: 10 MB).',
            },
            timeoutMs: {
              type: 'number',
              description: 'Override HTTP timeout in ms (default 10000).',
            },
          },
          additionalProperties: false,
        },
      },
      required: ['source', 'value'],
      additionalProperties: false,
    },
  },
  {
    name: 'image_get_dir',
    description: 'Get the temporary directory path where vision images are stored.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: 'image_validate',
    description: 'Validate an existing file: check existence, detect format via magic header (known formats return specific MIME, unknown formats return application/octet-stream), and size cap.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Absolute path to the image file to validate.',
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_vision_error',
    description: 'Check if a text string matches known vision/multimodal error patterns (e.g. "model does not support images").',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Text to scan for vision error patterns.',
        },
      },
      required: ['text'],
      additionalProperties: false,
    },
  },
];

// ── JSON-RPC method handlers ───────────────────────────────────────────────────

function handleInitialize(id) {
  return rpcResult(id, {
    protocolVersion: PROTOCOL_VERSION,
    capabilities: {
      tools: {},
    },
    serverInfo: {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
  });
}

function handleToolsList(id) {
  return rpcResult(id, { tools: TOOL_DEFINITIONS });
}

function handlePing(id) {
  return rpcResult(id, {});
}

/**
 * Dispatch a tools/call to the appropriate handler.
 * @param {string|number} id — JSON-RPC request ID
 * @param {object} params — { name, arguments }
 */
async function handleToolsCall(id, params) {
  const name = params && params.name;
  const args = (params && params.arguments) || {};

  logger('debug', 'tools_call', { tool: name, request_id: id });

  try {
    let result;

    switch (name) {
      case 'image_save':
        result = await handleImageSave(args, id);
        break;
      case 'image_get_dir':
        result = handleImageGetDir();
        break;
      case 'image_validate':
        result = handleImageValidate(args);
        break;
      case 'check_vision_error':
        result = handleCheckVisionError(args);
        break;
      default:
        return rpcError(id, -32601, `Method not found: tools/call name='${name}'`);
    }

    // Wrap tool result in MCP content format
    return rpcResult(id, {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result),
        },
      ],
    });
  } catch (err) {
    const msg = err.message || String(err);
    logger('error', 'tools_call_exception', { tool: name, request_id: id, error: msg });

    // Return a tool-level error (not a JSON-RPC error) so the client can inspect it
    const errorResult = { ok: false, code: 'MCP_UNAVAILABLE', warnings: [msg], saved_path: null };
    return rpcResult(id, {
      content: [
        {
          type: 'text',
          text: JSON.stringify(errorResult),
        },
      ],
      isError: true,
    });
  }
}

// ── Main loop: JSON-RPC over stdio ─────────────────────────────────────────────

function dispatchMessage(rawLine) {
  let msg;
  try {
    msg = JSON.parse(rawLine);
  } catch {
    logger('warn', 'invalid_json', { snippet: rawLine.slice(0, 200) });
    return; // Ignore malformed input — do NOT crash
  }

  // Validate JSON-RPC 2.0 envelope
  if (!msg || msg.jsonrpc !== '2.0') {
    logger('warn', 'missing_jsonrpc_version');
    return; // Ignore — spec says invalid messages are silently dropped
  }

  const id = msg.id; // May be undefined for notifications

  // Notifications (no id) — no response needed
  if (id === undefined || id === null) {
    if (msg.method === 'notifications/initialized') {
      logger('info', 'client_initialized');
    }
    return;
  }

  const method = msg.method;

  switch (method) {
    case 'initialize':
      sendResponse(handleInitialize(id));
      break;

    case 'tools/list':
      sendResponse(handleToolsList(id));
      break;

    case 'tools/call':
      // Async — respond when done
      handleToolsCall(id, msg.params || {})
        .then((resp) => sendResponse(resp))
        .catch((err) => {
          logger('error', 'unhandled_tools_call', { request_id: id, error: err.message });
          sendResponse(rpcError(id, -32603, 'Internal error'));
        });
      break;

    case 'ping':
      sendResponse(handlePing(id));
      break;

    default:
      // Unknown method → -32601
      logger('warn', 'unknown_method', { method });
      sendResponse(rpcError(id, -32601, `Method not found: ${method}`));
      break;
  }
}

// ── Graceful shutdown ──────────────────────────────────────────────────────────

function gracefulShutdown(signal) {
  logger('info', 'shutdown', { signal });
  try {
    rl.close();
  } catch {
    // ignore
  }
  process.exit(0);
}

process.on('SIGPIPE', () => gracefulShutdown('SIGPIPE'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
// disconnect não é emitido em MCP stdio — removido intencionalmente

// Catch unhandled errors — NEVER crash
process.on('uncaughtException', (err) => {
  logger('error', 'uncaught_exception', { error: err.message, stack: err.stack });
});
process.on('unhandledRejection', (reason) => {
  logger('error', 'unhandled_rejection', { error: String(reason) });
});

// ── Start ──────────────────────────────────────────────────────────────────────

const rl = readline.createInterface({
  input: process.stdin,
  terminal: false,
});

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return; // Skip empty lines
  dispatchMessage(trimmed);
});

rl.on('close', () => {
  logger('info', 'stdin_closed');
  process.exit(0);
});

logger('info', 'server_started', { name: SERVER_NAME, version: SERVER_VERSION, pid: process.pid });
