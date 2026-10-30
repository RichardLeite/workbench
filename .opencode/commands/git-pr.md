---
description: "Branch + pull request genérico, sem tracker obrigatório"
---

# /git-pr

> Cria branch, commit e pull request para o projeto atual.

## Uso

```
/git-pr
/git-pr "descrição curta"
```

## Fluxo

1. Validar contexto e `git status`.
2. Confirmar que a branch atual não é protegida (`main`, `release`, `develop`).
3. Criar branch `type/descricao-kebab` a partir da base correta.
4. Implementar/commitar mudanças em commits atômicos.
5. Executar os gates definidos no processo do projeto.
6. Fazer push da branch.
7. Abrir PR com `gh pr create` usando o template de PR.
8. Retornar a URL do PR.

## Regras

- Nunca commitar direto em branch protegida.
- Nunca aprovar ou mergear PR.
- Nunca usar `--force` ou `--no-verify`.
- Nunca commitar secrets.
- Se houver conflito, reportar ao humano.

## Referências

- [`pr-template.md`](pr-template.md)
- [`/process.md`](process.md)
