# Image Pipeline

> **Status:** ativo
> **Implementação:** `src/workbench/mcp/image.py` + `src/workbench/vision.py`

## Componentes

| Componente | Path | Função |
|---|---|---|
| **Skill `image-pipeline`** | `.opencode/skills/image-pipeline/SKILL.md` | Salvar, validar, checar visão e analisar imagens |
| **MCP `mcp-image`** | `src/workbench/mcp/image.py` | Servidor JSON-RPC stdio com 4 tools |
| **`vision`** | `src/workbench/vision.py` | Magic header, SSRF, cache e detecção de erro de visão |
| **Agentes** | `image-analyzer`, `ux-analyzer` | Análise visual e UX |
| **Orquestrador** | `.opencode/agents/core/orquestrador.md` | Detecta imagem e delega |

## Tools

| Tool | Descrição |
|---|---|
| `image_save` | Salva path/URL no diretório temporário |
| `image_get_dir` | Retorna o diretório de imagens |
| `image_validate` | Valida formato e tamanho |
| `check_vision_error` | Detecta erro de visão no texto |

## Configuração

```json
"mcp-image": {
  "type": "local",
  "command": ["uv", "run", "--frozen", "python", "-m", "workbench.mcp.image"],
  "enabled": true
}
```

## Princípios

1. Orquestrador não conhece I/O de imagem; delega aos subagentes.
2. Skill é o pacote canônico do fluxo.
3. Falha de visão não bloqueia o batch.
4. Cache determinístico por source.
5. Apenas stdlib no core.
6. SSRF, size cap e sanitização de paths.
