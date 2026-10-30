---
name: database-change
description: Alteração segura de banco de dados — migrations, rollback, validação
---

# Database Change

## Objetivo
Alterar esquema ou dados do banco com segurança, rollback e sem downtime.

## Quando usar
- Nova migration (criar tabela, coluna, índice)
- Alterar schema (modificar coluna, adicionar constraint)
- Seed de dados
- Rollback de migration

## Processo
1. **Planejar mudança**: Migration `up` e `down` completas
2. **Revisar impacto**: Tabelas afetadas, dados existentes, dependências
3. **Criar migration**: Nome descritivo, one change per migration
4. **Testar up/down**: Rodar em ambiente de teste
5. **Validar dados**: Verificar integridade após migration
6. **Executar em produção** (com aprovação)

## Guardrails
- Toda migration DEVE ter `up` e `down`
- Nunca DROP sem confirmação explícita
- Migrations testadas up/down antes de aplicar
- Nomes em `snake_case`, tabelas no plural
- Timestamps: `created_at`, `updated_at`
- Soft delete: `deleted_at` (nullable)

## Agentes que usam
- `database-dev` (Meu Projeto MySQL)
- `database-dev` (genérico)
- `code-reviewer` (revisão de migrations complexas)
- `architect` (design review de mudanças estruturais)
