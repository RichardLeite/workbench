#!/usr/bin/env node
// vision-utils.js — Cross-platform image I/O & vision-error detection utility
//
// Zero npm dependencies — Node.js stdlib only (fs, path, os, crypto, https, http, url, net, dns).
//
// Exports:
//   validateMagicHeader(buffer)           → { ok, mime } (never throws for unknown formats; throws MIME_INVALID only for empty/non-Buffer)
//   resolveVisionPath(ext)                → absolute temp path string (random name, backward-compat)
//   resolveOutputPath(name, ext)          → absolute deterministic path: vision-{name}.{ext}
//   getUrlCacheKey(urlString)             → 8-char hex SHA-256 hash of URL
//   isSafeUrl(urlString)                  → { ok, reason? }  (sync — IP literal only)
//   isSafeUrlAsync(urlString)             → { ok, reason? }  (async — dns.lookup first)
//   adoGet(urlString)                     → parsed JSON object | throws FETCH_FAILED
//   extractAttachmentsFromFields(workItem, org?) → [{ attachmentId, name, projectId, source }]
//   extractAttachmentsFromComments(workItemId, org?) → [{ attachmentId, name, projectId, source, commentId }]
//   listImageAttachments(workItemId, org?) → [{ attachmentId, name, resourceSize, url, source }]
//   downloadAdoAttachment({ workItemId, attachmentId, org })  → Buffer | throws FETCH_FAILED
//   detectVisionError(text)               → boolean
//   assertSizeCap(buffer, maxBytes?)      → void | throws SIZE_EXCEEDED
//
// CLI:
//   node scripts/vision-utils.js <path>   → JSON { ok, mime, size } on stdout
//
// Exit codes (CLI): 0 success, 2 MIME_INVALID (buffer too short), 3 SOURCE_INVALID, 4 SIZE_EXCEEDED

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const { URL } = require('url');
const dns = require('dns');
const net = require('net');

// ── Constants ──────────────────────────────────────────────────────────────────

/** Default maximum image size: 10 MB */
const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** Default HTTP timeout: 10 seconds */
const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * 19 regex patterns for vision-error detection (case-insensitive).
 * Exported as VISION_ERROR_PATTERNS for inspection / tooling.
 */
const VISION_ERROR_PATTERNS = [
  /model does not support (image|vision)/i,
  /cannot (process|analyze|view|see) (image|this)/i,
  /unable to (process|analyze) (image|this)/i,
  /i can('?|no)t see images?/i,
  /no (image )?vision (capability|support)/i,
  /image (analysis|processing) (unavailable|not supported)/i,
  /unsupported (content type|media type): image/i,
  /vision[- ]?capable (model|required)/i,
  /please provide (a |the )?(text|description)/i,
  /i('?| do not| don't) have (access to )?(image|vision)/i,
  /multimodal (capability|model) (required|needed)/i,
  /image input (was|is) (not|never) (provided|supported)/i,
  /failed to (decode|load|read) image/i,
  /content policy (rejected|blocked): image/i,
  /no image attachment (found|provided)/i,
  /this (model|version) (cannot|doesn't) (handle|support) image/i,
  /image url (is|was) (inaccessible|blocked|invalid)/i,
  /cannot read (binary|image) file/i,
  /unsupported (image )?format/i,
];

// ── .env loader (shared pattern with start-azure-devops-mcp.js) ────────────────

/**
 * Load environment variables from .env at workbench root.
 * Only sets variables that are NOT already in process.env (no overwrite).
 */
function loadEnv() {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!process.env[key]) {
      process.env[key] = val;
    }
  }
}

// Load .env on module import
loadEnv();

// ── validateMagicHeader ────────────────────────────────────────────────────────

/**
 * Detect image format from magic bytes (first 8–12 bytes) against PNG, JPEG, WebP, GIF, AVIF signatures.
 *
 * Known formats return their specific MIME type (e.g. 'image/png').
 * Unknown formats (non-empty buffer that doesn't match any known signature)
 * return `{ ok: true, mime: 'application/octet-stream' }` — the file is still
 * saved and downstream vision analysis decides if it can process it.
 *
 * Only throws for truly invalid input: empty buffer or non-Buffer (length < 3).
 *
 * @param {Buffer} buffer — at least 12 bytes recommended
 * @returns {{ ok: true, mime: string }}
 * @throws {Error} MIME_INVALID only if buffer is too short (< 3 bytes) or not a Buffer
 */
function validateMagicHeader(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 3) {
    throw new Error('MIME_INVALID: buffer too short or not a Buffer');
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
    buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A
  ) {
    return { ok: true, mime: 'image/png' };
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return { ok: true, mime: 'image/jpeg' };
  }

  // WebP: RIFF .... WEBP  (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return { ok: true, mime: 'image/webp' };
  }

  // GIF: 47 49 46 38 (37|39) 61  →  GIF87a or GIF89a
  if (
    buffer.length >= 6 &&
    buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38 &&
    (buffer[4] === 0x37 || buffer[4] === 0x39) && buffer[5] === 0x61
  ) {
    return { ok: true, mime: 'image/gif' };
  }

  // AVIF: ISOBMFF container with 'avif' brand at bytes 8-11
  // Bytes 0-3: box size (variable, ignored)
  // Bytes 4-7: 'ftyp' (0x66 0x74 0x79 0x70)
  // Bytes 8-11: 'avif' (0x61 0x76 0x69 0x66)
  if (
    buffer.length >= 12 &&
    buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70 &&
    buffer[8] === 0x61 && buffer[9] === 0x76 && buffer[10] === 0x69 && buffer[11] === 0x66
  ) {
    return { ok: true, mime: 'image/avif' };
  }

  // No known format matched — return generic MIME so the file is still saved.
  // Downstream vision analysis will decide if it can process the content.
  return { ok: true, mime: 'application/octet-stream' };
}

// ── resolveOutputPath ──────────────────────────────────────────────────────────

/**
 * Return a deterministic cross-platform path for a vision image.
 * Creates `<os.tmpdir()>/opencode/` if it does not exist.
 *
 * The filename is `vision-{name}.{ext}` — deterministic by design:
 * - ADO: name = attachmentId (GUID)
 * - URL: name = SHA-256(url)[0..7]
 * - Path: name = basename without extension
 *
 * @param {string} name — deterministic identifier (attachmentId, URL hash, or basename)
 * @param {string} ext — file extension without dot (e.g. 'png', 'webp')
 * @returns {string} absolute path: `<tmpdir>/opencode/vision-{name}.{ext}`
 */
function resolveOutputPath(name, ext) {
  if (!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(name)) {
    throw new Error(`SOURCE_INVALID: invalid output name '${name}'`);
  }
  if (!/^[a-z0-9]{1,8}$/i.test(ext)) {
    throw new Error(`SOURCE_INVALID: invalid extension '${ext}'`);
  }

  const imgDir = path.join(os.tmpdir(), 'opencode');
  if (!fs.existsSync(imgDir)) {
    fs.mkdirSync(imgDir, { recursive: true });
  }
  return path.join(imgDir, `vision-${name}.${ext}`);
}

// ── resolveVisionPath ──────────────────────────────────────────────────────────

/**
 * Return a cross-platform temporary path for a vision image (backward-compat).
 * Uses resolveOutputPath with a random name (timestamp + hex).
 * Creates `<os.tmpdir()>/opencode/` if it does not exist.
 *
 * @param {string} ext — file extension without dot (e.g. 'png', 'webp')
 * @returns {string} absolute path: `<tmpdir>/opencode/vision-{ts}-{8-char-hex}.{ext}`
 */
function resolveVisionPath(ext) {
  const rand = crypto.randomBytes(4).toString('hex');
  return resolveOutputPath(`${Date.now()}-${rand}`, ext);
}

// ── SSRF helpers ───────────────────────────────────────────────────────────────

/**
 * Check if an IPv4 address (as 32-bit integer) falls within a blocked private/reserved range.
 * @param {number} ip4 — 32-bit unsigned integer
 * @returns {boolean} true if blocked
 */
function isPrivateIPv4(ip4) {
  // 127.0.0.0/8
  if ((ip4 >>> 24) === 127) return true;
  // 10.0.0.0/8
  if ((ip4 >>> 24) === 10) return true;
  // 172.16.0.0/12  (172.16.0.0 – 172.31.255.255)
  if ((ip4 >>> 20) === 0xAC1) return true; // 172.16 → 0xAC10, top 12 bits = 0xAC1
  // 192.168.0.0/16
  if ((ip4 >>> 16) === 0xC0A8) return true;
  // 169.254.0.0/16 (link-local — metadata services)
  if ((ip4 >>> 16) === 0xA9FE) return true;
  // 0.0.0.0/8
  if ((ip4 >>> 24) === 0) return true;
  return false;
}

/**
 * Parse an IPv4 dotted string into a 32-bit unsigned integer.
 * @param {string} addr — e.g. '127.0.0.1'
 * @returns {number|null} 32-bit uint or null if not valid IPv4
 */
function parseIPv4(addr) {
  const parts = addr.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const n = parseInt(part, 10);
    if (isNaN(n) || n < 0 || n > 255 || String(n) !== part) return null;
    result = (result * 256 + n) >>> 0;
  }
  return result;
}

/**
 * Check if an IPv6 address string falls within a blocked range.
 * Simplified check for common private/reserved IPv6 prefixes.
 * @param {string} addr — IPv6 address string (may contain brackets)
 * @returns {boolean} true if blocked
 */
function isPrivateIPv6(addr) {
  // Strip brackets if present
  const clean = addr.replace(/^\[|\]$/g, '').toLowerCase();

  // ::1/128 — loopback
  if (clean === '::1' || clean === '0000:0000:0000:0000:0000:0000:0000:0001') return true;

  // fc00::/7 — ULA (fc00:: to fdff::)
  if (/^f[cd]/.test(clean)) return true;

  // fe80::/10 — link-local
  if (/^fe[89ab]/.test(clean)) return true;

  // ff00::/8 — multicast
  if (/^ff/.test(clean)) return true;

  // :: (unspecified)
  if (clean === '::' || clean === '0000:0000:0000:0000:0000:0000:0000:0000') return true;

  // IPv4-mapped IPv6 (::ffff:x.x.x.x)
  const v4Mapped = clean.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (v4Mapped) {
    const v4 = parseIPv4(v4Mapped[1]);
    if (v4 !== null && isPrivateIPv4(v4)) return true;
  }

  return false;
}

/**
 * Check if an IP address string (v4 or v6) is in a blocked private/reserved range.
 * @param {string} ip
 * @returns {boolean} true if blocked (private/reserved)
 */
function isBlockedIP(ip) {
  if (net.isIPv4(ip)) {
    const v4 = parseIPv4(ip);
    return v4 !== null && isPrivateIPv4(v4);
  }
  if (net.isIPv6(ip)) {
    return isPrivateIPv6(ip);
  }
  // If we can't parse it, block it (fail-closed)
  return true;
}

/**
 * Synchronous SSRF check — validates protocol and IP ranges.
 * Only works with IP literals (not hostnames). For hostname resolution use isSafeUrlAsync.
 *
 * @param {string} urlString
 * @returns {{ ok: boolean, reason?: string }}
 */
function isSafeUrl(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return { ok: false, reason: 'SSRF_BLOCKED' };
  }

  // Protocol allowlist
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'SSRF_BLOCKED' };
  }

  const hostname = parsed.hostname;

  // Strip IPv6 brackets for parsing
  const bareHost = hostname.replace(/^\[|\]$/g, '');

  // Check if it's an IP address
  if (net.isIP(bareHost)) {
    if (isBlockedIP(bareHost)) {
      return { ok: false, reason: 'SSRF_BLOCKED' };
    }
    return { ok: true };
  }

  // For hostnames in sync mode, we can't resolve DNS — allow but flag that
  // production should use isSafeUrlAsync. For safety, block localhost-like names.
  const lowerHost = hostname.toLowerCase();
  if (lowerHost === 'localhost' || lowerHost.endsWith('.localhost')) {
    return { ok: false, reason: 'SSRF_BLOCKED' };
  }

  // Sync mode: hostname that isn't an IP literal — we can't resolve, so allow
  // (isSafeUrlAsync will do the real DNS check in production)
  return { ok: true };
}

/**
 * Asynchronous SSRF check — resolves hostname via DNS before range check.
 * Use this in production instead of isSafeUrl.
 *
 * @param {string} urlString
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
function isSafeUrlAsync(urlString) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(urlString);
    } catch {
      return resolve({ ok: false, reason: 'SSRF_BLOCKED' });
    }

    // Protocol allowlist
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return resolve({ ok: false, reason: 'SSRF_BLOCKED' });
    }

    const hostname = parsed.hostname;
    const bareHost = hostname.replace(/^\[|\]$/g, '');

    // If it's already an IP literal, check directly
    if (net.isIP(bareHost)) {
      if (isBlockedIP(bareHost)) {
        return resolve({ ok: false, reason: 'SSRF_BLOCKED' });
      }
      return resolve({ ok: true });
    }

    // Block obvious localhost hostnames without DNS
    const lowerHost = hostname.toLowerCase();
    if (lowerHost === 'localhost' || lowerHost.endsWith('.localhost')) {
      return resolve({ ok: false, reason: 'SSRF_BLOCKED' });
    }

    // Resolve hostname via DNS (with timeout)
    const SSRF_DNS_TIMEOUT_MS = 5000;
    const dnsPromise = new Promise((resolveDns) => {
      dns.lookup(hostname, { family: 0 }, (err, address) => {
        if (err) return resolveDns({ ok: false, reason: 'SSRF_BLOCKED' });
        if (isBlockedIP(address)) return resolveDns({ ok: false, reason: 'SSRF_BLOCKED' });
        resolveDns({ ok: true });
      });
    });
    const timeoutPromise = new Promise((resolveTimeout) => {
      setTimeout(() => resolveTimeout({ ok: false, reason: 'SSRF_BLOCKED' }), SSRF_DNS_TIMEOUT_MS);
    });
    resolve(Promise.race([dnsPromise, timeoutPromise]));
  });
}

// ── adoGet (shared ADO REST helper) ────────────────────────────────────────────

/**
 * Perform an authenticated GET request against Azure DevOps REST API.
 *
 * @param {string} urlString — full ADO REST URL
 * @returns {Promise<object>} parsed JSON body
 * @throws {Error} FETCH_FAILED on any error
 */
function adoGet(urlString) {
  return new Promise((resolve, reject) => {
    const token = process.env.ADO_MCP_AUTH_TOKEN;
    if (!token) {
      return reject(new Error('FETCH_FAILED: ADO_MCP_AUTH_TOKEN not set'));
    }

    const authBase64 = Buffer.from(':' + token).toString('base64');

    const req = https.get(
      urlString,
      {
        headers: {
          Authorization: `Basic ${authBase64}`,
          Accept: 'application/json',
        },
        timeout: DEFAULT_TIMEOUT_MS,
      },
      (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          return reject(new Error(`FETCH_FAILED: ADO returned HTTP ${res.statusCode} for ${urlString}`));
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString('utf8');
            resolve(JSON.parse(body));
          } catch (parseErr) {
            reject(new Error(`FETCH_FAILED: invalid JSON response from ${urlString}`));
          }
        });
        res.on('error', (err) => reject(new Error(`FETCH_FAILED: ${err.message}`)));
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`FETCH_FAILED: timeout after ${DEFAULT_TIMEOUT_MS}ms`));
    });

    req.on('error', (err) => {
      reject(new Error(`FETCH_FAILED: ${err.message}`));
    });
  });
}

// ── extractAttachmentsFromFields ───────────────────────────────────────────────

/**
 * Extract image references from HTML and Markdown content in work item fields.
 * Searches for <img src="..."> and ![alt](...) patterns referencing ADO attachments
 * in System.Description and Microsoft.VSTS.Common.AcceptanceCriteria.
 *
 * @param {object} workItem — ADO work item JSON (with .fields)
 * @param {string} [org] — ADO organization name (default: AZURE_DEVOPS_ORG)
 * @returns {Array<{ attachmentId: string, name: string, projectId: string, source: string }>}
 */
function extractAttachmentsFromFields(workItem, org = process.env.AZURE_DEVOPS_ORG || '') {
  const fields = (workItem && workItem.fields) || {};
  const htmlFields = [
    fields['System.Description'],
    fields['Microsoft.VSTS.Common.AcceptanceCriteria'],
  ].filter(Boolean);

  const attachments = [];
  const seen = new Set();

  // Regex for HTML: <img src=".../attachments/{guid}?fileName=...">
  const htmlRegex = new RegExp(
    '<img[^>]+src="[^"]*' +
    '/' + org + '/' +
    '([a-f0-9-]+)' +          // group 1: projectId
    '/_apis/wit/attachments/' +
    '([a-f0-9-]+)' +          // group 2: attachmentId
    '\\?fileName=' +
    '([^"&\\s]+)',             // group 3: fileName
    'gi'
  );

  // Regex for Markdown: ![alt](https://.../attachments/{guid}?fileName=...)
  const mdRegex = new RegExp(
    '!\\[.*?\\]\\([^)]*' +
    '/' + org + '/' +
    '([a-f0-9-]+)' +          // group 1: projectId
    '/_apis/wit/attachments/' +
    '([a-f0-9-]+)' +          // group 2: attachmentId
    '\\?fileName=' +
    '([^)&\\s]+)',             // group 3: fileName
    'gi'
  );

  for (const text of htmlFields) {
    if (!text) continue;

    // Parse HTML img tags
    let match;
    htmlRegex.lastIndex = 0;
    while ((match = htmlRegex.exec(text)) !== null) {
      const [, projectId, attachmentId, fileName] = match;
      if (!seen.has(attachmentId)) {
        seen.add(attachmentId);
        attachments.push({
          attachmentId,
          name: decodeURIComponent(fileName),
          projectId,
          source: 'field_html',
        });
      }
    }

    // Parse Markdown image syntax
    mdRegex.lastIndex = 0;
    while ((match = mdRegex.exec(text)) !== null) {
      const [, projectId, attachmentId, fileName] = match;
      if (!seen.has(attachmentId)) {
        seen.add(attachmentId);
        attachments.push({
          attachmentId,
          name: decodeURIComponent(fileName),
          projectId,
          source: 'field_markdown',
        });
      }
    }
  }

  return attachments;
}

// Backward-compat: callers should use extractAttachmentsFromFields
// const extractAttachmentsFromHtml = extractAttachmentsFromFields; // removed — no consumers found

// ── extractAttachmentsFromComments ─────────────────────────────────────────────

/**
 * Extract image references from work item comments.
 * Comments can contain images in HTML (<img src="...">) or Markdown (![alt](...)) format.
 *
 * @param {number} workItemId — Azure DevOps work item ID
 * @param {string} [org] — ADO organization name (default: AZURE_DEVOPS_ORG)
 * @returns {Promise<Array<{ attachmentId: string, name: string, projectId: string, source: string, commentId: number }>>}
 */
async function extractAttachmentsFromComments(workItemId, org = process.env.AZURE_DEVOPS_ORG || '') {
  const attachments = [];
  const seen = new Set();

  try {
    // First get the work item to extract the correct comments URL (with project GUID)
    const wiData = await adoGet(
      `https://dev.azure.com/${org}/_apis/wit/workItems/${workItemId}?api-version=7.0`
    );

    const commentsUrl = wiData._links?.workItemComments?.href;
    if (!commentsUrl) return attachments;

    const finalUrl = commentsUrl.includes('?')
      ? commentsUrl + '&$top=100'
      : commentsUrl + '?$top=100';

    const data = await adoGet(finalUrl);

    const comments = data.comments || [];

    // HTML regex
    const htmlRegex = new RegExp(
      '<img[^>]+src="[^"]*' +
      '/' + org + '/' +
      '([a-f0-9-]+)' +
      '/_apis/wit/attachments/' +
      '([a-f0-9-]+)' +
      '\\?fileName=' +
      '([^"&\\s]+)',
      'gi'
    );

    // Markdown regex
    const mdRegex = new RegExp(
      '!\\[.*?\\]\\([^)]*' +
      '/' + org + '/' +
      '([a-f0-9-]+)' +
      '/_apis/wit/attachments/' +
      '([a-f0-9-]+)' +
      '\\?fileName=' +
      '([^)&\\s]+)',
      'gi'
    );

    for (const comment of comments) {
      const text = comment.text || '';

      let match;

      // Parse HTML img tags
      htmlRegex.lastIndex = 0;
      while ((match = htmlRegex.exec(text)) !== null) {
        const [, projectId, attachmentId, fileName] = match;
        if (!seen.has(attachmentId)) {
          seen.add(attachmentId);
          attachments.push({
            attachmentId,
            name: decodeURIComponent(fileName),
            projectId,
            source: 'comment_html',
            commentId: comment.id,
          });
        }
      }

      // Parse Markdown image syntax
      mdRegex.lastIndex = 0;
      while ((match = mdRegex.exec(text)) !== null) {
        const [, projectId, attachmentId, fileName] = match;
        if (!seen.has(attachmentId)) {
          seen.add(attachmentId);
          attachments.push({
            attachmentId,
            name: decodeURIComponent(fileName),
            projectId,
            source: 'comment_markdown',
            commentId: comment.id,
          });
        }
      }
    }
  } catch (_err) {
    // Comments API may fail (403, WI without comments, etc.) — do not abort
  }

  return attachments;
}

// ── listImageAttachments ───────────────────────────────────────────────────────

/**
 * Known image file extensions — used for metadata detection only (e.g. choosing
 * file extension when saving). NOT used as a filter: listImageAttachments accepts
 * ALL file types regardless of extension.
 */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']);

/**
 * List all image attachments for an Azure DevOps work item.
 *
 * Three sources are checked:
 * 1. AttachedFile relations (explicit file attachments)
 * 2. Inline images in HTML/Markdown fields (description, acceptance criteria)
 * 3. Inline images in work item comments (HTML and Markdown)
 *
 * @param {number} workItemId — Azure DevOps work item ID
 * @param {string} [org] — ADO organization (default: AZURE_DEVOPS_ORG)
 * @returns {Promise<Array<{ attachmentId: string, name: string, resourceSize?: number, url?: string, source: string }>>}
 */
async function listImageAttachments(workItemId, org = process.env.AZURE_DEVOPS_ORG || '') {
  if (!workItemId || typeof workItemId !== 'number') {
    throw new Error('FETCH_FAILED: workItemId must be a number');
  }

  const url = `https://dev.azure.com/${org}/_apis/wit/workItems/${workItemId}?$expand=relations&api-version=7.0`;
  const data = await adoGet(url);

  const relations = data && Array.isArray(data.relations) ? data.relations : [];

  const results = [];
  const seen = new Set();

  // 1. Extract from AttachedFile relations (no extension filter — accept all file types)
  for (const rel of relations) {
    if (rel.rel !== 'AttachedFile') continue;

    const attrs = rel.attributes || {};

    // Extract attachment GUID from URL
    // URL format: https://dev.azure.com/{org}/_apis/wit/attachments/{guid}
    let attachmentId = null;
    if (rel.url) {
      const match = rel.url.match(/attachments\/([0-9a-f-]{36})/i);
      if (match) attachmentId = match[1];
    }

    if (!attachmentId) continue;

    if (!seen.has(attachmentId)) {
      seen.add(attachmentId);
      results.push({
        attachmentId,
        name: attrs.name || 'unknown',
        resourceSize: typeof attrs.resourceSize === 'number' ? attrs.resourceSize : 0,
        url: rel.url,
        source: 'attached_file',
      });
    }
  }

  // 2. Extract inline images from fields (description + acceptance criteria) — HTML + Markdown
  const fieldAttachments = extractAttachmentsFromFields(data, org);
  for (const att of fieldAttachments) {
    if (!seen.has(att.attachmentId)) {
      seen.add(att.attachmentId);
      results.push(att);
    }
  }

  // 3. Extract inline images from comments — HTML + Markdown
  const commentAttachments = await extractAttachmentsFromComments(workItemId, org);
  for (const att of commentAttachments) {
    if (!seen.has(att.attachmentId)) {
      seen.add(att.attachmentId);
      results.push(att);
    }
  }

  return results;
}

// ── downloadAdoAttachment ──────────────────────────────────────────────────────

/**
 * Download an attachment from Azure DevOps via REST API.
 *
 * @param {{ workItemId: number, attachmentId: string, org?: string }} params
 * @returns {Promise<Buffer>}
 * @throws {Error} FETCH_FAILED on any error
 */
function downloadAdoAttachment({ workItemId, attachmentId, org = process.env.AZURE_DEVOPS_ORG || '' }, maxBytes = DEFAULT_MAX_IMAGE_BYTES) {
  if (!attachmentId) {
    return Promise.reject(new Error('FETCH_FAILED: attachmentId is required'));
  }

  const logPrefix = workItemId ? `[WI ${workItemId}]` : '';

  return new Promise((resolve, reject) => {
    const token = process.env.ADO_MCP_AUTH_TOKEN;
    if (!token) {
      return reject(new Error('FETCH_FAILED: ADO_MCP_AUTH_TOKEN not set'));
    }

    const authBase64 = Buffer.from(':' + token).toString('base64');
    const url = `https://dev.azure.com/${org}/_apis/wit/attachments/${attachmentId}?api-version=7.0`;

    const req = https.get(
      url,
      {
        headers: {
          Authorization: `Basic ${authBase64}`,
          'Content-Type': 'application/octet-stream',
        },
        timeout: DEFAULT_TIMEOUT_MS,
      },
      (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume(); // drain
          return reject(new Error(`FETCH_FAILED: ADO returned HTTP ${res.statusCode} for attachment ${attachmentId}${logPrefix}`));
        }

        const chunks = [];
        let totalBytes = 0;

        res.on('data', (chunk) => {
          totalBytes += chunk.length;
          if (totalBytes > maxBytes) {
            const maxMB = (maxBytes / (1024 * 1024)).toFixed(1);
            const actualMB = (totalBytes / (1024 * 1024)).toFixed(1);
            req.destroy(new Error(`SIZE_EXCEEDED during stream${logPrefix}: ${actualMB} MB exceeds ${maxMB} MB limit`));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', (err) => reject(new Error(`FETCH_FAILED${logPrefix}: ${err.message}`)));
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`FETCH_FAILED${logPrefix}: timeout after ${DEFAULT_TIMEOUT_MS}ms`));
    });

    req.on('error', (err) => {
      reject(new Error(`FETCH_FAILED${logPrefix}: ${err.message}`));
    });
  });
}

// ── detectVisionError ──────────────────────────────────────────────────────────

/**
 * Detect if a text string matches any of the 17 known vision-error patterns.
 *
 * @param {string} text
 * @returns {boolean} true if at least one pattern matches
 */
function detectVisionError(text) {
  if (!text || typeof text !== 'string') return false;
  return VISION_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

// ── getUrlCacheKey ─────────────────────────────────────────────────────────────

/**
 * Derive a short deterministic cache key from a URL string.
 * Returns the first 8 hex characters of the SHA-256 hash of the URL.
 *
 * @param {string} urlString — the URL to derive a key from
 * @returns {string} 8-character hex string
 */
function getUrlCacheKey(urlString) {
  return crypto.createHash('sha256').update(urlString).digest('hex').slice(0, 8);
}

// ── assertSizeCap ──────────────────────────────────────────────────────────────

/**
 * Assert that a buffer does not exceed the maximum allowed size.
 *
 * @param {Buffer} buffer
 * @param {number} [maxBytes=DEFAULT_MAX_IMAGE_BYTES] — default 10 MB
 * @throws {Error} SIZE_EXCEEDED if buffer.length > maxBytes
 */
function assertSizeCap(buffer, maxBytes = DEFAULT_MAX_IMAGE_BYTES) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('SIZE_EXCEEDED: input is not a Buffer');
  }
  if (buffer.length > maxBytes) {
    const maxMB = (maxBytes / (1024 * 1024)).toFixed(1);
    const actualMB = (buffer.length / (1024 * 1024)).toFixed(1);
    throw new Error(`SIZE_EXCEEDED: buffer ${actualMB} MB exceeds limit of ${maxMB} MB`);
  }
}

// ── CLI mode ───────────────────────────────────────────────────────────────────

if (require.main === module) {
  // Garantir Node 20+ (auto-descobre via nvm/fnm/volta/asdf)
  require('./lib/ensure-node-version')(20, 'TEAMS_MCP_NODE_PATH');
  const [, , filePath] = process.argv;

  if (!filePath) {
    process.stderr.write('Usage: node scripts/vision-utils.js <path>\n');
    process.exit(1);
  }

  try {
    const resolved = path.resolve(filePath);

    // Read file
    if (!fs.existsSync(resolved)) {
      process.stderr.write(`Error: file not found: ${resolved}\n`);
      process.exit(3);
    }

    const buffer = fs.readFileSync(resolved);

    // Validate magic header
    const { ok, mime } = validateMagicHeader(buffer);

    // Validate size cap
    assertSizeCap(buffer);

    // Success
    process.stdout.write(JSON.stringify({ ok, mime, size: buffer.length }) + '\n');
    process.exit(0);
  } catch (err) {
    const msg = err.message || String(err);

    if (msg.startsWith('MIME_INVALID')) {
      process.stderr.write(msg + '\n');
      process.exit(2);
    }
    if (msg.startsWith('SOURCE_INVALID')) {
      process.stderr.write(msg + '\n');
      process.exit(3);
    }
    if (msg.startsWith('SIZE_EXCEEDED')) {
      process.stderr.write(msg + '\n');
      process.exit(4);
    }

    // Unknown error
    process.stderr.write(msg + '\n');
    process.exit(1);
  }
}

// ── Exports ────────────────────────────────────────────────────────────────────

module.exports = {
  // Functions
  validateMagicHeader,
  resolveVisionPath,
  resolveOutputPath,
  getUrlCacheKey,
  isSafeUrl,
  isSafeUrlAsync,
  adoGet,
  extractAttachmentsFromFields,
  extractAttachmentsFromComments,
  listImageAttachments,
  downloadAdoAttachment,
  detectVisionError,
  assertSizeCap,

  // Constants
  VISION_ERROR_PATTERNS,
  DEFAULT_MAX_IMAGE_BYTES,
  DEFAULT_TIMEOUT_MS,
  IMAGE_EXTENSIONS,

  // Internal helpers (exported for testing)
  isBlockedIP,
  isPrivateIPv4,
  isPrivateIPv6,
  parseIPv4,
  loadEnv,
};
