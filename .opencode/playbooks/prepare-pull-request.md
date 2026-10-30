---
name: prepare-pull-request
description: Preparar PR completo com template, contexto e validação
---

# Prepare Pull Request

## Objetivo
Preparar um Pull Request completo com template, contexto de task e validações.

## Quando usar
- Após implementar feature/bugfix em branch
- Antes de abrir PR (via `/git-pr`)

## Processo
1. **Verificar branch**: Base correta (main ou release)
2. **Verificar diff**: Apenas arquivos relevantes, sem debug/logs
3. **Template**: Preencher com o quê, por quê, como testar, riscos, evidências
4. **Issue link**: Referenciar issue (#123) quando aplicável
5. **Reviewer**: Solicitar revisão
6. **Validações**: Testes, lint, build passando

## Template
```markdown
## O que foi feito
[Descrição concisa]

## Por que foi feito
[Contexto, link da issue]

## Como testar
[Passos para reproduzir/testar]

## Riscos
[Lista de riscos identificados]

## Evidências
[Testes, screenshots, logs]
```

## Guardrails
- PR < 400 linhas (acima, quebrar em PRs menores)
- Review em prazo definido pelo processo
- Nunca fazer merge sem aprovação

## Agentes que usam
- `code-reviewer` (revisão de código no diff)
- `security-reviewer` (revisão de segurança no diff)
