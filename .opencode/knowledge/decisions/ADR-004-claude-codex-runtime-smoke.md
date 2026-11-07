# ADR-004: Smoke de runtime para Claude Code e Codex

**Status:** Proposto  
**Data:** 2026-11-07  
**Decisores:** Workbench maintainers  
**Fase do plano:** P7 — Runtime Claude/Codex

## Context

O Workbench gera e valida artefatos para OpenCode, Claude Code e Codex, mas apenas o OpenCode possui integração automatizada de runtime:

- `.claude/` é gerado por `wb sync claude`;
- `.claude/skills/workbench` expõe as skills canônicas via plugin;
- `.codex-plugin/plugin.json` aponta para `.opencode/skills`;
- `wb sync codex` valida os arquivos de agentes esperados.

Não existe hoje um teste que confirme que Claude Code ou Codex carregam esses artefatos sem erro. Também não há garantia de que os CLIs estejam instalados nos ambientes de CI.

O P7 pede um smoke real, mas sem tornar a pipeline dependente de autenticação, display ou ferramentas externas opcionais.

## Evidence

- `src/workbench/commands/sync.py` — `wb sync claude/codex`.
- `.claude/settings.json` — hooks e permissões gerados.
- `.claude/skills/workbench/.claude-plugin/plugin.json` — plugin de skills do Claude.
- `.codex-plugin/plugin.json` — skills e metadados do Codex.
- `.opencode/agents/` — fonte canônica dos agentes.
- `.opencode/rules/tdd.md` — regra TDD.

## Options

1. **Apenas validação manual**
   - Sem custo de infraestrutura.
   - Não detecta regressão até alguém abrir cada CLI.

2. **Contrato de artefatos no CI + smoke opcional dos CLIs (recomendado)**
   - O CI sempre valida os arquivos gerados e seus paths.
   - Se `claude` ou `codex` estiverem disponíveis, executa um smoke real.
   - Sem CLI, o teste é skipped com motivo explícito.
   - Não exige auth/modelo para o contrato básico.

3. **Smoke real obrigatório no CI**
   - Cobertura maior.
   - Dependência de instalação, auth, versões e rede.
   - Alto risco de flakiness e bloqueio de PRs.

4. **Não testar os bridges**
   - Menor manutenção.
   - Regressões só aparecem no uso real.

## Decision

Adotar a **opção 2**:

- Testes de contrato obrigatórios no CI para:
  - existência e validade do plugin de skills do Claude;
  - paths declarados em `.claude/skills/workbench/.claude-plugin/plugin.json`;
  - `.codex-plugin/plugin.json` e seu caminho de skills;
  - agents esperados por `wb sync codex`;
  - execução de `wb sync claude` e `wb sync codex` sem erro.
- Smoke real opcional:
  - executar `claude` e/ou `codex` somente quando o binário estiver disponível;
  - usar workspace temporário e ambiente isolado;
  - pular com mensagem clara quando ausente;
  - nunca falhar por falta de auth em PR comum.
- Fixar as versões mínimas suportadas e registrar a versão no output do teste.

O ciclo TDD será:

- **Red:** path quebrado ou plugin ausente deve falhar no contrato;
- **Green:** artefatos gerados e sync passam;
- **Refactor:** helpers compartilhados para workspace temporário e skip por CLI.

## Consequences

### Positivas

- Detecta regressões de paths e plugins antes do uso manual.
- Mantém o CI determinístico.
- Permite smoke real quando o ambiente oferece os CLIs.
- Documenta claramente o que é garantido em CI e o que é opcional.

### Negativas

- O contrato não prova que a UI/CLI externa carregou o artefato.
- O smoke opcional pode não rodar na maioria dos PRs.
- Versões de Claude/Codex podem divergir do esperado.
- Exige manutenção de fixtures e mensagens de skip.

## Trade-offs

- **Ganho:** cobertura útil sem transformar PRs em testes dependentes de auth.
- **Custo:** dois níveis de teste e manutenção de skip.
- **Aceito:** smoke real é local/nightly, não gate universal.
- **Não aceito:** pipeline obrigatória que falha por CLI não instalado.

## Risks

| Risco | Impacto | Mitigação |
|---|---|---|
| CLI externo ausente | Médio | Skip explícito no CI comum |
| Auth/modelo indisponível | Alto | Smoke real não obrigatório em PR |
| Versão do Claude/Codex incompatível | Médio | Fixar versão mínima e reportar versão |
| Path absoluto específico da máquina | Médio | Usar paths relativos e workspace temporário |
| Teste falso-positivo por artefato antigo | Médio | Gerar `.claude`/`.codex` em temp a cada execução |

## Rollback

- Remover o job de smoke opcional e manter apenas os contratos de artefatos.
- Se os contratos forem instáveis, manter `wb sync claude/codex` como validação manual e reverter este ADR.
- Nenhum dado de usuário, sessão ou auth é alterado.
- O rollback não afeta P1–P6.

## Validation

- Teste de contrato do plugin do Claude falha com path quebrado.
- Teste de contrato do Codex falha com `plugin.json` inválido.
- `wb sync claude` e `wb sync codex` passam em workspace temporário.
- Se `claude`/`codex` existirem, smoke real executa e reporta versão.
- Se não existirem, testes são `skipped` com motivo.
- Pytest, Ruff e CI OpenCode continuam verdes.
