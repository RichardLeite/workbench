---
description: "Cria feature de negócio (backlog/features) + spec técnica executável (specs/) — dois artefatos separados em locais diferentes"
---

## 1. Criar especificação de negócio (Feature)

Crie a especificação da funcionalidade usando o template de negócio:

- **Template:** `@.opencode/templates/feature-template.md`

### Instruções para preencher o template

Use `$ARGUMENTS` como nome/escopo da funcionalidade. Se os dados da entrevista do task-refiner estiverem disponíveis (via `/refinar`), use o `$INTERVIEW_DATA` para preencher:

| Campo da entrevista               | Seção do template                 |
| --------------------------------- | --------------------------------- |
| `objective`                       | Problema                          |
| `stakeholder` + `impact`          | Valor para o Negócio              |
| `scope_in_out` + `business_rules` | Requisitos Funcionais             |
| `acceptance_criteria`             | Critérios de Aceite               |
| `extra_notes`                     | Notas                             |
| `dependencies`                    | Mencionar nos Requisitos ou Notas |

### Formato do template

O template `feature-template.md` é focado em **negócio** — problema, valor, requisitos funcionais e critérios de aceite. Não inclui detalhes de implementação, módulos ou TDD (esses vão na spec técnica).

### Salvar feature

O caminho é resolvido do contexto do projeto atual via `project-mapping.json`:

- **Projeto registrado** (ex: `meu-projeto`, `fiscal`): `<knowledge>/backlog/features/<slug>.md`
  onde `<knowledge>` é o campo `knowledge` do projeto em `project-mapping.json`
- **`.workbench`**: `.opencode/knowledge/features/<slug>.md`
- **Projeto sem knowledge**: perguntar ao usuário onde salvar

O slug deve ser derivado do nome da funcionalidade, em kebab-case.

---

## 2. Criar especificação técnica executável (Spec)

Após criar a feature de negócio, crie a **spec técnica** usando o template executável:

- **Template:** `@.opencode/templates/spec-template.md`

### Instruções para preencher o template técnico

Use a `$INTERVIEW_DATA` e a feature recém-criada como base para gerar os módulos:

| Campo da entrevista / Feature    | Seção do template técnico        |
| -------------------------------- | -------------------------------- |
| `objective`                      | Objetivo                         |
| `layers` afetadas                | Cada camada vira um **Módulo**   |
| `acceptance_criteria`            | Requisitos SHALL + GIVEN/WHEN/THEN |
| `business_rules`                 | Regras como requisitos nos módulos |
| `tech_findings`                  | Notas Técnicas                   |
| `dependencies`                   | Pré-requisitos                   |
| `extra_notes`                    | Incluir nas notas dos módulos    |

### Estrutura de módulos (ordem fixa)

Sempre criar os módulos nesta ordem, pulando camadas não afetadas:

1. **Migrations** (banco) — se houver novas tabelas/campos
2. **Models** (backend) — se houver novas entidades
3. **Repository** (backend) — se houver nova camada de dados
4. **Services** (backend) — lógica de negócio
5. **Controller + Routes** (backend) — endpoints
6. **Frontend Rotas + Consulta** (frontend) — listagem
7. **Frontend Formulário** (frontend) — cadastro/edição
8. **Frontend Modais** (frontend) — se houver modais

Cada módulo deve conter: **Descrição → Requisitos (SHALL + Cenários GIVEN/WHEN/THEN) → Testes (TDD — marcar N/A se sem infra) → Implementação (checklist) → Validação**.

### Formato do template

O template `spec-template.md` é focado em **execução** — módulos atômicos com requisitos testáveis e checklists de implementação. Projetado para ser executado pelo `/execute-spec`.

### Salvar spec técnica

O caminho é resolvido do contexto do projeto atual via `project-mapping.json`:

- **Projeto registrado** (ex: `meu-projeto`, `fiscal`): `<knowledge>/specs/spec-<slug>.md`
  onde `<knowledge>` é o campo `knowledge` do projeto em `project-mapping.json`
- **`.workbench`**: `.opencode/knowledge/specs/spec-<slug>.md`
- **Projeto sem knowledge**: perguntar ao usuário onde salvar

O nome deve derivar do mesmo slug da feature, prefixado com `spec-`.

---

## 3. Validar ambos os artefatos

### 3.1 Verificação estrutural

Verifique que:
- [ ] Feature salva em `<knowledge>/backlog/features/<slug>.md` — existe e tem todas as seções do template
- [ ] Spec técnica salva em `<knowledge>/specs/spec-<slug>.md` — existe e tem todos os módulos necessários
- [ ] O mapeamento interview → template foi aplicado corretamente em ambos

### 3.2 Gate de validação (obrigatório para features complexas)

> **Inspirado no `/pipeline` Fase 2.** Para features com 3+ módulos ou que afetam
> múltiplas camadas (backend + frontend + banco), execute o gate de validação
> antes de prosseguir para implementação.

#### tech-lead: Revisão técnica

```
Delegar @tech-lead:
  Contexto: spec técnica em <spec_path>/spec-<slug>.md
  Tarefa: Revisar viabilidade técnica e completude da spec
  Critérios:
  - Viabilidade: a solução proposta é tecnicamente viável?
  - Arquitetura: segue os padrões do projeto? Impacta outras áreas?
  - Completude: todos os módulos necessários estão presentes?
  - Riscos: há riscos técnicos não mapeados?
  - Dependências: as dependências entre módulos estão corretas?
  Retorno: JSON com {aprovada: boolean, issues: [{severidade, descricao, modulo, sugestao}]}
```

#### qa-engineer: Revisão de testabilidade

```
Delegar @qa-engineer:
  Contexto: spec técnica em <spec_path>/spec-<slug>.md
  Tarefa: Revisar testabilidade e cobertura dos critérios de aceite
  Critérios:
  - Testabilidade: cada requisito SHALL é testável?
  - Cobertura: cada acceptance criterion tem pelo menos um cenário GIVEN/WHEN/THEN?
  - Edge cases: há cenários de erro, limites, concorrência?
  Retorno: JSON com {aprovada: boolean, issues: [{severidade, descricao, modulo, sugestao}]}
```

#### Decisão do Gate

| Situação | Ação |
|----------|------|
| ✅ Ambos aprovam | Avança para implementação |
| ⚠️ Issues leves (P2) | Avança, mas registra no relatório |
| 🔴 Issues GRAVES (P0/P1) | **Pausa.** Mostra as issues ao usuário. Pergunta: "Corrigir spec antes de prosseguir?" |

---

## 4. Atualizar vault

Após salvar ambos os artefatos, você DEVE chamar um subagente e executar o vault-updater:

1. Leia `.opencode/agents/vault-updater.md` por completo
2. Siga a árvore de decisão para classificar a mudança
3. Se a mudança NÃO for `FIX_ONLY` nem `NO_CHANGE`:
   - Leia os arquivos do vault afetados
   - Aplique as mudanças seguindo as diretrizes
4. Retorne o resumo das alterações do vault ao usuário
