# ADR-001: Estratégia de testes do OpenCode Desktop

**Status:** Proposto  
**Data:** 2026-11-07  
**Decisores:** Workbench maintainers  
**Fase do plano:** P4 — Estratégia de testes do Desktop

## Context

O Workbench já valida a integração do OpenCode via CLI nas três plataformas, mas ainda não possui um gate automatizado específico para o **OpenCode Desktop**.

Os últimos bugs só apareceram no Desktop:

- rejeição de `reference` pelo schema `ConfigV2.Reference.Local`;
- diferença entre `{ "path": "./JARVIS" }` e `"./JARVIS"`;
- agentes duplicados por diferença de maiúsculas/minúsculas.

O CLI aceitava parte desses formatos, então os testes de integração existentes não detectaram as regressões. A validação do Desktop dependia de restart manual e inspeção visual, gerando ciclos repetidos de correção.

O Workbench adotou TDD como regra obrigatória, portanto o gate do Desktop deve ser compatível com Red → Green → Refactor.

## Evidence

- `.github/workflows/ci.yml` — matriz CLI Ubuntu/macOS/Windows, sem Desktop.
- `.opencode/plugins/projects.ts` — geração de referências locais.
- `tests/integration/test_opencode_plugin.py` — integração via `opencode debug config`.
- `.opencode/rules/tdd.md` — regra TDD.
- `~/.local/share/opencode/log/opencode.log` — evidências de `schema rejection`.
- OpenCode Desktop `1.19.5`.

## Options

1. **Manter smoke manual do Desktop**
   - Menor esforço.
   - Não detecta regressões automaticamente.
   - Mantém o ciclo de restart manual.

2. **Smoke automatizado do Desktop + matriz CLI (recomendado)**
   - Automatizar inicialização do Desktop com perfil/workspace isolados.
   - Inspecionar logs e estado de carregamento.
   - Falhar em `schema rejection`, erro de config ou agente duplicado.
   - Manter o CLI como gate principal de CI.

3. **Playwright/Electron E2E completo imediatamente**
   - Valida a UI real.
   - Alto custo, flakiness e manutenção.
   - Dependência de display, perfil, auth e versão do Desktop.

4. **Não criar gate de Desktop**
   - CI permanece rápido.
   - Regressões específicas do Desktop continuam chegando ao usuário.

## Decision

Adotar a **opção 2**:

1. Implementar primeiro o **P4a — smoke automatizado do Desktop**, com:
   - workspace temporário;
   - perfil/cache isolados;
   - versão fixada do Desktop;
   - assert de ausência de `schema rejection`;
   - assert de agente único `orquestrador`;
   - evidência de carregamento do alias do projeto.
2. Manter a matriz CLI existente como gate obrigatório de CI.
3. Adiar o **P4b — Playwright/Electron E2E completo** até que o smoke se mostre insuficiente.
4. Aplicar TDD no harness:
   - **Red:** fixture com reference inválida/agente duplicado deve falhar.
   - **Green:** workspace limpo deve carregar.
   - **Refactor:** extrair setup de perfil/workspace.

## Consequences

### Positivas

- Detecta regressões específicas do Desktop antes da validação manual.
- Reduz ciclos de restart e correção.
- Mantém o CI rápido, pois o smoke do Desktop pode ser local ou opcional.
- Cria uma base reutilizável para o E2E completo no futuro.

### Negativas

- O smoke não valida toda a UI.
- A automação do Electron pode ser instável.
- Exige manutenção quando a versão do Desktop mudar.
- Pode depender de logs internos do OpenCode.

## Trade-offs

- **Ganho:** feedback rápido sobre config/agentes no Desktop.
- **Custo:** um harness adicional específico de Electron/Windows.
- **Aceito:** não cobrir cliques, telas e fluxos completos no P4a.
- **Não aceito:** manter validação exclusivamente manual para erros de boot.

## Risks

| Risco | Impacto | Mitigação |
|---|---|---|
| Flakiness do Electron | Alto | Timeout generoso, retries limitados, logs estruturados |
| Versão do Desktop diferente do CLI | Alto | Fixar versão e falhar explicitamente em mismatch |
| Cache/servidor compartilhado | Médio | Perfil, `HOME`, `XDG_*` e workspace isolados |
| Falso positivo por log antigo | Médio | Rotacionar/limpar log antes do teste |
| Perda de sessões/auth | Alto | Nunca apagar dados reais; usar perfil temporário |
| UI sem hooks de teste | Médio | P4a baseado em logs/config; P4b somente se necessário |

## Rollback

- Se o smoke for instável ou bloquear o fluxo:
  - desativar o job/gate do Desktop;
  - manter a matriz CLI;
  - reverter o ADR para “manual smoke”;
  - remover o harness e dependências adicionadas.
- Nenhuma migração de dados ou alteração de produção é necessária.
- O rollback não afeta P1–P3 nem a regra TDD.

## Validation

### P4a

- Teste **Red** falha com:
  - `schema rejection` simulado;
  - agente `orquestrador` duplicado;
  - reference inválida.
- Teste **Green** passa com workspace limpo.
- Desktop inicia sem dialog de erro.
- `orquestrador` aparece exatamente uma vez.
- Alias `@JARVIS` é carregado.
- Log não contém `schema rejection` após o início do teste.

### Critérios de sucesso

- Nenhum restart manual necessário para detectar a classe de erro.
- Falha reproduzível em menos de 2 minutos.
- CI CLI continua verde.
- P4b só é iniciado se P4a não cobrir os incidentes observados.
