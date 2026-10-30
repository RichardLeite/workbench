# ADR-004 — Sprint Task Definitions

> **Status:** Aceito
> **Contexto:** padronizar a criação de tasks de sprint a partir de PBIs/Bugs.
> **Escopo:** opcional; usado por fluxos que integram com um tracker (ex: Azure Boards).

## Decisão

As tasks de sprint seguem um conjunto fixo de definições, referenciadas como R1–R6.

### R1 — Tasks fixas por PBI/Bug

Toda PBI/Bug trabalhada recebe as tasks fixas:

- `Code Review`
- `Task Owner`
- `PM Validation`
- `Testing — {scope}`

### R2 — Tasks condicionais

Tasks de `Frontend`, `Backend` e `Database` só são criadas quando houver evidência
no escopo da PBI/Bug. Não criar tasks condicionais "por precaução".

### R3 — Story Points proibidos

Não usar Story Points. A estimativa de execução fica a cargo do desenvolvedor.

### R4 — Campos das tasks

- Tasks **condicionais** (FE/BE/DB): `Activity` preenchido e `WorkedTime = 0`; sem
  `OriginalEstimate`/`RemainingWork`.
- Tasks **fixas**: `OriginalEstimate` e `RemainingWork` conforme definição do fluxo.
- Nunca alterar campos da PBI/Bug pai (título, descrição, estado, iteração, prioridade).

### R5 — Database é uma única task

`Database — {scope}` é uma única task condicional. Nunca dividir em migration/seed
ou subtasks separadas.

### R6 — Guard-rails

- Verificar tasks filhas existentes antes de criar novas (evitar duplicidade).
- Não sobrescrever trabalho já em andamento.
- Registrar o racional no tracker, quando aplicável.

## Consequências

- Estrutura previsível e comparável entre sprints.
- Menos ruído de estimativa.
- Fluxos sem tracker podem ignorar este ADR.
