# Bug: <titulo>

> **Gerado em:** {data}
> **Tipo:** Especificação de Bug

## TASK

TASK-XXXX

## Ambiente

{environment — onde ocorre: produção, staging, browser, dispositivo, versão da API, rota, etc.}

## Descrição

### Comportamento Esperado
{O que deveria acontecer — extraído de `expected_vs_actual` (parte "esperado")}

### Comportamento Atual
{O que acontece de fato — extraído de `expected_vs_actual` (parte "atual")}

## Reprodução

#### Cenário: ReproduzirBug
- **GIVEN** {precondição — estado do sistema, dados, login, etc.}
- **WHEN** {passos para reproduzir}
- **THEN** {comportamento incorreto observado}

## Causa Raiz

{root_cause — análise de por que o bug ocorre, arquivos/funções envolvidas}

## Solução

**Camada:** {backend / frontend / banco}

### Arquivos Afetados

- `{caminho/do/arquivo}` — {o que mudar}
- `{caminho/do/arquivo}` — {o que mudar}

### Validação

- [ ] Bug reproduzido antes da correção
- [ ] Bug não reproduz após a correção
- [ ] Testes de regressão passando (se houver infra)
- [ ] **Auto-review:** @revisor aprovou (impacto mínimo, sem efeitos colaterais)

## Rollback

- **Estratégia:** {reverter commit / desabilitar feature flag / hotfix reverso}
- **Risco:** {baixo / médio / alto — justificativa}

## Evidências

- **Paths:** {paths relevantes}
- **Logs:** {logs, traces, IDs}
- **Screenshots:** {prints anexados}

## Notas Técnicas

{tech_findings — arquivos envolvidos, causas raiz identificadas}

<!-- Salvar em <knowledge>/backlog/bugs/<slug>.md -->
