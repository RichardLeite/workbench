# Memory Policy

> Arquitetura de memória em 3 camadas. Complementa `rules/rag-retrieval.md` e `rules/vault-flow.md`.

## Architecture

```
HOT (session context)     → config/orquestrador-memory.md  [~3KB, always loaded]
WARM (reusable knowledge) → .opencode/knowledge/            [RAG-searchable]
COLD (history + audit)    → .opencode/sessions/             [FTS5-searchable]
```

## Hot Memory (Tier 1)

Sempre carregada no system prompt do orquestrador.

**Conteúdo**:
- Projetos ativos, branches atuais
- Preferências do usuário
- Lições críticas recentes
- Configurações de ambiente

**Limite**: ~3.000 chars (~1.200 tokens). Consolidar quando cheio.

## Warm Memory (Tier 2)

Conhecimento reutilizável, buscado via RAG sob demanda.

**Conteúdo**:
- ADRs e decisões arquiteturais
- Bugs recorrentes e causas raiz
- Padrões técnicos (UI, banco, API, segurança)
- Preferências de projeto
- Erros de roteamento e correções

**Localização**: `.opencode/knowledge/{bugs,features,specs,plans,metrics}/`

**Formato de nota**:
```markdown
---
title: ...
type: feature|bug|spec|plan|metric
date: YYYY-MM-DD
tags: [...]
status: ativa|desatualizada|arquivada
---

# Título

## Contexto
## Decisão/Aprendizado
## Impacto
## Links
```

## Cold Memory (Tier 3)

Histórico e auditoria, buscado via FTS5.

**Conteúdo**:
- Sessões antigas
- Postmortems
- Relatórios de auditoria
- Experimentos arquivados

**Localização**: `.opencode/sessions/` (criar quando necessário)

## RAG Trigger (Gatilho Inteligente)

Buscar warm/cold memory APENAS se a mensagem contiver:

1. **Alias de projeto** (`@meu-projeto-api`, `@fiscal-api`)
2. **Nome de repositório** ou arquivo específico
3. **Erro técnico** conhecido ou stack trace
4. **Stack específica** (Node, React, MySQL, PostgreSQL)
5. **Módulo específico** (auth, payment, migration, fiscal)
6. **Decisão arquitetural** (ADR, trade-off)
7. **Termo de negócio recorrente** (NF-e, ICMS, OS, contrato)
8. **Pedido de continuar tarefa anterior**
9. **Ambiguidade** que pode ser resolvida por memória
10. **Tarefa com risco** de alterar comportamento existente

**Limites**:
- Simples: max 3 resultados
- Média: max 5 resultados
- Complexa: max 8 resultados

## Quando NÃO buscar

- Mensagens puramente operacionais ("rode os testes", "commit")
- Quando o usuário pediu explicitamente para não buscar
- Quando o contexto da conversa atual já basta

## Ciclo de Aprendizado

```
1. EXECUTA → 2. APRENDE (extrai 1-3 lições) → 3. ARMAZENA (nota no vault)
4. CONSULTA (orquestrador faz RAG antes de delegar) → 5. APLICA (melhora a próxima execução)
```

**Salvar**:
- Erro de roteamento (qual agente deveria ser chamado)
- Peculiaridade de ferramenta
- Preferência do usuário descoberta
- Correção recebida
- Causa raiz de bug

**Pular**:
- Obviedades, efêmeros de sessão, info já em context files, dumps de dados

## Manutenção

- Hot memory: consolidar quando >2.500 chars
- Vault: arquivar notas >30 dias ou marcar `status: desatualizada`
- Notas sem frontmatter têm peso menor no RAG

## Ver também

- `rules/rag-retrieval.md` — regra de busca automática
- `rules/vault-flow.md` — fluxo de documentação de skills
- `config/orquestrador-memory.md` — hot memory ativa
