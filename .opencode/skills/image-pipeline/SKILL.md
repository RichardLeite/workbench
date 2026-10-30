---
name: image-pipeline
description: "Complete image analysis pipeline: save/download via mcp-image (path or URL), validate, detect vision errors, read and analyze each image, and return { ok, analises, warnings }."
---

# Image Pipeline

Orquestra análise de imagens a partir de um path local ou URL.

## Inputs

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `source` | string | ✅ | Path absoluto ou URL (`https://...`) |
| `source_type` | `"path" \| "url"` | ❌ | Auto-detectado |
| `analysis_type` | `"visual_spec" \| "ux_audit"` | ❌ | Default: `visual_spec` |
| `target_artifact_type` | string | ❌ | `spec`, `feature`, `backlog`, `adr`, `bug` |

## Procedure

1. **Classificar fonte**
   - `https?://` → `url`
   - path existente → `path`
   - caso contrário → warning e abortar a imagem.
2. **Salvar via MCP**
   - `mcp-image__image_save({ source, value })`
   - Sucesso: `saved_path` (path/url) ou `saved_paths[]`.
3. **Validar cada imagem**
   - `mcp-image__image_validate({ path: saved_path })`
   - Se `ok: false`, registrar warning e continuar com as demais.
4. **Ler e checar visão**
   - Ler o arquivo salvo.
   - `mcp-image__check_vision_error({ text })`
   - Se `is_error: true`, pular a imagem com warning.
5. **Analisar**
   - `visual_spec`: layout, cores, componentes, hierarquia, estados.
   - `ux_audit`: heurísticas de Nielsen, acessibilidade WCAG, fricções.
6. **Consolidar**
   - Retornar `{ ok, analises: [{ id, source, filename, saved_path, analise }], warnings }`.

## IDs

| Source | ID |
|---|---|
| `path` | `path:<basename>` |
| `url` | `url:<sha256-prefix>` |

## Erros

| Código | Significado |
|---|---|
| `SOURCE_INVALID` | Fonte ausente/inválida |
| `SIZE_EXCEEDED` | Arquivo acima do limite (10 MB) |
| `SSRF_BLOCKED` | URL bloqueada por segurança |
| `FETCH_FAILED` | Falha HTTP/DNS/timeout |
| `MCP_UNAVAILABLE` | MCP indisponível |
| `VISION_UNSUPPORTED` | Modelo sem suporte a imagem |

## Formatos

Detectados por magic header: PNG, JPEG, WebP, GIF, AVIF. Formatos desconhecidos são
salvos como `application/octet-stream` e a análise visual decide se consegue ler.

## Segurança

- Apenas `http`/`https`.
- Bloqueio de IPs privados/reservados e redirects para destinos bloqueados.
- Limite de tamanho e timeout.
- Nenhum secret é logado.

## Vision error patterns

Os padrões ficam em `VISION_ERROR_PATTERNS` em `src/workbench/vision.py` e são
expostos pela tool `check_vision_error`.
