#!/usr/bin/env node
/**
 * Script de migração de specs do formato antigo (flat) para o formato modular.
 *
 * Uso: node scripts/migrate-spec-to-modular.js <caminho-da-spec> [--dry-run]
 * Ex:  node scripts/migrate-spec-to-modular.js projects/meu-projeto/knowledge/specs/spec-melhoria-efetividade-conversao-indireta.md
 *
 * O script:
 * 1. Detecta se a spec já está no formato modular (pula se sim)
 * 2. Extrai seções do formato antigo
 * 3. Gera o novo formato com estrutura de módulos
 * 4. Salva ou mostra (--dry-run)
 */

const fs = require("fs");
const path = require("path");
const { EOL } = require("os");

const specPath = process.argv[2];
const isDryRun = process.argv.includes("--dry-run");

if (!specPath) {
  console.error("Uso: node scripts/migrate-spec-to-modular.js <caminho> [--dry-run]");
  console.error("Ex:  node scripts/migrate-spec-to-modular.js projects/meu-projeto/knowledge/specs/spec-antiga.md");
  process.exit(1);
}

const fullPath = path.resolve(__dirname, "..", specPath);

if (!fs.existsSync(fullPath)) {
  console.error(`❌ Arquivo não encontrado: ${fullPath}`);
  process.exit(1);
}

const content = fs.readFileSync(fullPath, "utf8");

// ── Detecta se já está no formato modular ──────────────────

if (/^### Módulo \d+:/m.test(content)) {
  console.log(`✅ Spec já está no formato modular: ${path.basename(specPath)}`);
  process.exit(0);
}

// ── Extrai metadados do formato antigo ─────────────────────

const title = content.match(/^#\s+(.+)/m)?.[1]?.trim() || path.basename(specPath, ".md");

console.log(`\n📋 Migrando: ${title}`);

// Extrai seções por heading
function extractSection(heading) {
  const regex = new RegExp(`^##\\s+${heading}\\s*$([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, "m");
  const match = content.match(regex);
  return match ? match[1].trim() : "";
}

const objective = extractSection("Objective") || extractSection("Objetivo") || extractSection("Descrição");
const scope = extractSection("Scope") || extractSection("Escopo");
const nonScope = extractSection("Non-scope") || extractSection("Não-escopo");
const acceptanceCriteria = extractSection("Acceptance criteria") || extractSection("Critérios de Aceite") || extractSection("Critérios de Aceitação");
const risks = extractSection("Risks") || extractSection("Riscos");
const validation = extractSection("Validation") || extractSection("Validação");
const notes = extractSection("Notes") || extractSection("Notas") || extractSection("Notas Técnicas");

// Extrai TASK
const taskMatch = content.match(/TASK[:\s]+([\w-]+)/i);
const taskId = taskMatch ? taskMatch[1] : "TASK-XXXX";

// ── Gera spec no formato modular ──────────────────────────

const now = new Date().toISOString().split("T")[0];

let modular = `# Spec: ${title}

> **Gerado em:** ${now}
> **Esquema:** Spec Executável v1 — Migrado automaticamente do formato antigo
> **Uso:** Projetada para ser executada pelo \`/execute-spec\`

## TASK

${taskId}

## Objetivo

${objective || "*(extrair do contexto original)*"}

## Pré-requisitos

${risks ? `- Riscos identificados: ${risks}` : "*(identificar durante execução)*"}

---

## Módulos

> Cada módulo é uma unidade atômica: testes primeiro (se o projeto tiver infra) → implementação → validação.
> A ordem dos módulos é a ordem de execução. Módulos sem dependências podem ser paralelizados.

---

`;

// Tenta dividir em módulos baseado no escopo
const scopeLines = scope.split("\n").filter(l => l.trim().startsWith("-") || l.trim().startsWith("*"));
const scopeItems = scopeLines.length > 0
  ? scopeLines.map(l => typeof l === 'string' ? l : l.text)
  : ["Implementar conforme especificação"];

let moduleCount = 0;

// Módulo 1: Backend (sempre presente se houver objective/scope)
if (objective || scope) {
  moduleCount++;
  modular += `### Módulo ${moduleCount}: Implementação Base

**Camada:** backend
**Dependências:** Nenhuma
**Estimativa:** *(a definir)*

#### Descrição

${objective || scope || "Implementar a funcionalidade descrita na especificação original."}

#### Requisitos

##### Requisito: FuncionalidadePrincipal

O sistema SHALL implementar a funcionalidade conforme especificado.

###### Cenário: ComportamentoPadrao
- **GIVEN** o estado atual do sistema
- **WHEN** a ação principal é executada
- **THEN** o resultado esperado é obtido

#### Testes (TDD)

N/A — Migrado de spec antiga sem especificação de testes.

#### Implementação

${scopeItems.map(item => `- [ ] ${(typeof item === 'string' ? item : item.text || item).replace(/^[-*]\s*/, "").trim()}`).join("\n") || "- [ ] Implementar conforme especificação original"}

#### Validação

- [ ] **Testes:** N/A (spec migrada)
- [ ] **Auto-review:** @revisor aprovou o módulo
- [ ] **Checkpoint:** sem issues graves

---

`;
}

// Módulo 2: Frontend (se houver frontend no scope)
if (scope && /frontend|ui|tela|component|react|página/i.test(scope)) {
  moduleCount++;
  modular += `### Módulo ${moduleCount}: Interface do Usuário

**Camada:** frontend
**Dependências:** Módulo ${moduleCount - 1}
**Estimativa:** *(a definir)*

#### Descrição

Implementar a interface do usuário conforme especificado.

#### Requisitos

##### Requisito: InterfaceFuncional

O sistema SHALL exibir a interface conforme especificado.

###### Cenário: ExibicaoPadrao
- **GIVEN** o usuário acessa a funcionalidade
- **WHEN** a tela é carregada
- **THEN** os dados são exibidos corretamente

#### Testes (TDD)

N/A — Migrado de spec antiga.

#### Implementação

- [ ] Implementar componentes de UI
- [ ] Integrar com API

#### Validação

- [ ] **Testes:** N/A (spec migrada)
- [ ] **Auto-review:** @revisor aprovou o módulo
- [ ] **Checkpoint:** sem issues graves

---
`;
}

// Validação adicional como módulo extra
if (validation) {
  moduleCount++;
  modular += `### Módulo ${moduleCount}: Validação

**Camada:** docs
**Dependências:** Módulo ${moduleCount - 1}
**Estimativa:** *(a definir)*

#### Descrição

${validation}

#### Implementação

- [ ] Validar cenários de teste
- [ ] Verificar comportamento esperado

#### Validação

- [ ] **Testes:** validados conforme critérios
- [ ] **Auto-review:** @revisor aprovou o módulo
- [ ] **Checkpoint:** sem issues graves

---
`;
}

// Se não criou módulo algum, cria um módulo genérico
if (moduleCount === 0) {
  modular += `### Módulo 1: Implementação

**Camada:** backend
**Dependências:** Nenhuma
**Estimativa:** *(a definir)*

#### Descrição

Implementar conforme especificação original.

#### Requisitos

##### Requisito: FuncionalidadePrincipal

O sistema SHALL implementar a funcionalidade.

###### Cenário: ComportamentoPadrao
- **GIVEN** o estado atual
- **WHEN** a ação é executada
- **THEN** o resultado esperado é obtido

#### Implementação

- [ ] Implementar conforme especificação

#### Validação

- [ ] **Auto-review:** @revisor aprovou
- [ ] **Checkpoint:** sem issues graves

---
`;
}

// Rodapé
modular += `\n## Dependências Externas\n\n${risks ? `- ${risks}` : "- Nenhuma identificada"}\n`;

if (notes) {
  modular += `\n## Notas Técnicas\n\n${notes}\n`;
}

if (acceptanceCriteria) {
  modular += `\n## Critérios de Aceite (originais)\n\n${acceptanceCriteria}\n`;
}

// ── Salva ou mostra ────────────────────────────────────────

if (isDryRun) {
  console.log("\n📄 Preview da spec migrada:");
  console.log("─".repeat(60));
  console.log(modular);
  console.log("─".repeat(60));
  console.log(`\n⚠️  Dry-run — arquivo não foi modificado.`);
  console.log(`   Remova --dry-run para salvar as alterações.`);
  process.exit(0);
}

const backupPath = fullPath.replace(/\.md$/, ".backup.md");
fs.copyFileSync(fullPath, backupPath);
console.log(`💾 Backup salvo em: ${backupPath}`);

fs.writeFileSync(fullPath, modular, "utf8");
console.log(`✅ Spec migrada: ${path.basename(specPath)}`);
console.log(`   Módulos criados: ${moduleCount}`);
console.log(`   Backup: ${path.basename(backupPath)}`);
