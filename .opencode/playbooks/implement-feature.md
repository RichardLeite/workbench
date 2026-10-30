---
name: implement-feature
description: Implementar uma feature com segurança — contexto, testes, documentação
---

# Implement Feature

## Objetivo
Implementar uma feature com segurança, garantindo contexto, testes e documentação.

## Quando usar
- Nova funcionalidade
- Melhoria significativa
- Nova integração
- Mudança que afeta múltiplos arquivos

## Processo
1. **Entender requisito**: Ler descrição e critérios de aceite
2. **Buscar contexto na memória**: Consultar `.opencode/knowledge/` + catálogo mesclado
3. **Identificar arquivos afetados**: Mapear tudo que precisa mudar
4. **Criar plano curto**: Lista de passos em ordem
5. **Implementar em passos pequenos**: Um arquivo por vez, testando cada passo
6. **Rodar validações**: Testes, lint, build (se existirem)
7. **Atualizar documentação**: Vault, specs, ADRs se necessário
8. **Registrar decisão**: Se houver impacto arquitetural, criar nota em `knowledge/features/`
9. **Produzir resumo final**: Arquivos alterados, testes feitos, riscos

## Guardrails
- Seguir CONVENTIONS.md
- Não alterar escopo sem aprovação
- Não refatorar áreas não relacionadas
- Não adicionar dependências sem justificativa

## Agentes que usam
- `backend-dev`, `frontend-dev`, `database-dev`, `pedreiro`
- `backend-dev`, `frontend-dev`, `database-dev` (Meu Projeto)
- `architect` (design review em features complexas)
- `planner` (criar plano de implementação)
- `tdd-guide` (para features com TDD obrigatório)
