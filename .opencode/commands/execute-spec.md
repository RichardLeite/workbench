---
description: "Executa uma spec modular: módulo por módulo com TDD (se aplicável), implementação, auto-review e relatório."
---

# /execute-spec

> Executa uma spec modular passo a passo, com detecção automática de infraestrutura
> de teste, checkpoint para retomada, e perguntas nos pontos de decisão.

## Uso

```
/execute-spec <caminho>
```

Apenas o caminho da spec é necessário. Todo o resto é **auto-detectado** ou **perguntado na hora** — sem flags, sem decoreba.

## Pré-requisitos

A spec DEVE seguir o formato modular (template `spec-template.md`):

- Seções `### Módulo N:` numeradas sequencialmente
- Cada módulo com: Testes (TDD), Implementação, Validação (opcionais)
- Requisitos com Cenários (GIVEN/WHEN/THEN)

## O que o comando faz (visão geral)

```
/execute-spec <caminho>

├── Detecta automaticamente:
│   ├── Projeto tem teste? (jest/vitest config)
│   ├── Checkpoint anterior existe? (pra retomar)
│   └── Módulos são independentes? (pra paralelizar)
│
├── Mostra plano e pergunta: "Prossigo?"
│
├── Para cada módulo:
│   ├── [se testável] TDD: cria teste (RED) → implementa → valida (GREEN)
│   ├── [se não testável] Implementa direto → valida manual
│   ├── Auto-review obrigatório com @revisor
│   └── Checkpoint salvo automaticamente
│
└── Relatório final
```

## Fluxo completo

### FASE 1 — Parse + Detecção

1. Leia a spec com a ferramenta `read`
2. Identifique módulos (padrão `### Módulo \d+:`)
3. Extraia: nome, camada, dependências, tarefas
4. **Auto-detecte:**
   - **Infraestrutura de teste:** procure `jest.config`, `vitest.config` ou script `"test"` no `package.json` do projeto alvo
   - **Checkpoint:** veja se existe `.<project_checkpoint_path>/checkpoint-<slug>.json`

> **Resolução de paths por projeto:** Consulte o catálogo mesclado.
> Para cada projeto registrado, o campo `knowledge` define o diretório base.
> O checkpoint fica em `<knowledge>/plans/checkpoint-<slug>.json`.
> Ex: `meu-projeto` → `projects/meu-projeto/knowledge/plans/checkpoint-<slug>.json`
> **Fallback:** projetos sem `knowledge` → `.opencode/knowledge/plans/checkpoint-<slug>.json`
   - **Módulos independentes:** verifique se algum módulo não tem `Dependências`

### FASE 2 — Plano + Confirmação

Monte o plano e mostre ao usuário. **Sempre pergunte antes de executar.**

```
📋 Plano para: <caminho>
├── Módulo 1: <nome> (<camada>) — sem dependências ⚡ Pode paralelizar
├── Módulo 2: <nome> (<camada>) — depende do Módulo 1
├── Módulo 3: <nome> (<camada>) — sem dependências ⚡ Pode paralelizar
├── Testes: ✅ disponíveis (Jest)
└── Checkpoint: ❌ não encontrado (começando do zero)
```

**Pergunte:**
- "Prossigo com a execução?" (sempre — pergunta única)
- Se houver checkpoint: "Checkpoint anterior encontrado. Quer retomar de onde parou?"

**Não pergunte sobre paralelismo** — módulos independentes são executados em paralelo automaticamente por padrão.

### FASE 3 — Execução

Módulos com dependências: execute sequencialmente.
Módulos **independentes** (sem `Dependências` na spec): execute **em paralelo** automaticamente via subagentes simultâneos.

#### Execução por módulo

#### 3.1 Preparação

Identifique se o módulo está num projeto testável (já detectado na Fase 1).

- **Se testável:** siga 3.1a (TDD)
- **Se não testável:** pule para 3.1b (implementação direta)

#### 3.1a TDD (testável)

1. Crie os arquivos de teste com base na seção `#### Testes (TDD)` da spec
2. Execute os testes — devem falhar (RED)
3. Se não falharem (teste já existente), avise e prossiga

#### 3.1b Implementação direta (não testável)

1. Pule a etapa de TDD
2. `Testes: N/A` na validação

#### 3.2 Implementação

1. Leia a seção `#### Implementação` do módulo
2. Delegue ao @pedreiro com as instruções da spec
3. @pedreiro retorna as alterações

#### 3.3 Validação

**Se o projeto for testável:**
1. Execute os testes — devem passar (GREEN)
2. Se falharem: @pedreiro corrige (max 3 tentativas)
3. Se não passar em 3 tentativas, pause e reporte ao usuário

**Se não for testável:**
- Pule a etapa de testes
- Marque `Testes: N/A`

#### 3.4 Auto-review (obrigatório)

Sempre delegue ao @revisor após cada módulo. Não pergunte ao usuário.

```
Delegar @revisor:
  Contexto: <repo>
  Tarefa: Revisar módulo "<nome>" da spec <caminho>
  Critérios:
  - Integridade: as mudanças estão completas?
  - Segurança: introduz riscos?
  - Aderência: segue os Requisitos da spec?
  - Sugestões: melhorias opcionais?
```

Se @revisor aprovar (sem issues graves) → avance.
Se @revisor apontar issues graves → reporte ao usuário e pause.

#### 3.5 Checkpoint

Salve o progresso em `<project_checkpoint_path>/checkpoint-<slug>.json` contendo: módulos concluídos, status de cada um, checkpoint do git.

> **Resolução de paths por projeto:** Consulte o catálogo mesclado.
> O checkpoint fica em `<knowledge>/plans/checkpoint-<slug>.json`.
> Ex: `meu-projeto` → `projects/meu-projeto/knowledge/plans/`. `.workbench` → `.opencode/knowledge/plans/`.
> O diretório `plans/` está no `.gitignore` (checkpoints são efêmeros).
>
> **⚠️ Fallback para projetos sem `knowledge`:** Se o projeto não tiver `knowledge` no catálogo mesclado (ex: `mural-melhorias`, `outro-projeto`, `legado`), use `.opencode/knowledge/plans/` como fallback e avise o usuário.

### FASE 4 — Relatório Final

Após todos os módulos, exiba:

```
╔════════════════════════════════════════════════════╗
║  Relatório de Execução                            ║
╚════════════════════════════════════════════════════╝

Módulos:
  ✅ Módulo 1: <nome> — ok
  ✅ Módulo 2: <nome> — ok

Resumo:
  • Executados: N/N
  • Paralelizados: X módulos
  • Testes: X/X passando (ou N/A)
  • Auto-review: aprovados
  • Pendências: <lista se houver>
```

## Exemplos

```
/execute-spec projects/<projeto>/backlog/features/nome-da-feature.md
/execute-spec .opencode/knowledge/specs/minha-feature.md
/execute-spec specs/minha-feature.md
```

Qualquer texto adicional após o caminho é interpretado naturalmente pelo agente.

## Regras

1. **Auto-detecção primeiro** — antes de perguntar qualquer coisa, tente detectar automaticamente
2. **Sempre mostrar o plano antes de executar** — e perguntar se pode prosseguir
3. **Auto-review obrigatório** — @revisor sempre roda após cada módulo, sem exceção
4. **Paralelismo automático** — módulos independentes rodam em paralelo sem perguntar
5. **Módulo com falha em 3 tentativas** → pausar e reportar
6. **Checkpoints automáticos** — salvos a cada módulo concluído
7. **Spec mal formatada** — se não encontrar módulos, sugerir usar `/new-feature-spec` para criar spec modular
