---
description: "Analisa diff de Pull Request antes do merge — corretude, segurança, convenções e completude."
---

# /pr-analyze

Análise de diff de PR como quality gate antes do merge.

## Parâmetros

| Parâmetro | Exemplo | Obrigatório |
|---|---|---|
| `PR_URL` ou `PR_NUMBER` | `https://github.com/<owner>/<repo>/pull/123` ou `123` | ✅ |
| `--repo` | `owner/repo` | ❌ Inferido via git |

## Fluxo

1. Obter o diff com `gh pr diff <number>` e metadados com `gh pr view`.
2. Identificar stack e convenções do projeto.
3. Analisar:
   - corretude e casos de borda;
   - segurança (secrets, injection, auth, PII);
   - performance;
   - testes e evidências;
   - aderência a `CONVENTIONS.md` e ao processo do projeto.
4. Classificar achados: 🔴 bloqueante, 🟡 atenção, 💡 sugestão.
5. Produzir relatório com arquivos/linhas e recomendações.
6. Nunca aprovar, solicitar mudanças ou mergear automaticamente.

## Agentes

- `code-reviewer` / `revisor` para revisão geral
- `security-reviewer` / `sec-arch` para segurança e privacidade
- `perf-auditor` para performance
- `tech-architect` para impacto arquitetural

## Regras

- Não altere o PR sem pedido explícito.
- Não use `--force` nem pule validações.
- Se o diff for grande, divida a análise por módulo.
