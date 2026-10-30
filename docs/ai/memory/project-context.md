---
title: Project Context
type: memory
status: ativa
---

# Project Context

> Memória de contexto do workbench. Consulte `project-mapping.json` para a lista completa de projetos.

## Workbench (meta-projeto)
- **Propósito**: Infraestrutura de orquestração, agentes, skills, vault
- **Stack**: OpenCode engine + Node.js + markdown agents/skills
- **Estrutura**: `.opencode/` (engine) + `projects/` (contexto específico)
- **Flow**: branch from `main`, open PR to `main`

## Projetos
Cada projeto registrado em `project-mapping.json` mantém seu contexto em
`projects/<slug>/AGENTS.md` e `projects/<slug>/knowledge/`.
