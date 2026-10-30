# Agent Registry

> **Source of truth for all agents.** Generated from `agent-catalog.json`.
> `opencode.json` is the operational authority; this file is the derived documentation.
> Consulte `rules/decision-tree.md` para lógica de roteamento.

## Taxonomy

### Core (1)
| Agent | Category | File | Tier | When |
|-------|----------|------|------|------|
| orquestrador | orchestration | `agents/core/orquestrador.md` | 5 | Default agent, routing entry point |

### Development — Generic (6)
| Agent | Category | File | Tier | When |
|-------|----------|------|------|------|
| backend-dev | backend | `agents/development/backend-dev.md` | 3 | Generic API/services, any project |
| frontend-dev | frontend | `agents/development/frontend-dev.md` | 3 | Generic UI/screens, any project |
| database-dev | database | `agents/development/database-dev.md` | 3 | Generic migrations/queries, any project |
| perf-auditor | performance | `agents/development/perf-auditor.md` | 3 | React/DB/Redis/bundle perf audit |
| pedreiro | implementation | `agents/infrastructure/pedreiro.md` | 3 | Well-defined tasks, <2h, low risk |
| tdd-guide | testing | `agents/development/tdd-guide.md` | 2 | TDD Red-Green-Refactor, test-first |

### Project (1)
| Agent | Category | File | Tier | When |
|-------|----------|------|------|------|
| vault-updater | docs | `agents/project/vault-updater.md` | 2 | Update project vault |

### Review (6)
| Agent | Category | File | Tier | When |
|-------|----------|------|------|------|
| revisor | review | `agents/review/revisor.md` | 2 | Code review, architecture analysis, debugging |
| code-reviewer | review | `agents/review/code-reviewer.md` | 2 | Multi-language line-by-line code review |
| security-reviewer | review | `agents/review/security-reviewer.md` | 3 | OWASP Top 10, secrets, injection, auth |
| tech-architect | architecture | `agents/review/tech-architect.md` | 2 | ADRs, cross-layer impact, design decisions |
| tech-lead | tech lead | `agents/review/tech-lead.md` | 4 | Technical guidance, oversight, bridge |
| sec-arch | security | `agents/review/sec-arch.md` | 4 | Threat modeling STRIDE, privacy gate |

### Process (3)
| Agent | Category | File | Tier | When |
|-------|----------|------|------|------|
| scrum-master | process | `agents/process/scrum-master.md` | 2 | Process metrics, impediments, retrospectives |
| business-analyst | requirements | `agents/process/business-analyst.md` | 2 | Refine requirements, specs |
| product-manager | product | `agents/process/product-manager.md` | 2 | Vision, roadmap, prioritization |

### Infrastructure (3)
| Agent | Category | File | Tier | When |
|-------|----------|------|------|------|
| devops-engineer | infra | `agents/infrastructure/devops-engineer.md` | 2 | CI/CD, deploy, rollback |
| qa-engineer | testing | `agents/infrastructure/qa-engineer.md` | 2 | Test plans, cases, regression |
| general | general | `agents/infrastructure/general.md` | 2 | Multi-step research, fallback |

### Analysis (5)
| Agent | Category | File | Tier | When |
|-------|----------|------|------|------|
| explorador | discovery | `agents/analysis/explorador.md` | 2 | Codebase search, deep mapping |
| explore | discovery | `agents/analysis/explore.md` | 1 | Quick grep/glob, lightweight |
| image-analyzer | visual | `agents/analysis/image-analyzer.md` | 2 | UI screenshots → visual specs |
| ux-analyzer | UX | `agents/analysis/ux-analyzer.md` | 2 | Usability, heuristics, a11y |
| integracoes-power | integration | `agents/analysis/integracoes-power.md` | 4 | Third-party API integration analysis |

### Decision (4)
| Agent | Category | File | Tier | When |
|-------|----------|------|------|------|
| planner | planning | `agents/decision/planner.md` | 3 | Decompose features/refactors >2h |
| architect | architecture | `agents/decision/architect.md` | 4 | System design, ADRs, trade-offs |
| arbitro | decision | `agents/decision/arbitro.md` | 4 | Resolve conflicts, handle ambiguity |
| gestor-tokens | cost | `agents/decision/gestor-tokens.md` | 4 | Token budget, context engineering |

## Core Agents (uso frequente)
| Agent | Token Cost | Quando usar |
|-------|-----------|-------------|
| orquestrador | medium | Default, entry point |
| backend-dev | medium | API/services any project |
| frontend-dev | medium | UI any project |
| database-dev | medium | Migrations/schema any project |
| pedreiro | low | Tasks <2h bem definidas |
| revisor | low | Code review, debug |
| tech-architect | medium | Architecture decisions, ADRs |
| explorador | low | Codebase discovery |
| qa-engineer | medium | Test plans |
| devops-engineer | medium | CI/CD, deploy |
| gestor-tokens | low | Cost audit |
| arbitro | medium | Conflict resolution |

## Deprecated Agents (avoid)
| Agent | Reason | Replacement |
|-------|--------|-------------|
| general | Vago, sem especialização | Usar agente específico |

## Project-Specific Resolution
Consulte `<slug>.agents` no catálogo mesclado (`wb projects list`):
- Cada projeto declara os agentes compatíveis no catálogo.
- Vazio → usar os agentes genéricos do catalog (backend-dev, frontend-dev, database-dev).

> **Tiers**: 1=trivial, 2=baixo, 3=médio, 4=alto, 5=crítico. Usar tier mínimo adequado para economizar tokens.
