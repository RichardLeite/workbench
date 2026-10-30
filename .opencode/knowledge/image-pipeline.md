# Image Pipeline Architecture

> **Criado em:** 2026-07-07
> **Spec:** [Image Pipeline Skill](specs/spec-image-pipeline-skill.md)
> **Skill:** `../skills/image-pipeline/SKILL.md`
> **TASK:** WORKBENCH-IMAGEPIPE
> **Status:** Implantado

## Visão Geral

Pipeline completo de análise de imagens no workbench. Permite que agentes de IA
analisem screenshots, wireframes e mockups de 3 fontes: **path local**, **URL**,
ou **Azure DevOps** (auto-descoberta de todas as imagens de uma work item).

Arquitetura em 3 camadas com desacoplamento total:

```
Orquestrador (orquestrador.md)
  └── delega com { source, source_type, analysis_type }
       └── Subagente (image-analyzer | ux-analyzer)
            └── ativa skill image-pipeline via Skill tool
                 └── chama MCP mcp-image via JSON-RPC
                      └── I/O com fs, HTTP, ADO REST API
```

## Componentes

| Componente | Path | Função |
|-----------|------|--------|
| **Skill `image-pipeline`** | `.opencode/skills/image-pipeline/SKILL.md` | Pacote canônico: auto-detect source, chamar MCP, iterar imagens, vision check, analisar conforme `analysis_type`, consolidar `analises[]` |
| **MCP `mcp-image`** | `scripts/mcp-image.js` | Servidor JSON-RPC stdio — 4 tools: `image_save`, `image_get_dir`, `image_validate`, `check_vision_error` |
| **`vision-utils.js`** | `scripts/vision-utils.js` | Lib zero-deps (Node stdlib): magic header validation, SSRF block, ADO download, cache, vision error detection |
| **Subagente `image-analyzer`** | `.opencode/agents/analysis/image-analyzer.md` | Executa skill com `analysis_type: "visual_spec"` |
| **Subagente `ux-analyzer`** | `.opencode/agents/analysis/ux-analyzer.md` | Executa skill com `analysis_type: "ux_audit"` |
| **Orquestrador** | `.opencode/agents/core/orquestrador.md` — seção `## IMAGE HANDLING` | Detecta imagem no input, decide subagente, delega, injeta resultado no artefato |

## Fluxo de Dados

```
Input (path | URL | AB#)
  │
  ▼
Orquestrador
  ├── Detecta AB# → consulta ADO (gate: há imagem?)
  ├── Detecta URL/path → direto (auto-evidente)
  ├── Decide subagente por keyword (visual_spec | ux_audit | ambos)
  └── Delega { source, source_type, analysis_type }
        │
        ▼
  Subagente
  └── Ativa skill image-pipeline via Skill tool
        │
        ▼
  Skill image-pipeline
  ├── Passo 1: Auto-detect source_type (se omitido)
  ├── Passo 2: Chama mcp-image__image_save
  │   ├── path → cópia local
  │   ├── url → download + SSRF check + cache
  │   └── ado → listImageAttachments + download N imagens
  ├── Passo 3: Trata retorno (singular saved_path | plural saved_paths[])
  ├── Passo 4: Para cada imagem
  │   ├── 4a: read tool → carrega no contexto
  │   ├── 4b: Vision error detection (19 patterns) → pula se erro
  │   └── 4c: Analisa conforme analysis_type
  │       ├── visual_spec → { layout, cores, componentes, ordem_visual }
  │       └── ux_audit → { heuristicas_nielsen, problemas, sugestoes }
  └── Passo 5-6: Consolida analises[] → retorna ao subagente
        │
        ▼
  Orquestrador
  └── Injeta analises[] no artefato destino
      ├── 0 análises → não cria seção (warnings no output)
      ├── 1 análise → seção direta
      └── N análises → subseções numeradas
```

## Contratos

### Entrada da skill (recebido do subagente)

```json
{
  "source": "/abs/path/img.png" | "https://..." | "AB#12345",
  "source_type": "path" | "url" | "ado",
  "analysis_type": "visual_spec" | "ux_audit"
}
```

`source_type` é opcional — auto-detectado por prefixo: `AB#\d+` → `ado`,
`^https?://` → `url`, resto → `path`.

### Saída da skill (devolvido ao subagente → orquestrador)

**Sucesso (1+ análises):**
```json
{
  "ok": true,
  "analises": [
    {
      "id": "attachment:<guid>" | "file:<basename>" | "url:<url>",
      "source": "path" | "url" | "ado",
      "filename": "nome.xxx",
      "saved_path": "/tmp/opencode/vision-<key>.<ext>",
      "analise": { "tipo": "analise_imagem" | "ux_audit", ... }
    }
  ],
  "warnings": []
}
```

**Sucesso sem análises (vision check falhou em todas):**
```json
{ "ok": true, "analises": [], "warnings": ["vision error on ..."] }
```

**Falha (I/O, SSRF, size):**
```json
{ "ok": false, "code": "MCP_UNAVAILABLE" | "SOURCE_INVALID" | "FETCH_FAILED" | "SSRF_BLOCKED" | "SIZE_EXCEEDED", "warnings": [...], "analises": [] }
```

### Error codes

| Código | Causa |
|--------|-------|
| `MCP_UNAVAILABLE` | MCP `mcp-image` não acessível (spawn, timeout, exception) |
| `SOURCE_INVALID` | Input inválido ou vazio |
| `FETCH_FAILED` | Falha de download (HTTP, DNS, ADO) |
| `SSRF_BLOCKED` | URL bloqueada (localhost, rede privada, link-local) |
| `SIZE_EXCEEDED` | Arquivo > 10 MB (configurável via `options.maxBytes`) |

## Tools do MCP mcp-image

| Tool | Input | Output |
|------|-------|--------|
| `image_save` | `{ source: "path"\|"url"\|"ado", value: string\|object, options?: { maxBytes?, timeoutMs? } }` | `{ ok, saved_path\|saved_paths[], mime, size_bytes, cached\|cached_count, warnings }` |
| `image_get_dir` | `{}` | `{ ok, dir, platform }` |
| `image_validate` | `{ path }` | `{ ok, mime, size_bytes }` ou `{ ok, false, code }` |
| `check_vision_error` | `{ text }` | `{ is_error, matched_patterns[] }` |

### `image_save` — modes por `source`

| source | value | Comportamento |
|--------|-------|---------------|
| `"path"` | string (caminho absoluto) | `fs.existsSync` + valida + copia para `/tmp/opencode/` |
| `"url"` | string (URL) | SSRF check + cache lookup + GET HTTP + valida + salva |
| `"ado"` | `{ workItemId }` | Lista todas as imagens da work item → baixa N → retorna `saved_paths[]` |
| `"ado"` | `{ workItemId, attachmentId }` | Modo singular (back-compat) — baixa 1 attachment específico |

## Cache Local

Path: `/tmp/opencode/vision-<key>.<ext>`

| Source | Chave | Exemplo |
|--------|-------|---------|
| ADO | `attachmentId` (imutável) | `/tmp/opencode/vision-2d573575-2eb5-4e81-afdd-05de0d2c72cd.png` |
| URL | `sha256(url).slice(0, 8)` | `/tmp/opencode/vision-a1b2c3d4.jpg` |
| Path | basename sanitizado | `/tmp/opencode/vision-screenshot.png` |

Cache é volátil (legado a `/tmp/`), limpo no reboot. Validação obrigatória
antes do reuso (magic bytes + size cap).

## Fontes de Imagem ADO (3 combinadas)

O MCP descobre imagens de work items combinando **3 fontes** com deduplicação
por `attachmentId`:

1. **`AttachedFile` relations** — uploads explícitos (`source: "attached_file"`)
2. **Inline em `System.Description` e `AcceptanceCriteria`** — HTML `<img>` + Markdown `![alt](...)` (`source: "field_html"`/`"field_markdown"`)
3. **Inline em comments** — mesmo parser nos comments da work item (`source: "comment_html"`/`"comment_markdown"`, com `commentId`)

Comments são best-effort: se a API falhar (403, WI sem comments), retorna `[]`
sem abortar o batch.

## Formatos Suportados (Magic Header)

| Formato | Magic Bytes | MIME |
|---------|------------|------|
| PNG | `89 50 4E 47 0D 0A 1A 0A` | `image/png` |
| JPEG | `FF D8 FF` | `image/jpeg` |
| WebP | `RIFF .... WEBP` | `image/webp` |
| GIF | `GIF87a` / `GIF89a` | `image/gif` |
| AVIF | `.... ftyp avif` | `image/avif` |
| Desconhecido | — | `application/octet-stream` (não bloqueado) |

## SSRF Guards

Bloqueia URLs que resolvem para:
- `127.0.0.0/8` (loopback)
- `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16` (private)
- `169.254.0.0/16` (link-local / metadata services)
- `::1/128`, `fc00::/7`, `fe80::/10`, `ff00::/8` (IPv6)

`isSafeUrlAsync` com `dns.lookup` antes da checagem (impede bypass por hostname).
Protocolos não-HTTP (`file:`, `data:`, `ftp:`) são bloqueados.

## Configuração

Registro em `opencode.json`:

```json
"mcp-image": {
  "type": "local",
  "command": ["node", "scripts/mcp-image.js"],
  "enabled": true
}
```

**Permissões:** `mcp-image__image_save | mcp-image__image_get_dir | mcp-image__image_validate | mcp-image__check_vision_error` apenas nos subagentes `image-analyzer` e `ux-analyzer`. **Zero permissões no orquestrador.**

## Princípios de Design

1. **Desacoplamento total:** orquestrador não conhece MCP, não tem permissões `mcp-image__*`, não sabe de paths
2. **Skill é o pacote canônico:** I/O + análise + vision detection vivem na skill, não nos subagentes
3. **Não-bloqueante:** visão falha → pipeline segue com warnings. Uma imagem falha → batch continua com as demais
4. **Cache determinístico:** mesmo source → mesmo path → cache hit idempotente
5. **Zero dependências externas:** `vision-utils.js` usa apenas Node stdlib
6. **Segurança por design:** SSRF check, size cap, sanitização de paths, secrets nunca logados

## Artefatos Relacionados

- [Spec completa](specs/spec-image-pipeline-skill.md) — requisitos detalhados, TDD, implementação (1005 linhas)
- [Skill image-pipeline](../skills/image-pipeline/SKILL.md) — documentação injetada nos subagentes
- [Orquestrador — IMAGE HANDLING](../agents/core/orquestrador.md) — seção de detecção, delegação e injeção
- [image-analyzer](../agents/analysis/image-analyzer.md) — subagente de análise visual (visual_spec)
- [ux-analyzer](../agents/analysis/ux-analyzer.md) — subagente de auditoria UX (ux_audit)
- [vision-utils.js](../../scripts/vision-utils.js) — utilitário cross-platform
- [mcp-image.js](../../scripts/mcp-image.js) — servidor MCP JSON-RPC
