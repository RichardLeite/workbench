#!/usr/bin/env node
/**
 * Validador de formato de specs — verifica se uma spec segue o template modular.
 *
 * Uso: node scripts/validate-spec-format.js <caminho-da-spec>
 * Ex:  node scripts/validate-spec-format.js projects/meu-projeto/knowledge/specs/spec-alerta-de-os-aberta.md
 *
 * Retorna exit code 0 se válida, 1 se inválida.
 */

const fs = require("fs");
const path = require("path");

const specPath = process.argv[2];

if (!specPath) {
  console.error("Uso: node scripts/validate-spec-format.js <caminho-da-spec>");
  process.exit(1);
}

const fullPath = path.resolve(__dirname, "..", specPath);

if (!fs.existsSync(fullPath)) {
  console.error(`❌ Arquivo não encontrado: ${fullPath}`);
  process.exit(1);
}

const content = fs.readFileSync(fullPath, "utf8");
const errors = [];
const warnings = [];

// ── Validações ──────────────────────────────────────────────

// 1. Deve ter título
if (!/^# Spec:/m.test(content)) {
  errors.push("Falta título '## Spec:'");
}

// 2. Deve ter pelo menos um módulo
const moduleMatches = content.matchAll(/^### Módulo \d+:/gm);
const modules = [...moduleMatches];

if (modules.length === 0) {
  errors.push("Nenhum módulo encontrado (padrão: '### Módulo N:')");
} else {
  for (const mod of modules) {
    const modName = mod[0];
    const modLine = content.substring(0, mod.index).split("\n").length;

    // Extrai o conteúdo completo do módulo (até o próximo "### Módulo" ou fim do arquivo)
    const nextModuleMatch = content.slice(mod.index + 1).match(/\n### Módulo \d+:/);
    const modContent = nextModuleMatch
      ? content.slice(mod.index, mod.index + 1 + nextModuleMatch.index)
      : content.slice(mod.index);

    if (!/#### Descrição/.test(modContent)) {
      warnings.push(`Módulo "${modName}" (linha ${modLine}): sem seção '#### Descrição'`);
    }

    if (!/#### Requisitos/.test(modContent) && !/#### Implementação/.test(modContent)) {
      warnings.push(`Módulo "${modName}" (linha ${modLine}): sem '#### Requisitos' nem '#### Implementação'`);
    }
  }
}

// 3. Deve ter pelo menos um cenário GIVEN/WHEN/THEN em algum módulo
const hasScenario = /-\s+\*\*GIVEN\*\*/i.test(content) &&
                    /-\s+\*\*WHEN\*\*/i.test(content) &&
                    /-\s+\*\*THEN\*\*/i.test(content);

if (modules.length > 0 && !hasScenario) {
  warnings.push("Nenhum cenário GIVEN/WHEN/THEN encontrado — critérios podem não ser testáveis");
}

// 4. Deve ter seção de Implementação
if (!/#### Implementação/.test(content)) {
  errors.push("Falta seção '#### Implementação'");
}

// 5. Deve ter seção de Validação
if (!/#### Validação/.test(content)) {
  errors.push("Falta seção '#### Validação'");
}

// ── Relatório ───────────────────────────────────────────────

console.log(`\n📋 Validação de Spec: ${path.basename(specPath)}`);
console.log(`   Módulos encontrados: ${modules.length}`);
console.log(`   Total de linhas: ${content.split("\n").length}`);

if (errors.length === 0 && warnings.length === 0) {
  console.log("\n✅ Spec válida — formato modular compatível com /execute-spec\n");
  process.exit(0);
}

if (errors.length > 0) {
  console.log(`\n❌ ${errors.length} erro(s):`);
  for (const e of errors) console.log(`   • ${e}`);
}

if (warnings.length > 0) {
  console.log(`\n⚠️  ${warnings.length} aviso(s):`);
  for (const w of warnings) console.log(`   • ${w}`);
}

console.log();
process.exit(errors.length > 0 ? 1 : 0);
