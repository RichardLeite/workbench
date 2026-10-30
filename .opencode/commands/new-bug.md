---
description: "Cria especificação de bug — ambiente, reprodução, causa raiz, solução"
agent: build
---

## 1. Criar especificação de bug

Crie um novo documento de bug usando o template:

- **Template:** `@.opencode/templates/bug-template.md`

### Instruções para preencher o template

Use `$ARGUMENTS` como título ou identificador do bug. Se nenhum argumento for fornecido, proponha um título claro a partir do contexto. Se os dados da entrevista do task-refiner estiverem disponíveis (via `/refinar`), use o `$INTERVIEW_DATA` para preencher:

| Campo da entrevista | Seção do template |
|---|---|
| `environment` | Ambiente |
| `expected_vs_actual` | Comportamento Esperado + Atual (dividir o campo) |
| `repro_steps` | Reprodução (Cenário) |
| `evidence` | Evidências |
| `severity` | Mencionar na descrição |
| `extra_notes` | Solução + Causa Raiz |
| `tech_findings` | Notas Técnicas |

## 2. Salvar

O caminho é resolvido do contexto do projeto atual via `project-mapping.json`:

- **Projeto registrado** (ex: `meu-projeto`, `fiscal`): `<knowledge>/backlog/bugs/<arquivo>.md`
  onde `<knowledge>` é o campo `knowledge` do projeto em `project-mapping.json`
- **`.workbench`**: `.opencode/knowledge/bugs/<arquivo>.md`
- **Projeto sem knowledge**: perguntar ao usuário onde salvar

## 3. Atualizar vault se regra mudou

Após salvar a spec, você DEVE chamar um subagente e executar o vault-updater:

1. Leia `.opencode/agents/vault-updater.md` por completo
2. Siga a árvore de decisão — a maioria dos bugs é `FIX_ONLY`
3. Se `RULE_CHANGE` (regra de negócio existente foi modificada):
   - Leia o domínio do vault afetado
   - Adicione a nova regra com contexto seguindo as diretrizes
4. Se `FIX_ONLY`: informe que o vault não foi alterado
5. Retorne o resultado ao usuário
