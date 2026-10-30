#!/usr/bin/env node
/**
 * image-pipeline-skill.test.js — Static analysis tests for the image-pipeline SKILL.md
 *
 * Tests cover: frontmatter validation, procedure structure, vision error patterns,
 * output contract shape, and error codes.
 *
 * Uses Node.js built-in node:test with describe/it/assert.
 * No external parsers — simple fs.readFileSync + regex matching.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const SKILL_PATH = path.resolve(
  __dirname,
  "../../.opencode/skills/image-pipeline/SKILL.md"
);

const content = fs.readFileSync(SKILL_PATH, "utf-8");

/**
 * Minimal frontmatter parser — extracts YAML between the first pair of "---" fences.
 * Returns a plain object with string values (no full YAML spec support).
 */
function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split(/\r?\n/)) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    let value = line.slice(sep + 1).trim();
    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

const frontmatter = parseFrontmatter(content);

// ═══════════════════════════════════════════════════════════════════════════
// Harness functions — deterministic parts of the image-pipeline skill
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Auto-detect source_type from source string.
 * Returns { source_type, warnings[] }
 */
function autoDetectSourceType(source, explicitSourceType) {
  const warnings = [];
  const rules = [
    { pattern: /^AB#\d+/, type: "ado" },
    { pattern: /^https?:\/\//, type: "url" },
  ];

  if (explicitSourceType) {
    const autoTypes = rules
      .filter((r) => r.pattern.test(source))
      .map((r) => r.type);
    if (autoTypes.length > 0 && autoTypes[0] !== explicitSourceType) {
      warnings.push(
        `source_type explicitly set to '${explicitSourceType}', overriding auto-detect '${autoTypes[0]}'`
      );
    }
    return { source_type: explicitSourceType, warnings };
  }

  for (const rule of rules) {
    if (rule.pattern.test(source)) {
      warnings.push(
        `source_type auto-detected as '${rule.type}' from source prefix`
      );
      return { source_type: rule.type, warnings };
    }
  }

  return { source_type: "path", warnings: [] };
}

/**
 * Build MCP value argument from source and source_type.
 */
function buildMCPValue(source, sourceType) {
  switch (sourceType) {
    case "ado": {
      const match = source.match(/^AB#(\d+)/);
      if (!match) return { ok: false, code: "SOURCE_INVALID", value: null };
      return { ok: true, value: { workItemId: parseInt(match[1], 10) } };
    }
    case "url":
    case "path":
      return { ok: true, value: source };
    default:
      return { ok: false, code: "SOURCE_INVALID", value: null };
  }
}

/**
 * Build analises entry id from source type and metadata.
 */
function buildAnalysisId(sourceType, meta) {
  switch (sourceType) {
    case "ado":
      return `attachment:${meta.attachmentId}`;
    case "path":
      return `file:${meta.basename}`;
    case "url":
      return `url:${meta.url}`;
    default:
      return `unknown:${meta.fallback || "unknown"}`;
  }
}

/**
 * Build skill output from raw MCP result.
 * This simulates what the subagent does after receiving the MCP response.
 */
function buildSkillOutput(mcpResult, sourceType, source, analysisType) {
  const output = {
    ok: mcpResult.ok,
    analises: [],
    warnings: mcpResult.warnings || [],
  };

  if (!mcpResult.ok) {
    output.code = mcpResult.code;
    return output;
  }

  // Handle singular (path/url) vs plural (ado) result
  const savedPaths = [];
  if (mcpResult.saved_path) {
    savedPaths.push(mcpResult.saved_path);
  } else if (mcpResult.saved_paths) {
    savedPaths.push(...mcpResult.saved_paths);
  }

  for (const sp of savedPaths) {
    const basename = path.basename(sp);
    const filename = basename.replace(/^vision-/i, "");
    // Extract attachmentId from saved_path for ADO (format: vision-<id>.<ext>)
    const attachmentIdMatch = filename.match(/^([^.]+)/);
    const attachmentId =
      sourceType === "ado" && attachmentIdMatch
        ? attachmentIdMatch[1]
        : "mock-id";
    const meta = { attachmentId, basename: filename, url: source };
    const entry = {
      id: buildAnalysisId(sourceType, meta),
      source: sourceType,
      filename,
      saved_path: sp,
      analise: {
        tipo: analysisType === "ux_audit" ? "ux_audit" : "analise_imagem",
      },
    };
    // Add type-specific structure (placeholder — real analysis happens via LLM)
    if (analysisType === "visual_spec") {
      entry.analise.layout = {};
      entry.analise.cores = {};
      entry.analise.componentes = [];
      entry.analise.ordem_visual = {};
    } else if (analysisType === "ux_audit") {
      entry.analise.heuristicas_nielsen = [];
      entry.analise.problemas = [];
      entry.analise.sugestoes = [];
    }
    output.analises.push(entry);
  }

  return output;
}

/**
 * Validate the complete skill output against the contract in SKILL.md.
 */
function validateSkillContract(output) {
  const errors = [];

  // ok must be boolean
  if (typeof output.ok !== "boolean") errors.push("ok must be boolean");

  // analises must be array
  if (!Array.isArray(output.analises)) errors.push("analises must be array");

  if (output.ok) {
    // warnings must be array
    if (!Array.isArray(output.warnings))
      errors.push("warnings must be array on success");

    // Each analise entry must have required fields
    for (let i = 0; i < output.analises.length; i++) {
      const entry = output.analises[i];
      if (!entry.id) errors.push(`analises[${i}]: missing id`);
      if (!entry.source) errors.push(`analises[${i}]: missing source`);
      if (!entry.filename) errors.push(`analises[${i}]: missing filename`);
      if (!entry.saved_path)
        errors.push(`analises[${i}]: missing saved_path`);
      if (!entry.analise) errors.push(`analises[${i}]: missing analise`);
      if (entry.analise && !entry.analise.tipo)
        errors.push(`analises[${i}]: missing analise.tipo`);

      // id format
      if (entry.source === "ado" && entry.id && !entry.id.startsWith("attachment:")) {
        errors.push(
          `analises[${i}]: ado id must start with 'attachment:', got '${entry.id}'`
        );
      }
      if (entry.source === "path" && entry.id && !entry.id.startsWith("file:")) {
        errors.push(
          `analises[${i}]: path id must start with 'file:', got '${entry.id}'`
        );
      }
      if (entry.source === "url" && entry.id && !entry.id.startsWith("url:")) {
        errors.push(
          `analises[${i}]: url id must start with 'url:', got '${entry.id}'`
        );
      }
    }
  } else {
    // Failure: must have code
    if (!output.code) errors.push("code must be present on failure");
    if (!Array.isArray(output.analises) || output.analises.length !== 0) {
      errors.push("analises must be empty array on failure");
    }
    if (!Array.isArray(output.warnings))
      errors.push("warnings must be array on failure");
  }

  return { valid: errors.length === 0, errors };
}

// ── Group: Frontmatter validation ─────────────────────────────────────────────

describe("Frontmatter validation", () => {
  it("should have name equal to 'image-pipeline'", () => {
    assert.strictEqual(frontmatter.name, "image-pipeline");
  });

  it("should have description referencing mcp-image, image-analyzer, or ux-analyzer", () => {
    const desc = frontmatter.description || "";
    const hasRef =
      /mcp-image/.test(desc) ||
      /image-analyzer/.test(desc) ||
      /ux-analyzer/.test(desc);
    assert.ok(hasRef, `description should reference mcp-image/image-analyzer/ux-analyzer, got: "${desc.slice(0, 80)}..."`);
  });

  it("should have description containing the return contract (analises)", () => {
    const desc = frontmatter.description || "";
    const hasContract = /analises/.test(desc);
    assert.ok(hasContract, `description should contain 'analises' (return contract), got: "${desc.slice(0, 80)}..."`);
  });
});

// ── Group: Procedure structure ────────────────────────────────────────────────

describe("Procedure structure", () => {
  it("should contain all 6 procedure steps (Passo 1 through Passo 6)", () => {
    for (let i = 1; i <= 6; i++) {
      const pattern = new RegExp(`###\\s+Passo\\s+${i}\\b`);
      assert.ok(pattern.test(content), `SKILL.md should contain "### Passo ${i}"`);
    }
  });

  it("should use INSTRUA/INSTRUI convention (skill language)", () => {
    const hasInstr = /INSTRUA|INSTRUI/.test(content);
    assert.ok(hasInstr, 'SKILL.md should contain "INSTRUA" or "INSTRUI"');
  });

  it("should reference the MCP tool mcp-image__image_save", () => {
    assert.ok(
      /mcp-image__image_save/.test(content),
      'SKILL.md should reference "mcp-image__image_save"'
    );
  });
});

// ── Group: Vision error patterns ──────────────────────────────────────────────

describe("Vision error patterns", () => {
  it("should document exactly 19 vision error patterns in the table", () => {
    // Count rows in the pattern table: lines matching "| <number> |"
    const tableRows = content.match(/^\|\s*\d{1,2}\s*\|/gm) || [];
    assert.strictEqual(
      tableRows.length,
      19,
      `Expected 19 pattern rows in the vision error table, found ${tableRows.length}`
    );
  });

  it("should list each pattern number from 1 to 19", () => {
    for (let i = 1; i <= 19; i++) {
      const pattern = new RegExp(`^\\|\\s*${i}\\s*\\|`, "m");
      assert.ok(pattern.test(content), `Pattern #${i} should be listed in the table`);
    }
  });

  it("should reference VISION_ERROR_PATTERNS or vision-utils.js", () => {
    const hasRef =
      /VISION_ERROR_PATTERNS/.test(content) ||
      /vision-utils\.js/.test(content);
    assert.ok(hasRef, 'SKILL.md should reference "VISION_ERROR_PATTERNS" or "vision-utils.js"');
  });

  it("should be consistent with vision-utils VISION_ERROR_PATTERNS count", () => {
    // Import VISION_ERROR_PATTERNS from vision-utils to compare
    const { VISION_ERROR_PATTERNS } = require("../vision-utils");
    assert.strictEqual(
      VISION_ERROR_PATTERNS.length,
      19,
      `vision-utils VISION_ERROR_PATTERNS should have 19 entries, found ${VISION_ERROR_PATTERNS.length}`
    );
  });

  it("each pattern source should be consistent between SKILL.md and vision-utils", () => {
    const { VISION_ERROR_PATTERNS } = require("../vision-utils");
    // Extract regex patterns from SKILL.md table (column 2: backtick-quoted regex)
    const skillPatterns = [];
    const tableLines = content.match(/^\|\s*\d{1,2}\s*\|.*$/gm) || [];
    for (const line of tableLines) {
      const match = line.match(/\|\s*\d{1,2}\s*\|\s*`([^`]+)`/);
      if (match) skillPatterns.push(match[1]);
    }

    // Compare count (exact source comparison would be too brittle due to escaping differences)
    assert.strictEqual(
      skillPatterns.length,
      VISION_ERROR_PATTERNS.length,
      `SKILL.md has ${skillPatterns.length} patterns but vision-utils has ${VISION_ERROR_PATTERNS.length}`
    );

    // Verify that all skill patterns have a corresponding vision-utils pattern
    for (const skillPat of skillPatterns) {
      // Each skill pattern should match at least one vision-utils pattern source
      const normalizedSkill = skillPat.toLowerCase().replace(/\s+/g, ' ').trim();
      const found = VISION_ERROR_PATTERNS.some((vp) => {
        const vpStr = vp.source || vp.toString();
        const normalizedVP = vpStr.toLowerCase().replace(/\s+/g, ' ').trim();
        // Check if keywords from skill pattern appear in vision-utils pattern
        const keywords = normalizedSkill.match(/[a-z][a-z0-9|()?[\]\\-]+/g) || [];
        return keywords.some((kw) => normalizedVP.includes(kw.replace(/[\\()?[\]|]/g, '')));
      });
      assert.ok(found, `SKILL.md pattern "${skillPat.slice(0, 50)}..." has no match in vision-utils VISION_ERROR_PATTERNS`);
    }
  });
});

// ── Group: Output contract ────────────────────────────────────────────────────

describe("Output contract", () => {
  it("should contain success contract shape (ok: true, analises: [)", () => {
    assert.ok(
      /"ok":\s*true/.test(content),
      'SKILL.md should contain \'"ok": true\''
    );
    assert.ok(
      /"analises":\s*\[/.test(content),
      'SKILL.md should contain \'"analises": [\''
    );
  });

  it("should contain failure contract shape (ok: false, code:)", () => {
    assert.ok(
      /"ok":\s*false/.test(content),
      'SKILL.md should contain \'"ok": false\''
    );
    assert.ok(
      /"code":\s*"/.test(content),
      'SKILL.md should contain \'"code": "\''
    );
  });

  it("should contain all entry shape fields (id, source, filename, saved_path, analise)", () => {
    const requiredFields = ["id", "source", "filename", "saved_path", "analise"];
    for (const field of requiredFields) {
      // Match as a JSON key: "field"
      const pattern = new RegExp(`"${field}"`);
      assert.ok(
        pattern.test(content),
        `SKILL.md should contain entry field "${field}"`
      );
    }
  });
});

// ── Group: Error codes ────────────────────────────────────────────────────────

describe("Error codes", () => {
  it("should list all required error codes in the error codes table", () => {
    const expectedCodes = [
      "MCP_UNAVAILABLE",
      "SOURCE_INVALID",
      "FETCH_FAILED",
      "SIZE_EXCEEDED",
      "SSRF_BLOCKED",
    ];
    for (const code of expectedCodes) {
      assert.ok(
        content.includes(code),
        `SKILL.md error codes table should list "${code}"`
      );
    }
  });

  it("should NOT contain MIME_INVALID (was removed)", () => {
    assert.ok(
      !content.includes("MIME_INVALID"),
      'SKILL.md should NOT contain "MIME_INVALID" (removed code)'
    );
  });

  it("should contain an Examples section", () => {
    assert.ok(
      /##\s+Examples/.test(content),
      'SKILL.md should contain "## Examples" section'
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Harness tests — simulate deterministic parts of the skill pipeline
// ═══════════════════════════════════════════════════════════════════════════

describe("Harness — autoDetectSourceType", () => {
  it("should detect 'ado' from AB# prefix", () => {
    const result = autoDetectSourceType("AB#12345");
    assert.strictEqual(result.source_type, "ado");
    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings[0].includes("auto-detected"));
  });

  it("should detect 'url' from https:// prefix", () => {
    const result = autoDetectSourceType("https://example.com/img.png");
    assert.strictEqual(result.source_type, "url");
  });

  it("should detect 'path' as fallback", () => {
    const result = autoDetectSourceType("/tmp/screenshot.png");
    assert.strictEqual(result.source_type, "path");
    assert.strictEqual(result.warnings.length, 0);
  });

  it("should respect explicit source_type with warning if contradictory", () => {
    const result = autoDetectSourceType("AB#12345", "path");
    assert.strictEqual(result.source_type, "path");
    assert.ok(result.warnings.length > 0);
    assert.ok(result.warnings[0].includes("overriding"));
  });

  it("should respect explicit source_type without warning if not contradictory", () => {
    const result = autoDetectSourceType("/tmp/screenshot.png", "path");
    assert.strictEqual(result.source_type, "path");
    assert.strictEqual(result.warnings.length, 0);
  });
});

describe("Harness — buildMCPValue", () => {
  it("should build { workItemId } from AB# source", () => {
    const result = buildMCPValue("AB#12345", "ado");
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.value, { workItemId: 12345 });
  });

  it("should return SOURCE_INVALID for malformed AB#", () => {
    const result = buildMCPValue("AB#notanumber", "ado");
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.code, "SOURCE_INVALID");
  });

  it("should pass URL string through", () => {
    const result = buildMCPValue("https://example.com/img.png", "url");
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.value, "https://example.com/img.png");
  });

  it("should pass path string through", () => {
    const result = buildMCPValue("/tmp/screenshot.png", "path");
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.value, "/tmp/screenshot.png");
  });
});

describe("Harness — buildAnalysisId", () => {
  it("should build 'attachment:<guid>' for ado source", () => {
    const id = buildAnalysisId("ado", { attachmentId: "abc-123-def" });
    assert.strictEqual(id, "attachment:abc-123-def");
  });

  it("should build 'file:<basename>' for path source", () => {
    const id = buildAnalysisId("path", { basename: "screenshot.png" });
    assert.strictEqual(id, "file:screenshot.png");
  });

  it("should build 'url:<url>' for url source", () => {
    const id = buildAnalysisId("url", { url: "https://imgur.com/x.png" });
    assert.strictEqual(id, "url:https://imgur.com/x.png");
  });
});

describe("Harness — buildSkillOutput", () => {
  it("should wrap singular MCP result into analises[1] for path/url", () => {
    const mcpResult = {
      ok: true,
      saved_path: "/tmp/opencode/vision-test.png",
      warnings: [],
    };
    const output = buildSkillOutput(
      mcpResult,
      "path",
      "/tmp/screenshot.png",
      "visual_spec"
    );
    assert.strictEqual(output.ok, true);
    assert.strictEqual(output.analises.length, 1);
    assert.strictEqual(output.analises[0].source, "path");
    assert.ok(output.analises[0].id.startsWith("file:"));
    assert.strictEqual(output.analises[0].analise.tipo, "analise_imagem");
    assert.ok(output.analises[0].analise.layout !== undefined);
  });

  it("should wrap plural MCP result into analises[N] for ado", () => {
    const mcpResult = {
      ok: true,
      saved_paths: [
        "/tmp/opencode/vision-img1.png",
        "/tmp/opencode/vision-img2.png",
      ],
      warnings: [],
      count: 2,
    };
    const output = buildSkillOutput(mcpResult, "ado", "AB#12345", "visual_spec");
    assert.strictEqual(output.ok, true);
    assert.strictEqual(output.analises.length, 2);
    assert.ok(output.analises[0].id.startsWith("attachment:"));
    assert.ok(output.analises[1].id !== output.analises[0].id);
  });

  it("should propagate MCP error", () => {
    const mcpResult = {
      ok: false,
      code: "FETCH_FAILED",
      warnings: ["Connection failed"],
      saved_path: null,
    };
    const output = buildSkillOutput(mcpResult, "ado", "AB#12345", "visual_spec");
    assert.strictEqual(output.ok, false);
    assert.strictEqual(output.code, "FETCH_FAILED");
    assert.strictEqual(output.analises.length, 0);
  });

  it("should use ux_audit tipo for ux_audit analysis_type", () => {
    const mcpResult = {
      ok: true,
      saved_path: "/tmp/opencode/vision-test.png",
      warnings: [],
    };
    const output = buildSkillOutput(
      mcpResult,
      "url",
      "https://example.com/img.png",
      "ux_audit"
    );
    assert.strictEqual(output.analises[0].analise.tipo, "ux_audit");
    assert.ok(output.analises[0].analise.heuristicas_nielsen !== undefined);
  });

  it("should return analises:[], warnings on partial failure", () => {
    const mcpResult = {
      ok: true,
      saved_paths: ["/tmp/opencode/vision-img1.png"],
      warnings: ["1 of 2 images failed: ..."],
    };
    const output = buildSkillOutput(mcpResult, "ado", "AB#12345", "visual_spec");
    assert.strictEqual(output.ok, true);
    assert.strictEqual(output.warnings.length, 1);
    assert.strictEqual(output.analises.length, 1);
  });
});

describe("Harness — validateSkillContract", () => {
  it("should accept valid success output", () => {
    const output = {
      ok: true,
      analises: [
        {
          id: "file:test.png",
          source: "path",
          filename: "test.png",
          saved_path: "/tmp/opencode/vision-test.png",
          analise: { tipo: "analise_imagem" },
        },
      ],
      warnings: [],
    };
    const result = validateSkillContract(output);
    assert.strictEqual(result.valid, true);
  });

  it("should accept valid ux_audit output", () => {
    const output = {
      ok: true,
      analises: [
        {
          id: "url:https://example.png",
          source: "url",
          filename: "example.png",
          saved_path: "/tmp/opencode/vision-example.png",
          analise: { tipo: "ux_audit" },
        },
      ],
      warnings: [],
    };
    const result = validateSkillContract(output);
    assert.strictEqual(result.valid, true);
  });

  it("should reject failure without code", () => {
    const output = { ok: false, analises: [], warnings: [] };
    const result = validateSkillContract(output);
    assert.strictEqual(result.valid, false);
  });

  it("should reject failure with non-empty analises", () => {
    const output = {
      ok: false,
      code: "FETCH_FAILED",
      analises: [{ id: "file:x.png" }],
      warnings: [],
    };
    const result = validateSkillContract(output);
    assert.strictEqual(result.valid, false);
  });

  it("should accept success with empty analises + warnings (batch vision error)", () => {
    // This is a valid scenario per spec: ok:true, analises:[], warnings set
    const output = {
      ok: true,
      analises: [],
      warnings: ["vision error on attachment:abc-123"],
    };
    const result = validateSkillContract(output);
    assert.strictEqual(
      result.valid,
      true,
      "ok:true with empty analises + warnings is valid per spec"
    );
  });

  it("should reject malformed id for ado source", () => {
    const output = {
      ok: true,
      analises: [
        {
          id: "file:test.png",
          source: "ado",
          filename: "test.png",
          saved_path: "/tmp/test.png",
          analise: { tipo: "analise_imagem" },
        },
      ],
      warnings: [],
    };
    const result = validateSkillContract(output);
    assert.strictEqual(result.valid, false);
  });

  it("should accept multi-image valid output", () => {
    const output = {
      ok: true,
      analises: [
        {
          id: "file:a.png",
          source: "path",
          filename: "a.png",
          saved_path: "/tmp/a.png",
          analise: { tipo: "analise_imagem" },
        },
        {
          id: "file:b.png",
          source: "path",
          filename: "b.png",
          saved_path: "/tmp/b.png",
          analise: { tipo: "analise_imagem" },
        },
      ],
      warnings: [],
    };
    const result = validateSkillContract(output);
    assert.strictEqual(result.valid, true);
  });
});
