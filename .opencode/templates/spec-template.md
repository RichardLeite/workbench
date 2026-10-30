# Spec: <nome>

> **Gerado em:** {data}
> **Esquema:** Spec Executável v1 — Módulos com TDD + Revisão Automática
> **Uso:** Projetada para ser executada pelo `/execute-spec`

## TASK

{ISSUE_ID}

## Objetivo

{objective — objetivo técnico da spec}

## Pré-requisitos

{prerequisites — dependências, conhecimento necessário, acesso}

---

## Módulos

> Cada módulo é uma unidade atômica: testes primeiro (se o projeto tiver infra) → implementação → validação.
> A ordem dos módulos é a ordem de execução. Módulos sem dependências podem ser paralelizados.

---

### Módulo 1: <nome>

**Camada:** {backend / frontend / banco / docs}
**Dependências:** (ex: Módulo 1, Nenhuma)
**Estimativa:** {estimativa}

#### Descrição

{O que este módulo faz, em 2-3 frases}

#### Requisitos

##### Requisito: <NomeDoRequisito>

O sistema SHALL <descrição do comportamento obrigatório>.

###### Cenário: <NomeCenario>
- **GIVEN** {precondição}
- **WHEN** {ação}
- **THEN** {resultado esperado}
- **AND** {assertiva adicional (opcional)}

###### Cenário: <NomeCenario2>
- **GIVEN** {precondição alternativa}
- **WHEN** {ação}
- **THEN** {resultado esperado}

#### Testes (TDD)

> Incluir apenas se o projeto tiver infraestrutura de teste (jest, vitest, etc.).
> Escrever testes ANTES da implementação.
> Se não houver, marcar como `N/A`.

- [ ] **Teste:** {descrição do teste — o que valida, como, resultado esperado} *(opcional)*
- [ ] **Teste:** {descrição} *(opcional)*

#### Implementação

- [ ] {tarefa de implementação}
- [ ] {tarefa de implementação}
- [ ] {atualizar docs/ADR se aplicável}

#### Validação

- [ ] **Testes:** passando (ou N/A se sem infra)
- [ ] **Auto-review:** @revisor aprovou o módulo
- [ ] **Checkpoint:** sem issues graves

---

### Módulo 2: <nome>

**Camada:** {backend / frontend / banco / docs}
**Dependências:** Módulo 1
**Estimativa:** {estimativa}

#### Descrição

...

#### Requisitos

##### Requisito: <NomeDoRequisito>

O sistema SHALL <descrição>.

###### Cenário: <NomeCenario>
- **GIVEN** {precondição}
- **WHEN** {ação}
- **THEN** {resultado}
- **AND** {assertiva}

#### Testes (TDD)

> Incluir apenas se o projeto tiver infraestrutura de teste.
> Se não houver, marcar como `N/A`.

- [ ] **Teste:** {descrição} *(opcional)*
- [ ] **Teste:** {descrição} *(opcional)*

#### Implementação

- [ ] {tarefa}
- [ ] {tarefa}

#### Validação

- [ ] Testes: passando (ou N/A)
- [ ] Auto-review: @revisor aprovou
- [ ] Checkpoint: sem issues graves

---

## Dependências Externas

- {dependências externas, times, APIs, bibliotecas}

## Notas Técnicas

{tech_findings — descobertas do codebase durante refinamento}

<!-- Salvar em <knowledge>/specs/spec-<slug>.md — resolvido do catálogo mesclado, campo `knowledge` -->
