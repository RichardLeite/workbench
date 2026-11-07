# ADR-002: Contrato entre schema e validador de projetos

**Status:** Proposto  
**Data:** 2026-11-07  
**Decisores:** Workbench maintainers  
**Fase do plano:** P5 — Contrato schema/validador

## Context

O Workbench mantém duas representações para o manifesto `projects/<slug>/project.json`:

- `projects/schema.json`, usado por editores e ferramentas JSON Schema;
- `src/workbench/project_schema.py`, usado pelo runtime (`wb projects validate`).

As duas implementações podem divergir silenciosamente: um campo aceito pelo editor pode ser rejeitado pelo CLI, ou vice-versa. Isso aumenta o risco de manifests inválidos passarem na edição e falharem apenas no runtime.

O P5 do plano exige um contrato explícito entre schema e validador, sem introduzir dependência pesada no runtime.

## Evidence

- `projects/schema.json`
- `src/workbench/project_schema.py`
- `tests/unit/test_project_schema.py`
- `wb projects validate`
- `projects/_template/project.json`

## Options

1. **Usar apenas o JSON Schema**
   - Editor e ferramentas externas validam.
   - Runtime dependeria de um validador JSON Schema adicional.
   - Aumenta dependências e muda o fluxo atual.

2. **Usar apenas o validador Python**
   - Runtime permanece simples.
   - Perde validação no editor e documentação estrutural.

3. **Manter schema + validador Python com teste de contrato (recomendado)**
   - Cada representação permanece adequada ao seu consumidor.
   - Um teste compara campos, obrigatoriedade e formatos.
   - Drift vira falha de CI.

4. **Gerar o validador a partir do schema**
   - Fonte única.
   - Exige code generation ou dependência de JSON Schema.
   - Maior complexidade para o tamanho atual do manifesto.

## Decision

Adotar a **opção 3**:

- `projects/schema.json` continua sendo a fonte declarativa para editores.
- `project_schema.py` continua sendo o validador de runtime.
- Adicionar teste de contrato em `tests/unit/test_project_schema.py` cobrindo:
  - campos permitidos;
  - campos obrigatórios;
  - tipos e padrões;
  - `additionalProperties: false`.
- O teste deve falhar quando uma das representações ganhar ou perder um campo sem a outra.

O teste será escrito primeiro (**Red**), seguido do alinhamento mínimo (**Green**) e da extração de helpers (**Refactor**), conforme `.opencode/rules/tdd.md`.

## Consequences

### Positivas

- Detecta drift antes do merge.
- Mantém editores e runtime alinhados.
- Não adiciona dependências ao runtime.
- Documenta o contrato de forma executável.

### Negativas

- Ainda existem duas representações para manter.
- O teste precisa ser atualizado quando o schema evoluir.
- Alguns comportamentos do validador Python (paths seguros, globs) não são expressáveis no JSON Schema e exigem testes próprios.

## Trade-offs

- **Ganho:** segurança contra divergência silenciosa com baixo custo.
- **Custo:** manutenção de um teste de contrato.
- **Aceito:** schema e validador continuam separados.
- **Não aceito:** permitir que o schema e o CLI aceitem conjuntos diferentes de campos.

## Risks

| Risco | Impacto | Mitigação |
|---|---|---|
| Teste refletir apenas campos, não tipos | Médio | Comparar propriedades, `required`, `type`, `pattern` e `additionalProperties` |
| Validador aceitar regras extras não representáveis no schema | Baixo | Testes específicos para paths, repos e segurança |
| Schema evoluir sem atualizar o teste | Médio | Falha de CI e revisão no mesmo PR |
| Dependência futura de JSON Schema | Baixo | Decisão limita o escopo ao contrato atual |

## Rollback

- Reverter o teste de contrato e este ADR.
- Manter o validador Python e o schema como estão.
- Nenhuma migração de dados ou alteração de manifesto é necessária.
- O rollback não afeta P1–P4 nem a regra TDD.

## Validation

- Teste de contrato verde para o estado atual.
- Teste **Red** ao remover um campo de uma das representações.
- `wb projects validate` continua passando.
- `uv run pytest` e `uv run ruff check src tests` verdes.
