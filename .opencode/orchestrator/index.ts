#!/usr/bin/env node

/**
 * index.ts — CLI entrypoint for contract and pipeline validation.
 *
 * Commands:
 *   validate           Reads JSON from stdin, validates against agent contract
 *   validate-pipeline  Reads a pipeline SKILL.md, checks composes vs phases match
 *   help               Shows help
 *
 * Usage:
 *   echo '{"tipo":"resultado","arquivos":["/x.ts:42"]}' | node dist/index.js validate
 *   node dist/index.js validate-pipeline .opencode/skills/pipelines/pr-workflow/SKILL.md
 */

declare var require: (mod: string) => any;
declare var process: {
  argv: string[];
  exit: (code?: number) => void;
  stdout: { write: (msg: string) => void };
  stderr: { write: (msg: string) => void };
};
declare var __dirname: string;

import { validateOutput } from "./contracts";

const fs = require("fs");
const path = require("path");

function showHelp(): void {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║    Orchestrator — Contract & Pipeline Validation CLI        ║
╚══════════════════════════════════════════════════════════════╝

Usage:
  node dist/index.js <command> [args]

Commands:
  validate            Reads JSON from stdin, validates against agent contract
  validate-pipeline   Reads pipeline SKILL.md, checks composes vs phases
  help                Shows this help

Agent catalog and delegation rules are in the orchestrator
prompt (.opencode/agents/core/orquestrador.md) — decisions are 100% LLM-driven.

Examples:
  echo '{"tipo":"resultado","arquivos":["/x.ts:42"]}' \\
    | node dist/index.js validate
  node dist/index.js validate-pipeline .opencode/skills/pipelines/pr-workflow/SKILL.md
`);
}

/**
 * Validate a pipeline SKILL.md:
 *  - Extracts composes array from frontmatter (inline or YAML list)
 *  - Finds skill("name") and | **Skill** | `name` | references in body
 *  - Checks both lists match (no silent drift)
 */
function cmdValidatePipeline(filePath: string): void {
  if (!filePath) {
    console.log(JSON.stringify({ valid: false, mensagem: "Missing file path" }, null, 2));
    process.exit(1);
    return;
  }

  const resolvedPath = path.resolve(filePath);

  // Path traversal protection: restrict to pipelines directory
  // __dirname points to dist/ in compiled output, so go up 3 levels
  const pipelinesDir = path.resolve(__dirname, "../../skills/pipelines");
  const rel = path.relative(pipelinesDir, resolvedPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    console.log(JSON.stringify({ valid: false, file: filePath, mensagem: "Path outside pipelines directory" }, null, 2));
    process.exit(1);
    return;
  }

  if (!fs.existsSync(resolvedPath)) {
    console.log(JSON.stringify({ valid: false, file: filePath, mensagem: "File not found" }, null, 2));
    process.exit(1);
    return;
  }

  const content = fs.readFileSync(resolvedPath, "utf-8").replace(/\r\n/g, "\n").replace(/^\uFEFF/, "");

  // Extract frontmatter YAML (between --- delimiters)
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    console.log(JSON.stringify({ valid: false, file: filePath, mensagem: "No frontmatter found" }, null, 2));
    process.exit(1);
    return;
  }

  const frontmatter = fmMatch[1];

  // Extract composes: supports both inline array and YAML list format
  let composes: string[] = [];
  const inlineMatch = frontmatter.match(/composes:\s*\[([^\]]*)\]/);
  if (inlineMatch && inlineMatch[1] !== undefined) {
    composes = inlineMatch[1].split(",").map((s: string) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
  } else {
    const yamlMatch = frontmatter.match(/composes:\n((?:\s*-\s[^\n]*\n?)*)/);
    if (yamlMatch && yamlMatch[1] !== undefined) {
      composes = yamlMatch[1]
        .split("\n")
        .map((s: string) => s.trim().replace(/^- /, "").replace(/^['"]|['"]$/g, "").trim())
        .filter(Boolean);
    }
  }

  if (composes.length === 0) {
    console.log(JSON.stringify({ valid: true, file: filePath, mensagem: "No composes in frontmatter — skipped" }, null, 2));
    process.exit(0);
    return;
  }

  // Body = content after frontmatter
  const bodyStart = fmMatch[0].length;
  const body = content.slice(bodyStart);

  // Find skill references in body:
  //   - skill("name") and skill('name') calls
  //   - | **Skill** | `name` |  (Markdown table)
  const skillRefs = [
    ...body.matchAll(/skill\(['"]([^'"]+)['"]\)/g),
    ...body.matchAll(/\|\s*\*\*Skill\*\*\s*\|\s*`([^`]+)`\s*\|/g),
  ].map(m => m[1]);

  // Remove duplicates, preserve order; filter out template placeholders {{PLACEHOLDER}}
  const uniqueRefs = [...new Set(skillRefs.filter(r => !r.startsWith("{") && !r.includes("{{") && !r.includes("}}")))];

  // Compare order and set equality
  const missingFromBody = composes.filter(c => !uniqueRefs.includes(c));
  const missingFromComposes = uniqueRefs.filter(r => !composes.includes(r));

  // Check order alignment
  const orderMismatch: { position: number; expected: string; got: string }[] = [];
  for (let i = 0; i < Math.min(composes.length, uniqueRefs.length); i++) {
    if (composes[i] !== uniqueRefs[i]) {
      orderMismatch.push({ position: i, expected: composes[i], got: uniqueRefs[i] });
    }
  }

  // Cross-check: verify skills exist in catalog (parse .opencode/skills/*/SKILL.md frontmatter)
  const missingFromCatalog: string[] = [];
  const skillsDir = path.resolve(__dirname, "../../skills");
  if (fs.existsSync(skillsDir)) {
    const skillDirs = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter((d: any) => d.isDirectory());
    const knownSkills = new Set(
      skillDirs
        .map((d: any) => {
          const skillFile = path.join(skillsDir, d.name, "SKILL.md");
          if (fs.existsSync(skillFile)) {
            const skillContent = fs.readFileSync(skillFile, "utf-8");
            const nameMatch = skillContent.match(/^---\n[\s\S]*?\nname:\s*['"]?([^\n'"]+)['"]?/);
            return nameMatch ? nameMatch[1].trim() : d.name;
          }
          return d.name;
        })
    );
    // Add agents that expose skills
    const agentsDir = path.resolve(__dirname, "../../agents");
    if (fs.existsSync(agentsDir)) {
      const agentDirs = fs.readdirSync(agentsDir, { withFileTypes: true })
        .filter((d: any) => d.isDirectory());
      agentDirs.forEach((d: any) => {
        const agentFile = path.join(agentsDir, d.name, `${d.name}.md`);
        if (fs.existsSync(agentFile)) {
          knownSkills.add(d.name);
        }
      });
    }
    missingFromCatalog.push(...composes.filter(c => !knownSkills.has(c)));
  }

  const errors: string[] = [];
  if (missingFromBody.length > 0) {
    errors.push(`composes missing from body: [${missingFromBody.join(", ")}]`);
  }
  if (missingFromComposes.length > 0) {
    errors.push(`body refs missing from composes: [${missingFromComposes.join(", ")}]`);
  }
  if (missingFromCatalog.length > 0) {
    errors.push(`skills not found in catalog: [${missingFromCatalog.join(", ")}]`);
  }

  const warnings: string[] = [];
  if (orderMismatch.length > 0) {
    warnings.push(`order mismatch at positions: ${orderMismatch.map(m => `${m.position}(expected=${m.expected}, got=${m.got})`).join(", ")}`);
  }

  if (errors.length > 0) {
    console.log(JSON.stringify({
      valid: false,
      file: filePath,
      composes,
      body_refs: uniqueRefs,
      erros: errors,
      avisos: warnings.length > 0 ? warnings : undefined,
      mensagem: `Pipeline validation FAILED — ${errors.length} issue(s)`,
    }, null, 2));
    process.exit(1);
  } else {
    console.log(JSON.stringify({
      valid: true,
      file: filePath,
      composes,
      body_refs: uniqueRefs,
      avisos: warnings.length > 0 ? warnings : undefined,
      mensagem: warnings.length > 0
        ? `Pipeline validation PASSED with warnings — ${warnings.length} order issue(s)`
        : "Pipeline validation PASSED — composes matches body references",
    }, null, 2));
    process.exit(0);
  }
}

function cmdValidate(): void {
  const raw = fs.readFileSync(0, "utf-8").trim();

  if (!raw) {
    const result = { valid: false, hasError: false, tipo: null, mensagem: "Empty stdin" };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    const result = validateOutput(parsed);
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) {
      process.exit(1);
    }
  } catch (err: any) {
    const result = { valid: false, hasError: false, tipo: null, mensagem: `Invalid JSON: ${err.message}` };
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const cmd = args[0]?.toLowerCase();

  switch (cmd) {
    case "validate":
      cmdValidate();
      break;
    case "validate-pipeline":
      cmdValidatePipeline(args[1]);
      break;
    case "help":
    case undefined:
    case "":
      showHelp();
      break;
    default:
      process.stderr.write(`Unknown command: "${cmd}"\n`);
      showHelp();
      process.exit(1);
  }
}

main();
