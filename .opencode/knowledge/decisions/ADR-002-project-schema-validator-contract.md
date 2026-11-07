# ADR-002: Contrato entre schema e validador de projetos

**Status:** Proposto  
**Data:** 2026-11-07  
**Decisores:** Workbench maintainers  
**Fase do plano:** P5 — Contrato schema/validador

## Context

O Workbench mantém duas representações para o manifesto `projects/<slug>/project.json`:

- `projects/schema.json`, schema declarativo para ferramentas JSON Schema;
- `src/workbench/project_schema.py`, usado pelo runtime (`wb projects validate`).

Hoje o schema não está associado a nenhum editor no repositório e o template do manifesto não declara `$schema`. Ainda assim, as duas representações podem divergir: um campo ou entrada aceita por uma pode ser rejeitada pela outra.

Exemplos reais de divergência que o contrato precisa cobrir:

- `name: "   "` é aceito pelo `minLength: 1` do schema, mas rejeitado por `not name.strip()` no validador;
- `knowledge`/`vault` são strings nullable no schema, mas o validador exige path relativo contido no workbench.

O P5 exige um contrato explícito, sem introduzir dependência pesada no runtime.

## Evidence

- `projects/schema.json`
- `src/workbench/project_schema.py`
- `tests/unit/test_project_schema.py`
- `wb projects validate`
- `projects/_template/project.json`
- `src/workbench/discovery.py` — manifestos em `<repo>/.workbench/project.json` não passam pelo validador de `projects/`.

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
   - Um teste compara metadados e comportamento.
   - Drift vira falha de CI.

4. **Gerar o validador a partir do schema**
   - Fonte única.
   - Exige code generation ou dependência de JSON Schema.
   - Maior complexidade para o tamanho atual do manifesto.

## Decision

Adotar a **opção 3**, com dois níveis de contrato:

1. **Metadados:** comparar `properties`, `required`, `type`, `pattern`, `minLength`, `additionalProperties` e os campos de `ALLOWED_FIELDS`.
2. **Comportamento:** executar uma tabela compartilhada de entradas válidas e inválidas contra o schema e contra `validate_manifest`, incluindo:
   - nome vazio/whitespace;
   - `knowledge`/`vault` fora do workbench;
   - `repos` com path absoluto ou `..`;
   - `additionalProperties`;
   - `agents` com tipos inválidos.

Além disso:

- Adicionar `$schema` como propriedade permitida no schema e no validador.
- Adicionar o mapeamento do schema para o editor (ex.: `.vscode/settings.json`) ou documentar o comando de validação, para que a premissa do editor tenha um consumidor real.
- Manter `project_schema.py` como validador de runtime.
- Registrar explicitamente que manifestos descobertos em `<repo>/.workbench/project.json` estão fora deste contrato, a menos que sejam integrados ao `projects/` em um trabalho separado.

O teste será escrito primeiro (**Red**), seguido do alinhamento mínimo (**Green**) e da extração de helpers (**Refactor**), conforme `.opencode/rules/tdd.md`.

## Consequences

### Positivas

- Detecta drift de campos e de comportamento antes do merge.
- Mantém editores e runtime alinhados.
- Não adiciona dependências ao runtime.
- Documenta o contrato de forma executável.

### Negativas

- Ainda existem duas representações para manter.
- O teste precisa ser atualizado quando o schema evoluir.
- Alguns comportamentos do validador Python (paths seguros, globs) não são expressáveis no JSON Schema e exigem testes próprios.
- Manifestos em `<repo>/.workbench/project.json` continuam fora do contrato.

## Trade-offs

- **Ganho:** segurança contra divergência silenciosa com baixo custo.
- **Custo:** manutenção de testes de metadados e comportamento.
- **Aceito:** schema e validador continuam separados.
- **Não aceito:** permitir que schema e CLI aceitem conjuntos diferentes de campos ou entradas válidas.

## Risks

| Risco | Impacto | Mitigação |
|---|---|---|
| Teste refletir apenas metadados | Médio | Tabela de entradas válidas/inválidas executada nos dois lados |
| Editor sem wiring | Médio | Adicionar mapping ou documentar validação; coberto na decisão |
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
- Teste **Red** ao remover um campo ou ao alterar uma regra de comportamento.
- `wb projects validate` continua passando.
- `uv run pytest` e `uv run ruff check src tests` verdes.
