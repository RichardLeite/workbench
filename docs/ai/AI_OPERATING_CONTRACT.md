# AI Operating Contract

> Regras não negociáveis para qualquer agente IA trabalhando neste repositório.

## Princípios

1. **Entenda antes de alterar** — Nunca modifique código sem entender o contexto completo.
2. **Faça mudanças pequenas** — Prefira commits pequenos a um commit gigante.
3. **Preserve comportamento existente** — Não quebre nada que funciona.
4. **Simplicidade acima de sofisticação** — A solução mais simples é a melhor.
5. **Não crie abstrações sem necessidade real** — YAGNI é lei.
6. **Não instale dependências sem justificar** — Cada dependência é um risco.
7. **Não altere arquitetura sem registrar decisão** — Toda mudança estrutural precisa de ADR.
8. **Não commite segredos** — Tokens, senhas, chaves, `.env` real nunca.
9. **Não ignore testes, build, lint ou typecheck** — Toda validação disponível deve passar.
10. **Não esconda incertezas** — Se não tem certeza, pergunte. Se é arriscado, avise.

## Antes de qualquer mudança

O agente DEVE:

1. **Ler a demanda** — Entender o que está sendo pedido.
2. **Consultar memória** — Buscar contexto, estado atual, riscos.
3. **Identificar arquivos afetados** — Mapear tudo que precisa mudar.
4. **Avaliar riscos** — Verificar riscos conhecidos e se a mudança introduz novos.
5. **Só então implementar** — Nunca implementar sem os passos anteriores.

## Depois de qualquer mudança

O agente DEVE:

1. **Rodar validações disponíveis** — Testes, lint, build.
2. **Atualizar documentação** — Se afeta API, arquitetura, setup.
3. **Atualizar memória** — Se o estado do projeto mudou.
4. **Registrar decisão** — Se houver impacto técnico relevante.
5. **Informar claramente**: o que foi feito, o que não foi feito, riscos restantes, próximos passos.

## Proibições

O agente NÃO PODE:

1. **Reescrever grandes partes sem necessidade.**
2. **Trocar stack sem aprovação explícita.**
3. **Criar arquitetura enterprise para problema simples.**
4. **Ignorar padrões existentes** (CONVENTIONS.md, project conventions).
5. **Remover testes** — a menos que explicitamente quebrados.
6. **Desativar validações** — lint, typecheck, testes.
7. **Comitar `.env` real ou qualquer arquivo com segredos.**
8. **Inventar regra de negócio** — toda regra deve vir de requisito documentado.
9. **Fazer mudanças destrutivas em banco sem plano de rollback.**
10. **Criar dependência circular.**
11. **Criar código morto.**
12. **Fazer push sem autorização.**
