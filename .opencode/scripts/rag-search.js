#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// ─── CLI argument parsing ────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0].startsWith('-')) {
    printUsage();
    process.exit(1);
  }

  const searchTerms = args[0];
  let limit = 5;
  let project = null;
  let projectCount = 0;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--limit' || args[i] === '-l') {
      const next = args[i + 1];
      if (next !== undefined) {
        const val = parseInt(next, 10);
        if (!isNaN(val) && val > 0) {
          limit = val;
        }
        i++; // skip the value
      }
    } else if (args[i] === '--project' || args[i] === '-p') {
      projectCount++;
      if (projectCount > 1) {
        console.error("Uso: --project aceita apenas um valor. Use '--all' ou omita '--project' para busca cross-vault.");
        process.exit(1);
      }
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        project = next;
        i++; // skip the value
      }
    }
  }

  return { searchTerms, limit, project };
}

function printUsage() {
  console.error('Usage: node .opencode/scripts/rag-search.js "<search terms>" [--limit N] [--project <name>]');
  console.error('  --project, -p   Project name. Omit to search ALL vaults.');
  console.error('  --limit, -l     Max results (default: 5).');
}

// ─── File discovery ──────────────────────────────────────────────────────────

function walkDir(dir) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }

  for (const entry of entries) {
    if (entry.name === '.obsidian') continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }

  return results;
}

// ─── YAML Frontmatter parsing (no external deps) ─────────────────────────────

function parseFrontmatter(content) {
  // Check if content starts with ---
  if (!content.startsWith('---')) {
    return { frontmatter: {}, body: content };
  }

  // Find the closing ---
  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) {
    return { frontmatter: {}, body: content };
  }

  const yamlBlock = content.slice(3, endIndex).trim();
  const body = content.slice(endIndex + 3).trimStart();

  const frontmatter = {};

  for (const line of yamlBlock.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Parse array values like [a, b, c]
    if (value.startsWith('[') && value.endsWith(']')) {
      const inner = value.slice(1, -1);
      value = inner
        .split(',')
        .map((s) => s.trim().replace(/^["']|["']$/g, ''));
    }

    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

// ─── Snippet extraction ──────────────────────────────────────────────────────

function extractSnippet(body, lowerTerm) {
  // Split by blank lines to get paragraphs
  const paragraphs = body.split(/\n\s*\n/);

  for (const para of paragraphs) {
    if (para.toLowerCase().includes(lowerTerm)) {
      // Collapse whitespace and trim
      let clean = para.replace(/\s+/g, ' ').trim();
      if (clean.length > 200) {
        clean = clean.slice(0, 200) + '...';
      }
      return clean;
    }
  }

  return '';
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function scoreFile(filePath, terms, vaultRoot) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null; // skip unreadable files
  }

  const { frontmatter, body } = parseFrontmatter(content);
  const relativePath = path.relative(vaultRoot, filePath);
  const title = frontmatter.title || path.basename(filePath, '.md');

  let score = 0;
  const matchedFields = new Set();
  const snippets = new Set();

  for (const term of terms) {
    const lowerTerm = term.toLowerCase();
    let termHasContentMatch = false;

    // 1. Frontmatter match (weight 3) — check ALL frontmatter field values
    for (const [key, val] of Object.entries(frontmatter)) {
      const values = Array.isArray(val) ? val : [String(val)];
      for (const v of values) {
        if (v.toLowerCase().includes(lowerTerm)) {
          score += 3;
          matchedFields.add(key);
        }
      }
    }

    // 2. Title match (weight 2) — check the title field specifically
    if (title.toLowerCase().includes(lowerTerm)) {
      score += 2;
      matchedFields.add('title');
    }

    // 3. Content match (weight 1)
    if (body.toLowerCase().includes(lowerTerm)) {
      score += 1;
      termHasContentMatch = true;
      matchedFields.add('content');
    }

    // Extract one snippet per term from the body
    if (termHasContentMatch) {
      const snippet = extractSnippet(body, lowerTerm);
      if (snippet) {
        snippets.add(snippet);
      }
    }
  }

  if (score === 0) return null;

  const snippet = snippets.size > 0 ? [...snippets].join(' ... ') : '';

  return {
    file: relativePath,
    title,
    score,
    snippet,
    matchedFields: [...matchedFields],
  };
}

// ─── Logging ─────────────────────────────────────────────────────────────────

function logSearchStart(project, vaults, terms) {
  const logEntry = {
    event: 'search.start',
    project: project || '*',
    vaults: vaults.length || 0,
    terms: terms
  };
  console.error(JSON.stringify(logEntry));
}

// ─── Main ────────────────────────────────────────────────────────────────────

function resolveVaultRoot(project) {
  const mappingPath = path.resolve(__dirname, '..', 'config', 'project-mapping.json');

  try {
    const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    const projectConfig = mapping.projects && mapping.projects[project];
    if (projectConfig && projectConfig.vault) {
      const vaultPath = path.resolve(__dirname, '..', '..', projectConfig.vault);
      if (fs.existsSync(vaultPath)) {
        return vaultPath;
      }
    }
  } catch {
    // mapping unreadable or invalid
  }

  return null;
}

function resolveAllVaultRoots() {
  const mappingPath = path.resolve(__dirname, '..', 'config', 'project-mapping.json');
  const roots = [];

  try {
    const mapping = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    for (const [name, config] of Object.entries(mapping.projects || {})) {
      if (config.vault) {
        const vaultPath = path.resolve(__dirname, '..', '..', config.vault);
        if (fs.existsSync(vaultPath)) {
          roots.push({ project: name, root: vaultPath });
        }
      }
    }
  } catch {
    // mapping unreadable or invalid
  }

  return roots;
}

function main() {
  const { searchTerms, limit, project } = parseArgs();

  const terms = searchTerms.split(/\s+/).filter((t) => t.length > 0);

  let results = [];

  if (project) {
    // Single project search
    const vaultRoot = resolveVaultRoot(project);
    if (!vaultRoot) {
      console.error(JSON.stringify({ event: 'error', message: `Vault not found for project '${project}'. Check project-mapping.json.` }));
      process.exit(1);
    }
    logSearchStart(project, [vaultRoot], terms);
    if (fs.existsSync(vaultRoot)) {
      const mdFiles = walkDir(vaultRoot);
      for (const filePath of mdFiles) {
        const r = scoreFile(filePath, terms, vaultRoot);
        if (r) results.push(r);
      }
    }
  } else {
    // Search ALL vaults
    const vaults = resolveAllVaultRoots();
    logSearchStart(null, vaults, terms);
    for (const { project: proj, root } of vaults) {
      const mdFiles = walkDir(root);
      for (const filePath of mdFiles) {
        const r = scoreFile(filePath, terms, root);
        if (r) {
          // Prefix file with project name for disambiguation
          r.file = `[${proj}] ${r.file}`;
          results.push(r);
        }
      }
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  // Apply limit
  const limited = results.slice(0, limit);

  console.log(JSON.stringify(limited, null, 2));
}

main();
