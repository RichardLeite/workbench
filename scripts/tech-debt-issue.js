#!/usr/bin/env node
/**
 * tech-debt-issue.js
 *
 * Abre uma issue de dívida técnica no repositório de origem do projeto.
 * Uso: node scripts/tech-debt-issue.js <repo-name> <title> [body]
 *
 * O owner padrão vem de GITHUB_OWNER (ou --owner).
 */

const { execSync } = require('child_process');

const args = process.argv.slice(2);
const ownerArg = args.indexOf('--owner');
const owner = ownerArg >= 0 ? args[ownerArg + 1] : (process.env.GITHUB_OWNER || '');

const positional = args.filter((arg, index) => index !== ownerArg && index !== ownerArg + 1);
const repoName = positional[0];
const title = positional[1];
const body = positional[2];

if (!repoName || !title) {
  console.error('Uso: node scripts/tech-debt-issue.js <repo-name> <title> [body] [--owner <org>]');
  process.exit(1);
}

if (!owner) {
  console.error('Erro: defina GITHUB_OWNER no .env ou use --owner <org>.');
  process.exit(1);
}

const issueBody = body
  ? `${body}\n\n---\n> Issue aberta automaticamente por agente de IA via tech-debt.md`
  : `> Issue aberta automaticamente por agente de IA via tech-debt.md`;

try {
  const result = execSync(
    `gh issue create --repo ${owner}/${repoName} --title "${title.replace(/"/g, '\\"')}" --label "tech-debt" --body "${issueBody.replace(/"/g, '\\"')}"`,
    { encoding: 'utf-8', timeout: 15000 }
  ).trim();

  console.log(`Issue criada: ${result}`);
  process.exit(0);
} catch (err) {
  console.error(`Erro ao criar issue em ${owner}/${repoName}: ${err.message}`);
  process.exit(1);
}
