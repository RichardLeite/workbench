#!/usr/bin/env node
// sync-to-codex.js — Bridge script OpenCode → Codex CLI
//
// Converte agentes, skills e regras do OpenCode para formato Codex.
// Executar: node .opencode/scripts/sync-to-codex.js
//
// O que sincroniza:
// - AGENTS.md na raiz (regras + routing) ← .opencode/rules/ + constitution.md
// - .codex/agents/*.toml ← .opencode/agents/*.md (via template)
// - .codex-plugin/plugin.json ← manifesto fixo
// - Skills: ja compativeis (SKILL.md), nao precisa converter

const fs = require('fs');
const path = require('path');

const WORKBENCH = path.resolve(__dirname, '../..');
const OPENCODE_AGENTS = path.join(WORKBENCH, '.opencode/agents');
const CODEX_AGENTS = path.join(WORKBENCH, '.codex/agents');
const CODEX_PLUGIN = path.join(WORKBENCH, '.codex-plugin/plugin.json');
const AGENTS_MD = path.join(WORKBENCH, 'AGENTS.md');

console.log('🔁 OpenCode → Codex CLI Sync');
console.log(`   Workbench: ${WORKBENCH}\n`);

// 1. Check all agent files exist
function checkAgents() {
  const expected = [
    'pedreiro', 'backend-dev', 'frontend-dev', 'database-dev',
    'revisor', 'code-reviewer', 'security-reviewer',
    'pr-insight', 'tech-architect', 'tech-lead', 'sec-arch',
    'explorador', 'explore', 'integracoes-power', 'image-analyzer', 'ux-analyzer',
    'scrum-master', 'business-analyst', 'product-manager', 'task-refiner-ado',
    'devops-engineer', 'qa-engineer', 'general',
    'planner', 'architect', 'arbitro', 'gestor-tokens',
    'perf-auditor', 'tdd-guide',
    'vault-updater'
  ];

  let ok = 0, missing = 0;
  for (const name of expected) {
    const file = path.join(CODEX_AGENTS, `${name}.toml`);
    if (fs.existsSync(file)) {
      ok++;
    } else {
      console.warn(`   ⚠️  Missing: ${name}.toml`);
      missing++;
    }
  }
  console.log(`   Agents: ${ok} OK, ${missing} missing\n`);
  return missing === 0;
}

// 2. Check AGENTS.md exists
function checkAgentsMd() {
  if (fs.existsSync(AGENTS_MD)) {
    const stats = fs.statSync(AGENTS_MD);
    console.log(`   AGENTS.md: OK (${(stats.size / 1024).toFixed(1)} KB)`);
    return true;
  }
  console.warn('   ⚠️  AGENTS.md not found!');
  return false;
}

// 3. Check skills compatibility
function checkSkills() {
  const skillsDir = path.join(WORKBENCH, '.opencode/skills');
  if (!fs.existsSync(skillsDir)) {
    console.warn('   ⚠️  Skills directory not found');
    return false;
  }
  const skills = fs.readdirSync(skillsDir).filter(d => {
    const skillFile = path.join(skillsDir, d, 'SKILL.md');
    return fs.existsSync(skillFile);
  });
  console.log(`   Skills: ${skills.length} compatible (shared SKILL.md format)`);
  return true;
}

// 4. Check plugin.json
function checkPlugin() {
  if (fs.existsSync(CODEX_PLUGIN)) {
    const pkg = JSON.parse(fs.readFileSync(CODEX_PLUGIN, 'utf-8'));
    console.log(`   Plugin: ${pkg.name} v${pkg.version}`);
    return true;
  }
  console.warn('   ⚠️  .codex-plugin/plugin.json not found');
  return false;
}

// 5. Check config.toml
function checkCodexConfig() {
  const configPath = path.join(require('os').homedir(), '.codex/config.toml');
  if (fs.existsSync(configPath)) {
    const content = fs.readFileSync(configPath, 'utf-8');
    const hasMCP = content.includes('[mcp_servers.') || content.includes('[mcp_servers]\n');
    console.log(`   ~/.codex/config.toml: exists${hasMCP ? ' (has MCP section)' : ' (no MCP section)'}`);
    return true;
  }
  console.warn('   ⚠️  ~/.codex/config.toml not found — run `codex` once to create it');
  return false;
}

// Main
const allOk = checkAgents() & checkAgentsMd() & checkSkills() & checkPlugin() & checkCodexConfig();

console.log(`\n${allOk ? '✅ Bridge OK — Codex CLI ready' : '⚠️  Some items need attention (see above)'}`);
