---
name: fix-bug
description: Corrigir bug com impacto mínimo e evidência de correção
---

# Fix Bug

## Objetivo
Corrigir um bug com impacto mínimo, reproduzindo antes e depois.

## Quando usar
- Bug reportado em produção
- Bug encontrado durante desenvolvimento
- Fluxo do processo do projeto (`/process`)

## Processo
1. **Reproduzir**: Entender o cenário que causa o bug
2. **Isolar causa raiz**: Identificar a linha/componente exato
3. **Criar teste de regressão**: Teste que reproduz o bug (se possível)
4. **Aplicar correção mínima**: Menor mudança possível
5. **Verificar**: Bug não reproduz após correção
6. **Validar regressão**: Testes existentes continuam passando
7. **Documentar**: Causa raiz em `knowledge/bugs/` se relevante

## Guardrails
- Mínimo impacto — sem refatoração paralela
- Rollback planejado (reversível)
- Bug reproduzido antes, não reproduz após
- Teste de regressão adicionado quando possível

## Agentes que usam
- `pedreiro` (bugs bem definidos)
- `backend-dev`, `frontend-dev` (complexos)
- `revisor` (se precisar de análise)
- `code-reviewer` (revisão de correções complexas)
- `tdd-guide` (se precisar de teste de regressão via TDD)
