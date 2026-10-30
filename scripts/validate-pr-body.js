#!/usr/bin/env node
/**
 * validate-pr-body.js
 * 
 * Valida se o corpo de um PR segue o template obrigatório.
 * Uso: node scripts/validate-pr-body.js <pr-number> [--owner repo] [--repo name]
 * 
 * Exemplo:
 *   node scripts/validate-pr-body.js 64 --repo my-repo
 *   node scripts/validate-pr-body.js 64 --owner my-org --repo my-repo
 */

const { execSync } = require('child_process');

const prNumber = process.argv[2];
const ownerArg = process.argv.indexOf('--owner');
const repoArg = process.argv.indexOf('--repo');

const owner = ownerArg >= 0 ? process.argv[ownerArg + 1] : (process.env.GITHUB_OWNER || '');
const repo = repoArg >= 0 ? process.argv[repoArg + 1] : '.workbench';

if (!prNumber) {
  console.error('Uso: node scripts/validate-pr-body.js <pr-number> [--owner owner] [--repo repo]');
  process.exit(1);
}

try {
  const body = execSync(`gh api repos/${owner}/${repo}/pulls/${prNumber} --jq '.body'`, {
    encoding: 'utf-8',
    timeout: 15000,
  }).trim();

  const checks = [
    { name: 'Seção "O que mudou?"', pass: body.includes('## O que mudou?') },
    { name: 'Seção "Por quê?"', pass: body.includes('## Por quê?') },
    { name: 'Seção "Evidências"', pass: body.includes('## Evidências') || body.includes('## Evidencias') },
    { name: 'Seção "Possíveis riscos"', pass: body.includes('## Possíveis riscos') || body.includes('## Riscos') },
    { name: 'Seção "Rollback"', pass: body.includes('## Rollback') },
    { name: 'Seção "Commits"', pass: body.includes('## Commits') },
    { name: 'Checklist presente', pass: body.includes('- [') },
    { name: 'Corpo em português', pass: /[áàâãéèêíïóôõöúç]/i.test(body) },
  ];

  const failed = checks.filter(c => !c.pass);
  
  if (failed.length === 0) {
    console.log(`✅ PR #${prNumber}: todas as ${checks.length} validações passaram.`);
    process.exit(0);
  } else {
    console.log(`❌ PR #${prNumber}: ${failed.length}/${checks.length} validações falharam:`);
    failed.forEach(f => console.log(`   - ${f.name}`));
    process.exit(1);
  }
} catch (err) {
  console.error(`❌ Erro ao validar PR #${prNumber}: ${err.message}`);
  process.exit(2);
}
