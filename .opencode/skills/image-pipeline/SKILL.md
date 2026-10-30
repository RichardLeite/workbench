---
name: image-pipeline
description: "Complete image analysis pipeline: download/save via mcp-image MCP (supports path/url/ado sources, saves any file and attempts vision analysis; unsupported formats are reported as warnings), with ADO mode auto-discovering all images of a work item), then read+analyze each image. Injected into vision subagents (image-analyzer, ux-analyzer). Returns { ok, analises: [{ id, source, filename, saved_path, analise }], warnings } per batch."
---

# Skill: image-pipeline

## Goal

Orquestra o pipeline completo de análise de imagens: classificação da fonte (path/url/ado), download e salvamento via MCP `mcp-image` (que salva qualquer arquivo e tenta análise visual — formatos não suportados são reportados como warnings), validação de cada imagem retornada, detecção de erros de visão por imagem (sem abortar o batch se uma falhar), leitura e análise visual conforme o tipo solicitado (`visual_spec` ou `ux_audit`), e consolidação do resultado em um array estruturado `analises[]` — uma entrada por imagem analisada — devolvido ao subagente que repassa ao orquestrador.

## When to use

A skill DEVE ser ativada quando o subagente (`image-analyzer` ou `ux-analyzer`) receber no prompt um dos seguintes:

- Um **path absoluto** de imagem local (ex: `/tmp/opencode/screenshot.png`)
- Uma **URL** de imagem (ex: `https://imgur.com/x.png`)
- Uma **referência AB#** do Azure DevOps (ex: `AB#12345`)

A ativação ocorre via **Skill tool** no subagente — o subagente reconhece o gatilho pela presença de imagem no input e carrega esta skill automaticamente.

## Inputs

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|:-----------:|-----------|
| `source` | `string` | ✅ | Path absoluto, URL (`https://...`), ou referência ADO (`AB#\d+`) |
| `source_type` | `"path" \| "url" \| "ado"` | ❌ | Auto-detectado se omitido (ver Procedure passo 1) |
| `analysis_type` | `"visual_spec" \| "ux_audit"` | ✅ | Tipo de análise a aplicar em cada imagem do batch |

### Auto-detect de `source_type`

Quando `source_type` é omitido, a skill INSTRUI o subagente a classificar automaticamente:

| Regex | `source_type` resultante |
|-------|--------------------------|
| `^AB#\d+` | `"ado"` |
| `^https?://` | `"url"` |
| Resto | `"path"` |

> **Nota:** formato deprecated `AB#<id>/attachment:<guid>` — o sufixo `/attachment:...` DEVE ser ignorado e a fonte normalizada para `AB#<id>` (com warning de deprecation).

## Procedure

A skill INSTRUI o subagente a executar os seguintes passos em ordem:

### Passo 1 — Auto-detect `source_type`

Se `source_type` foi omitido no input, INSTRUA o subagente a aplicar as regras de auto-detect (tabela acima) e a registrar a decisão em `warnings[]`:

```
"source_type auto-detected as '<tipo>' from '<heuristic>'"
```

Se `source_type` foi fornecido explicitamente mas contradiz a heurística (ex: `source: "AB#12345"` com `source_type: "path"`), INSTRUA o subagente a usar o valor explícito (precedência) e a registrar:

```
"source_type explicitly set to '<tipo>', ignored '<heuristic>' heuristic"
```

Se o `source` contém o sufixo deprecated `/attachment:<guid>`, INSTRUA o subagente a normalizar para `AB#<id>` e a registrar:

```
"attachment:guid suffix in source is deprecated, MCP discovers all images automatically"
```

### Passo 2 — Chamar `mcp-image__image_save`

INSTRUA o subagente a construir e executar a chamada `mcp-image__image_save({ source, value, options: {} })` conforme o `source_type` resolvido:

| `source_type` | `source` param | `value` param |
|:---:|:---:|:---|
| `"path"` | `"path"` | String do path absoluto (ex: `"/tmp/opencode/screenshot.png"`) |
| `"url"` | `"url"` | String da URL (ex: `"https://imgur.com/x.png"`) |
| `"ado"` | `"ado"` | Objeto `{ workItemId: <number> }` — parseado de `AB#<id>` via `parseInt()`. **SEM `attachmentId`** — o MCP descobre e baixa TODAS as imagens da work item automaticamente. |

### Passo 3 — Tratar retorno do MCP

INSTRUA o subagente a tratar o retorno do MCP conforme os seguintes casos:

- **`ok: false`** → retornar imediatamente `{ ok: false, code: <code>, warnings: <warnings>, analises: [] }`. Não prosseguir.
- **`ok: true` com `saved_path`** (singular — modos `path` e `url`, ou `ado` com `attachmentId`) → envolver em array de 1 elemento: `[saved_path]`.
- **`ok: true` com `saved_paths`** (array — modo `ado` sem `attachmentId`) → usar diretamente o array de N elementos.
- **MCP indisponível** (timeout, spawn falhou, exception) → retornar `{ ok: false, code: "MCP_UNAVAILABLE", warnings: ["mcp-image not reachable: <detalhe>"], analises: [] }`. Degradação controlada, **sem throw**.

### Passo 4 — Iterar sobre cada imagem

Para **cada imagem** no array resultante do passo 3 (1 iteração no modo singular, N iterações no modo plural), INSTRUA o subagente a:

#### 4a. Ler a imagem

Usar a `read` tool com `filePath: <saved_path>` para carregar a imagem no contexto.

#### 4b. Detectar erros de visão

Aplicar vision error detection ao resultado do `read`. INSTRUA o subagente a chamar `mcp-image__check_vision_error({ text: <conteúdo lido> })` ou, alternativamente, aplicar inline os 19 padrões `VISION_ERROR_PATTERNS` (documentados na seção [Vision error patterns](#vision-error-patterns) desta skill).

- Se `is_error: true` → **pular esta imagem**, adicionar warning `"vision error on <id>: <motivo>"` em `warnings[]`, e **continuar com a próxima imagem** do batch. **NÃO abortar o batch.**
- Se `is_error: false` → prosseguir para o passo 4c.

#### 4c. Analisar conforme `analysis_type`

INSTRUA o subagente a analisar a imagem conforme o `analysis_type` recebido:

- **`analysis_type: "visual_spec"`** → extrair `layout`, `cores`, `componentes`, `ordem_visual`:
  ```json
  {
    "tipo": "analise_imagem",
    "layout": { "estrutura": "...", "regioes": [...] },
    "cores": { "primarias": [...], "secundarias": [...], "background": "..." },
    "componentes": [{ "tipo": "...", "posicao": "...", "descricao": "..." }],
    "ordem_visual": { "ordem_leitura": [...], "hierarquia": "..." }
  }
  ```

- **`analysis_type: "ux_audit"`** → extrair avaliação heurística de Nielsen:
  ```json
  {
    "tipo": "ux_audit",
    "heuristicas_nielsen": [{ "heuristica": "...", "avaliacao": "ok|warning|violation", "comentario": "..." }],
    "problemas": [{ "severidade": "alta|media|baixa", "descricao": "...", "localizacao": "..." }],
    "sugestoes": ["..."]
  }
  ```

- **`analysis_type` desconhecido** (ex: `"foo"`, `"both"`) → adicionar warning `"unknown analysis_type: '<valor>', defaulting to visual_spec"` e prosseguir com `visual_spec`. Paralelismo (`ambos`/`paralelo`) é responsabilidade do orquestrador, não da skill.

#### 4d. Construir `id` discriminado por `source`

INSTRUA o subagente a construir o `id` de cada entrada conforme a origem:

| `source` | Formato do `id` | Exemplo |
|:---:|:---|:---|
| `"ado"` | `"attachment:<attachmentId>"` | `"attachment:2d573575-2eb5-4e81-afdd-05de0d2c72cd"` |
| `"path"` | `"file:<basename(path)>"` | `"file:screenshot.png"` |
| `"url"` | `"url:<url>"` | `"url:https://imgur.com/x.png"` |

> Para ADO, extrair o `attachmentId` do `saved_path` retornado pelo MCP (formato `vision-<attachmentId>.<ext>`) ou do campo `name`/`filename` retornado. Se não for possível, usar o `filename` como fallback.

#### 4e. Montar entrada de análise

Cada imagem processada com sucesso gera uma entrada:

```json
{
  "id": "<id discriminado>",
  "source": "<path|url|ado>",
  "filename": "<nome do arquivo>",
  "saved_path": "<path local temporário>",
  "analise": { ... }
}
```

Adicionar a entrada ao array `analises[]`.

### Passo 5 — Consolidar `analises[]`

INSTRUA o subagente a consolidar todas as entradas geradas no passo 4 no array `analises[]`. Se todas as imagens falharam no vision check, `analises` será `[]` (com `ok: true` e `warnings` documentando cada falha).

### Passo 6 — Retornar resultado

INSTRUA o subagente a devolver ao orquestrador:

```json
{
  "ok": true,
  "analises": [...],
  "warnings": [...]
}
```

`warnings` SHALL ser sempre um array (mesmo vazio em sucesso puro). `analises` SHALL ser sempre um array.

## Output contract

### Sucesso (1+ análises)

```json
{
  "ok": true,
  "analises": [
    {
      "id": "attachment:2d573575-2eb5-4e81-afdd-05de0d2c72cd",
      "source": "ado",
      "filename": "screenshot.png",
      "saved_path": "/tmp/opencode/vision-2d573575.png",
      "analise": {
        "tipo": "analise_imagem",
        "layout": { "estrutura": "...", "regioes": [] },
        "cores": { "primarias": [], "secundarias": [], "background": "..." },
        "componentes": [],
        "ordem_visual": { "ordem_leitura": [], "hierarquia": "..." }
      }
    }
  ],
  "warnings": []
}
```

### Sucesso sem análises (batch 100% falhou em vision check)

```json
{
  "ok": true,
  "analises": [],
  "warnings": [
    "vision error on attachment:abc-123: cannot process this image",
    "vision error on attachment:def-456: no image vision capability"
  ]
}
```

### Falha

```json
{
  "ok": false,
  "code": "MCP_UNAVAILABLE",
  "warnings": ["mcp-image not reachable: spawn ENOENT"],
  "analises": []
}
```

## Error codes

| Código | Descrição | Quando ocorre |
|--------|-----------|---------------|
| `MCP_UNAVAILABLE` | MCP `mcp-image` não está acessível | Timeout, spawn falhou, processo não rodando, exception na comunicação |
| `SOURCE_INVALID` | Input `source` inválido ou vazio | `source` ausente, vazio, ou formato não reconhecido |
| `FETCH_FAILED` | Falha ao baixar imagem (URL ou ADO) | HTTP error, DNS failure, timeout de rede |
| `SSRF_BLOCKED` | URL bloqueada por política de segurança | URL aponta para localhost, rede privada, ou endereço não permitido |
| `SIZE_EXCEEDED` | Imagem excede limite de tamanho | Arquivo maior que `DEFAULT_MAX_IMAGE_BYTES` |


## Examples

### Exemplo 1 — Path local com PNG válido (1 imagem)

**Input:**
```json
{
  "source": "/tmp/opencode/sample.png",
  "source_type": "path",
  "analysis_type": "visual_spec"
}
```

**Fluxo:**
1. `source_type` já fornecido → sem auto-detect, sem warning.
2. Chama `mcp-image__image_save({ source: "path", value: "/tmp/opencode/sample.png" })`.
3. MCP retorna `{ ok: true, saved_path: "/tmp/opencode/vision-abc123.png" }`.
4. `read` tool carrega a imagem → vision check passa (`is_error: false`).
5. Análise `visual_spec` → extrai layout, cores, componentes, ordem_visual.
6. Monta entrada: `{ id: "file:sample.png", source: "path", filename: "sample.png", saved_path: "/tmp/opencode/vision-abc123.png", analise: {...} }`.

**Output:**
```json
{
  "ok": true,
  "analises": [
    {
      "id": "file:sample.png",
      "source": "path",
      "filename": "sample.png",
      "saved_path": "/tmp/opencode/vision-abc123.png",
      "analise": { "tipo": "analise_imagem", "layout": {...}, "cores": {...}, "componentes": [...], "ordem_visual": {...} }
    }
  ],
  "warnings": []
}
```

### Exemplo 2 — URL com JPEG (1 imagem)

**Input:**
```json
{
  "source": "https://imgur.com/x.png",
  "analysis_type": "ux_audit"
}
```

**Fluxo:**
1. `source_type` omitido → auto-detect: `^https?://` → `"url"`. Warning: `"source_type auto-detected as 'url' from '^https?://' pattern"`.
2. Chama `mcp-image__image_save({ source: "url", value: "https://imgur.com/x.png" })`.
3. MCP retorna `{ ok: true, saved_path: "/tmp/opencode/vision-def456.png" }`.
4. `read` → vision check passa → análise `ux_audit` → extrai heurísticas de Nielsen, problemas, sugestões.
5. Monta entrada: `{ id: "url:https://imgur.com/x.png", source: "url", ... }`.

**Output:**
```json
{
  "ok": true,
  "analises": [
    {
      "id": "url:https://imgur.com/x.png",
      "source": "url",
      "filename": "x.png",
      "saved_path": "/tmp/opencode/vision-def456.png",
      "analise": { "tipo": "ux_audit", "heuristicas_nielsen": [...], "problemas": [...], "sugestoes": [...] }
    }
  ],
  "warnings": ["source_type auto-detected as 'url' from '^https?://' pattern"]
}
```

### Exemplo 3 — ADO com 1 imagem (attachmentId específico)

**Input:**
```json
{
  "source": "AB#12345",
  "source_type": "ado",
  "analysis_type": "visual_spec"
}
```

**Fluxo:**
1. `source_type` já fornecido → sem auto-detect.
2. Chama `mcp-image__image_save({ source: "ado", value: { workItemId: 12345 } })` — **SEM `attachmentId`**.
3. MCP descobre 1 attachment de imagem → retorna `{ ok: true, saved_path: "/tmp/opencode/vision-2d573575.png" }`.
4. `read` → vision check passa → análise `visual_spec`.
5. Monta entrada: `{ id: "attachment:2d573575-2eb5-4e81-afdd-05de0d2c72cd", source: "ado", ... }`.

**Output:**
```json
{
  "ok": true,
  "analises": [
    {
      "id": "attachment:2d573575-2eb5-4e81-afdd-05de0d2c72cd",
      "source": "ado",
      "filename": "screenshot.png",
      "saved_path": "/tmp/opencode/vision-2d573575.png",
      "analise": { "tipo": "analise_imagem", "layout": {...}, "cores": {...}, "componentes": [...], "ordem_visual": {...} }
    }
  ],
  "warnings": []
}
```

### Exemplo 4 — ADO sem attachmentId (múltiplas imagens)

**Input:**
```json
{
  "source": "AB#67890",
  "analysis_type": "visual_spec"
}
```

**Fluxo:**
1. `source_type` omitido → auto-detect: `^AB#\d+` → `"ado"`. Warning: `"source_type auto-detected as 'ado' from 'AB#' prefix"`.
2. Chama `mcp-image__image_save({ source: "ado", value: { workItemId: 67890 } })` — **SEM `attachmentId`**.
3. MCP descobre 2 attachments de imagem → retorna `{ ok: true, saved_paths: ["/tmp/opencode/vision-aaa.png", "/tmp/opencode/vision-bbb.png"], count: 2 }`.
4. Itera sobre as 2 imagens:
   - Imagem 1: `read` → vision check passa → análise `visual_spec` → `{ id: "attachment:aaa-111", ... }`.
   - Imagem 2: `read` → vision check passa → análise `visual_spec` → `{ id: "attachment:bbb-222", ... }`.
5. Consolida `analises[]` com 2 entradas.

**Output:**
```json
{
  "ok": true,
  "analises": [
    {
      "id": "attachment:aaa-111",
      "source": "ado",
      "filename": "screenshot-flow.png",
      "saved_path": "/tmp/opencode/vision-aaa.png",
      "analise": { "tipo": "analise_imagem", "layout": {...}, "cores": {...}, "componentes": [...], "ordem_visual": {...} }
    },
    {
      "id": "attachment:bbb-222",
      "source": "ado",
      "filename": "screenshot-detail.png",
      "saved_path": "/tmp/opencode/vision-bbb.png",
      "analise": { "tipo": "analise_imagem", "layout": {...}, "cores": {...}, "componentes": [...], "ordem_visual": {...} }
    }
  ],
  "warnings": ["source_type auto-detected as 'ado' from 'AB#' prefix"]
}
```

### Exemplo 5 — Falha (MCP indisponível)

**Input:**
```json
{
  "source": "/tmp/opencode/sample.png",
  "source_type": "path",
  "analysis_type": "visual_spec"
}
```

**Fluxo:**
1. `source_type` já fornecido.
2. Tenta chamar `mcp-image__image_save` → MCP não responde (timeout/spawn falhou).
3. Retorna degradação controlada, sem throw.

**Output:**
```json
{
  "ok": false,
  "code": "MCP_UNAVAILABLE",
  "warnings": ["mcp-image not reachable: spawn ENOENT"],
  "analises": []
}
```

## Vision error patterns

A skill referencia os **19 padrões regex** de detecção de erro de visão definidos em `VISION_ERROR_PATTERNS` no arquivo `scripts/vision-utils.js`. Estes padrões são aplicados (case-insensitive) ao texto retornado pelo `read` tool após carregar a imagem. Se qualquer padrão der match, a imagem é pulada com warning — o batch continua.

| # | Padrão regex | Descrição |
|:-:|:---|:---|
| 1 | `/model does not support (image\|vision)/i` | Modelo não suporta imagem/visão |
| 2 | `/cannot (process\|analyze\|view\|see) (image\|this)/i` | Não consegue processar/analisar/ver |
| 3 | `/unable to (process\|analyze) (image\|this)/i` | Incapaz de processar/analisar |
| 4 | `/i can('?t\|no't) see images?/i` | "Não consigo ver imagens" |
| 5 | `/no (image )?vision (capability\|support)/i` | Sem capacidade/suporte de visão |
| 6 | `/image (analysis\|processing) (unavailable\|not supported)/i` | Análise de imagem indisponível |
| 7 | `/unsupported (content type\|media type): image/i` | Tipo de conteúdo/mídia não suportado |
| 8 | `/vision[- ]?capable (model\|required)/i` | Modelo com visão necessário |
| 9 | `/please provide (a \|the )?(text\|description)/i` | Pede texto em vez de imagem |
| 10 | `/i('?\| do not\| don't) have (access to )?(image\|vision)/i` | Sem acesso a imagem/visão |
| 11 | `/multimodal (capability\|model) (required\|needed)/i` | Capacidade multimodal necessária |
| 12 | `/image input (was\|is) (not\|never) (provided\|supported)/i` | Input de imagem não fornecido/suportado |
| 13 | `/failed to (decode\|load\|read) image/i` | Falha ao decodificar/carregar/ler imagem |
| 14 | `/content policy (rejected\|blocked): image/i` | Política de conteúdo bloqueou imagem |
| 15 | `/no image attachment (found\|provided)/i` | Nenhum attachment de imagem encontrado |
| 16 | `/this (model\|version) (cannot\|doesn't) (handle\|support) image/i` | Modelo/versão não suporta imagem |
| 17 | `/image url (is\|was) (inaccessible\|blocked\|invalid)/i` | URL da imagem inacessível/bloqueada/inválida |
| 18 | `/cannot read (binary\|image) file/i` | Read tool recusou arquivo binário (formato não suportado) |
| 19 | `/unsupported (image )?format/i` | Formato de imagem não suportado |

> **Source único:** `scripts/vision-utils.js` exporta `VISION_ERROR_PATTERNS` como array de RegExp. O MCP `mcp-image` expõe a tool `check_vision_error` que usa internamente `detectVisionError()` (que itera sobre `VISION_ERROR_PATTERNS`). A skill pode usar tanto a tool MCP quanto a lista inline — o resultado é equivalente.
