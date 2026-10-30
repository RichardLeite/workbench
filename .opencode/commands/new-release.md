---
description: "Cria GitHub Release a partir de uma tag"
---

# /new-release

> Cria uma GitHub Release a partir de uma tag existente ou sugerida.

## Uso

```bash
uv run --frozen python -m workbench release --preview
uv run --frozen python -m workbench release --tag v1.2.3
uv run --frozen python -m workbench release --tag v1.2.3 --generate-notes
```

## Pré-requisitos

- `gh` CLI autenticado
- Working tree limpo
- Tag existente ou `--tag` informada

## Fluxo

1. Validar `git status` e autenticação do `gh`.
2. Detectar repositório via `git remote get-url origin` ou usar `--repo`.
3. Sugerir a próxima tag a partir da última tag (`vMAJOR.MINOR.PATCH`).
4. Gerar notas a partir dos commits ou usar `--notes-file` / `--generate-notes`.
5. Pré-visualizar com `--preview`.
6. Criar a release com `wb release --tag ...`.
7. Retornar a URL da release.

## Opções

| Opção | Descrição |
|---|---|
| `--tag` | Tag da release |
| `--repo` | Repositório `owner/repo` |
| `--notes-file` | Arquivo com notas |
| `--generate-notes` | Notas geradas pelo GitHub |
| `--target` | Branch/commit alvo |
| `--draft` | Criar como draft |
| `--prerelease` | Marcar como prerelease |
| `--preview` | Apenas mostrar as notas |

## Referências

- [`release.py`](../../src/workbench/commands/release.py)
- [`/git-pr`](git-pr.md)
- [`/process`](process.md)
