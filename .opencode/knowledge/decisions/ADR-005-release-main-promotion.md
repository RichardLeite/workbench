# ADR-005: Release e promoção final de dev para main

**Status:** Proposto  
**Data:** 2026-11-07  
**Decisores:** Workbench maintainers  
**Fase do plano:** P8 — Release e promoção final

## Context

O Workbench usa o fluxo `feature/fix -> dev -> main`. As mudanças são acumuladas em `dev` e promovidas para `main` apenas como pacote final.

O repositório já possui CI para Python, scripts, plugin, integração OpenCode, orchestrator e audit. Também possui o comando `wb release`, mas o processo de promoção ainda não está formalizado como gate de release.

O P8 precisa garantir que a promoção para `main` seja reproduzível, auditável e reversível, sem commits diretos em `main`/`dev`.

## Evidence

- `AGENTS.md` — fluxo `feature/fix -> dev -> main`.
- `.opencode/rules/constitution.md` — proibições de commit direto em branches protegidas.
- `.github/workflows/ci.yml` — gates de CI em `dev` e `main`.
- `package.json` e `pyproject.toml` — scripts e versão do Workbench.
- `src/workbench/commands/release.py` — suporte a release/tag.
- `docs/opencode.md` — documentação do fluxo de branches.

## Options

1. **Promoção ad-hoc de `dev` para `main`**
   - Rápido.
   - Sem checklist, notas ou evidência padronizada.
   - Alto risco de release incompleto.

2. **Checklist manual + PR `dev -> main` + tag após merge (recomendado)**
   - Gate explícito com evidências.
   - PR preserva revisão e histórico.
   - Tag e release notes somente depois do merge.
   - Rollback documentado.

3. **Promoção automática por push em `dev`**
   - Menor intervenção.
   - Sem gate humano e sem janela de decisão.
   - Incompatível com a regra de não aprovar/mergear via agente.

4. **Tag antes do merge**
   - Permite preparar artefatos cedo.
   - Pode criar tag apontando para código não promovido.
   - Não recomendado.

## Decision

Adotar a **opção 2**:

1. Congelar mudanças em `dev` no início da release.
2. Executar o checklist:
   - `git fetch --prune`;
   - `dev` atualizado e CI verde;
   - Pytest, Ruff, plugin tests, integração OpenCode e process validate;
   - docs/changelog atualizados;
   - versão definida;
   - nenhum segredo ou artefato temporário no diff.
3. Abrir **PR de `dev` para `main`** com:
   - resumo das mudanças;
   - evidências dos testes;
   - riscos;
   - rollback.
4. Após aprovação e merge, criar tag `vX.Y.Z` e GitHub Release.
5. Nunca commitar diretamente em `main` ou `dev`.
6. Nunca aprovar ou mergear o PR via agente.

O TDD se aplica a mudanças de código na release; documentação, changelog e geração de artefatos são exceções previstas em `.opencode/rules/tdd.md`.

## Consequences

### Positivas

- Release reproduzível e auditável.
- Histórico de revisão preservado no PR.
- Tag aponta para o código efetivamente promovido.
- Rollback claro e sem force-push.
- Menor risco de `main` divergir de `dev`.

### Negativas

- Exige uma janela de freeze e checklist manual.
- A promoção não é totalmente automática.
- Release notes podem exigir curadoria.
- Tags precisam de disciplina após o merge.

## Trade-offs

- **Ganho:** controle e rastreabilidade.
- **Custo:** uma etapa manual de release.
- **Aceito:** releases não são contínuas em `main`.
- **Não aceito:** tag antes do merge ou commit direto em branch protegida.

## Risks

| Risco | Impacto | Mitigação |
|---|---|---|
| `dev` divergir de `main` | Alto | PR final e merge antes da tag |
| CI verde localmente, falha no PR | Médio | Rodar exatamente os gates do CI |
| Versão/tag incorreta | Médio | Revisar versão e dry-run do release |
| Release notes incompletas | Baixo | Checklist e revisão do PR |
| Rollback sem plano | Alto | Definir tag/commit de rollback antes do merge |
| Credenciais em artefatos | Alto | Auditoria de diff e secrets antes do PR |

## Rollback

- Antes do merge: fechar o PR e corrigir em `dev`.
- Depois do merge, antes da tag: reverter o merge na `main` via PR.
- Depois da tag: publicar correção via novo ciclo `dev -> main`; não mover tags existentes.
- Nunca usar `git push --force` em `main`/`dev`.
- Preservar a tag e o release para auditoria, marcando como revogados quando necessário.

## Validation

- CI completo verde no PR `dev -> main`.
- Checklist de release anexado ao PR.
- `wb release --preview` ou dry-run sem erros.
- Tag criada somente após o merge.
- Smoke pós-release do pacote/versão publicada.
- Rollback testado em dry-run ou documentado com commit alvo.
