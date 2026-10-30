#!/usr/bin/env node
/**
 * validate-branch-name.js
 * 
 * Valida se o nome da branch atual segue as regras de nomenclatura.
 * Uso: node scripts/validate-branch-name.js [branch-name]
 * 
 * Se branch-name não for informado, usa a branch atual.
 * Exit code: 0 = válido, 1 = inválido
 */

const { execSync } = require('child_process');

const BRANCH_RULES = [
  // meu-projeto SPRINT
  { pattern: /^feat\/TASK-\d+$/, context: 'meu-projeto SPRINT' },
  // meu-projeto HOTFIX
  { pattern: /^fix\/TASK-\d+$/, context: 'meu-projeto HOTFIX' },
  // HOTFIX/SPRINT → release (backport)
  { pattern: /^(fix|feat)\/TASK-\d+-release$/, context: 'backport para release' },
  // .workbench (conventional)
  { pattern: /^(feat|fix|chore|refactor|docs|test|perf)\/[a-z0-9]+(-[a-z0-9]+)*$/, context: '.workbench kebab' },
  // .workbench (conventional commit with scope)
  { pattern: /^(feat|fix|chore|refactor|docs|test|perf)\([a-z0-9_-]+\):\s[a-z0-9].+$/, context: '.workbench conventional commit' },
  // Generic refactor
  { pattern: /^refactor\/[a-z0-9]+(-[a-z0-9]+)*$/, context: 'refactor genérico' },
  // Generic docs
  { pattern: /^docs\/[a-z0-9]+(-[a-z0-9]+)*$/, context: 'docs genérico' },
];

function getCurrentBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();
  } catch {
    return null;
  }
}

const branch = process.argv[2] || getCurrentBranch();

if (!branch) {
  console.error('❌ Não foi possível determinar a branch atual.');
  process.exit(2);
}

if (branch === 'main' || branch === 'release' || branch === 'develop') {
  console.log(`⚠️  Branch '${branch}' é protegida. Não deve receber commits diretos.`);
  console.log('   Crie uma branch a partir dela: git checkout -B feat/... origin/' + branch);
  process.exit(0);
}

for (const rule of BRANCH_RULES) {
  if (rule.pattern.test(branch)) {
    console.log(`✅ Branch '${branch}' é válida (${rule.context}).`);
    process.exit(0);
  }
}

console.log(`❌ Branch '${branch}' não corresponde a nenhum padrão conhecido.`);
console.log('   Padrões válidos:');
console.log('   - feat/TASK-1234 (SPRINT)');
console.log('   - fix/TASK-1234 (HOTFIX)');
console.log('   - fix/TASK-1234-release (HOTFIX → release)');
console.log('   - feat/add-feature (workbench)');
console.log('   - fix/TASK-1234-descricao (opcional)');
process.exit(1);
