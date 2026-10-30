---
title: Project Context
type: memory
status: ativa
---

# Project Context

> Memória de contexto do workbench. Consulte `wb projects list` para a lista completa de projetos.

## Workbench (meta-projeto)
- **Propósito**: Infraestrutura de orquestração, agentes, skills, vault
- **Stack**: OpenCode engine + Node.js + markdown agents/skills
- **Estrutura**: `.opencode/` (engine) + `projects/` (contexto específico)
- **Flow**: branch from `main`, open PR to `main`

## Projetos
Cada projeto no catálogo mesclado mantém seu contexto em
`projects/<slug>/AGENTS.md` e `projects/<slug>/knowledge/`.
