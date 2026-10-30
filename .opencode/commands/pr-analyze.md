---
---
description: Analisa diff de Pull Request antes do merge — checklist de corretude, segurança, convenções e completude. Usado como quality gate pré-PR.
---

# /pr-analyze

Análise completa de diff de Pull Request como **quality gate** antes da abertura do PR. Fornece relatório estruturado com categorização 🔴/🟡/💡 e opção de notificação Teams.

## Parâmetros

| Parâmetro | Exemplo | Obrigatório |
|---|---|---|
| `PR_URL` ou `PR_NUMBER` (primeiro argumento) | `https://github.com/<owner>/<repo>/pull/123` ou `123` | ✅ Sim |
| `--repo` | nome do repositório ou alias definido em `project-mapping.json` | ❌ Inferido da URL ou git context |

**Repo mapping:** resolvido dinamicamente via `.opencode/config/project-mapping.json`.
Use o nome do repositório (ou o alias do projeto) e o `owner` de `GITHUB_OWNER`.

**Knowledge docs:** o campo `knowledge` do projeto em `project-mapping.json`
aponta para a base de conhecimento. Leia apenas os arquivos que existirem.

---

## Fluxo de Execução

### STEP 1 — Extrair identificador e repo

Extrair o identificador do PR do primeiro argumento:
- Se for URL (`https://github.com/OWNER/REPO/pull/NUMBER`): extrair `OWNER/REPO` e `NUMBER`
- Se for número simples: usar como `NUMBER`; inferir o repo via `basename "$(git rev-parse --show-toplevel 2>/dev/null)"` e mapear para `OWNER/REPO` usando `GITHUB_OWNER` como owner. Exemplo: diretório `meu-projeto-api` → `$GITHUB_OWNER/meu-projeto-api`

Inferir `--repo` se não fornecido:
- Da URL: mapear da tabela de repo mapping
- Do diretório: `basename "$(git rev-parse --show-toplevel 2>/dev/null)"`
- Se não conseguir inferir: perguntar ao usuário qual repositório.

### STEP 2 — Buscar diff e verificar status (MCP First / gh CLI Fallback)

**Tentar GitHub MCP primeiro:**

Se houver ferramentas `github_*` disponíveis (ex: `github_pull_request_read`), seguir esta ordem:

1. Chamar `github_pull_request_read` (method: `get`) para obter status e metadados do PR (incluindo `additions`, `deletions`, `files`, `headRefName` quando disponíveis)
2. **Verificar status imediatamente:** se `state` for `merged` ou `closed`, exibir e encerrar:
   ```
   ⚠️ PR #[NUMBER] está [merged/closed]. Análise cancelada.
   ```
3. Armazenar metadados (`additions`, `deletions`, `files` (array)) e `headRefName` para uso no STEP 5 e STEP 6
4. Somente se status for `open`: chamar `github_pull_request_read` (method: `get_diff`) para obter o diff

**Fallback gh CLI (se MCP falhar ou retornar vazio):**

```bash
# Verificar status + metadados (inclui diff stats para STEP 5/6)
gh pr view [NUMBER] --repo [OWNER/REPO] --json state,title,number,additions,deletions,files,author,headRefName,baseRefName

# Buscar diff
gh pr diff [NUMBER] --repo [OWNER/REPO]
```

Aplicar mesma verificação de status após gh CLI.

**Guardar metadados para STEP 5 e STEP 6:**
Após obter os dados do PR (via MCP ou gh CLI), armazenar `additions`, `deletions`, `files` (array) e `headRefName` para uso no relatório e na notificação do Teams. Se não disponíveis (falha na consulta), os placeholders de diff stats são omitidos.

**Se ambos falharem:** exibir "❌ Não consegui acessar o PR. Informe a URL completa ou o número:" e aguardar a resposta do usuário.

**Se diff tiver mais de 500 linhas:**
```
⚠️ O diff tem [N] linhas. Analisar um diff grande pode demorar e perder foco.

Deseja:
1. Continuar com a análise completa
2. Informar arquivos específicos para focar (ex: src/controllers/user.js)
3. Cancelar
```
- Se opção 2: pedir os caminhos dos arquivos e filtrar o diff para incluir apenas esses arquivos
- Se opção 3: encerrar com "❌ Análise cancelada pelo usuário."

### STEP 3 — Carregar knowledge docs

Ler os arquivos do mapeamento correspondente ao repo identificado. O base path é resolvido de `.opencode/config/project-mapping.json` (campo `knowledge` do projeto).

- Se um arquivo do mapeamento não existir no path: ignorar silenciosamente e continuar
- Para WORKBENCH: usar `.opencode/` como base path
- Para projetos sem knowledge configurado: prosseguir apenas com as regras de CONVENTIONS.md e AGENTS.md
- Montar contexto interno:

```
Este PR pertence ao repositório [REPO_NOME] ([OWNER/REPO]).

=== PADRÕES E REGRAS DO PROJETO ===
[conteúdo concatenado dos docs carregados]
=== FIM DAS REGRAS ===
```

### STEP 4 — Analisar diff

Com o contexto dos docs carregados, analisar o diff do PR buscando:

**Critérios de categorização:**

| Categoria | Critério |
|---|---|
| 🔴 **CRÍTICO** | Viola regra explícita nos docs (ex: segurança, arquitetura proibida, branching policy) |
| 🟡 **ATENÇÃO** | Prática questionável ou inconsistente com padrão documentado |
| 💡 **SUGESTÃO** | Melhoria de qualidade que não configura violação de regra |

Para cada achado, registrar:
- Categoria
- Tag de área: `[Segurança]`, `[Arquitetura]`, `[Qualidade]`, `[Performance]`, `[Banco]`, `[Frontend]`, `[Policy]`, etc.
- Descrição objetiva do problema
- Referência ao doc de origem quando aplicável (ex: `Ver: 02-backend.md#layers`)
- Localização no diff quando identificável (ex: `UserController.js:42`)

### STEP 5 — Exibir relatório no chat

Exibir o relatório como resposta de texto puro no chat (NÃO via tool `question`):

```
📋 ANÁLISE DO PR #[NUMBER] — [REPO_NOME]

📦 [FILES_COUNT] arquivo(s) | +[ADDITIONS] / -[DELETIONS] linhas

🔴 CRÍTICO ([N])
  • [Tag] Descrição do problema em Arquivo.js:linha
    → Explicação. Ver: doc.md#secao

🟡 ATENÇÃO ([N])
  • [Tag] Descrição
    → Explicação. Ver: doc.md#secao

💡 SUGESTÃO ([N])
  • [Tag] Descrição
    → Explicação.

✅ Nenhum problema na política de branching/PR.
```

**Regras de exibição:**
- A linha `📦 [FILES_COUNT] arquivo(s) | +[ADDITIONS] / -[DELETIONS] linhas` é opcional. Deve ser exibida apenas se os dados foram obtidos com sucesso no STEP 2 via `gh pr view --json additions,deletions,files`. Se não disponíveis, omitir a linha completamente
- Omitir seções com zero achados (ex: se não há CRÍTICOs, não exibir a seção 🔴)
- A linha `✅ Nenhum problema na política de branching/PR.` só aparece se `10-branching-and-pr-policy.md` foi carregado E não há violações de policy
- Se nenhum achado em nenhuma categoria:
  ```
  ✅ Nenhuma inconsistência encontrada. O PR segue os padrões do projeto.
  ```

### STEP 6 — Envio para o Teams (com guard-rail)

> **Regra:** Este passo segue o `teams-guard-rail.md` — nenhum envio ao Teams sem aprovação explícita.

Após exibir o relatório no chat, **perguntar ao usuário** se deseja enviar o resultado para o Microsoft Teams seguindo o fluxo obrigatório de 3 passos:

#### Passo 1 — Definir responsável

Ler o arquivo `.opencode/config/eligible-reviewers.json` para obter a lista de revisores elegíveis.

**Se o PR Author for o responsável desejado:**

Usar diretamente o nome do autor do PR (identificado no STEP 2). Se o autor estiver na lista de elegíveis, habilitar @mention.

**Se não, perguntar ao usuário:**

```
👤 Selecione o responsável pela análise:
```

Usar a tool `question` com as opções:

1. **[PR Author]** — Nome do autor do PR (ex: FallNAF)
2. **Nome do revisor 1** — da lista de elegíveis
3. **Nome do revisor 2** — da lista de elegíveis
---
🎲 **Sortear** — escolher aleatoriamente da lista de elegíveis
✏️ **Digitar manualmente** — informar nome livre

**Regra do sorteio:**

```javascript
// Seleciona um revisor aleatório da lista de elegíveis
const escolhido = reviewers[Math.floor(Math.random() * reviewers.length)];
```

**Regra de @mention:**

- Se o responsável estiver na lista de elegíveis: resolver `userId`, usar `<at id="0">Nome</at>` no message e `mentions: [{ mention, userId }]` no envio
- Se for digitado manualmente ou não estiver na lista: usar nome simples (sem @mention)

#### Passo 2 — Exibir mensagem para aprovação

Enviar a mensagem formatada como texto no chat antes de pedir confirmação:

```
[REPO_NOME_ALIAS] 📋 ANÁLISE PR #[NUMBER]

[Título do PR]

📦 [FILES_COUNT] arquivo(s) | +[ADDITIONS] / -[DELETIONS] linhas

🔧 MAIN: https://github.com/[OWNER]/[REPO]/pull/[NUMBER]

[Branch] → [Base]
👤 Autor: [Autor]

Resumo da análise:
🔴 [N] críticos | 🟡 [N] atenções | 💡 [N] sugestões

👤 Responsável: [Nome do responsável]
```

#### Passo 3 — Confirmar e enviar

Usar a tool `question` com as opções:

```
Deseja enviar esta análise para o Teams?
```

> **⚠️ Atenção:** No chat de PRs, enviar com `format: "text"` e HTML compatível com Graph: `<strong>` para negrito, `<br>` para quebras, `<a href>` para links clicáveis e `<at id="N">` para mentions.

- **✅ Sim, envia** → validar opcionalmente com shape `pr-analyze` (livre, sem validação estrutural) e chamar `teams-graph_send_chat_message` com:
  - `chatId`: resolver dinamicamente via `teams-graph_list_chats`, selecionando o tópico exato `Chat p/ Pull Request - [PR]`
  - `message`: relatório formatado com:
    - Título do PR
    - `📦 [FILES_COUNT] arquivo(s) | +[ADDITIONS] / -[DELETIONS] linhas` (se disponível)
    - `🔧 MAIN: https://github.com/[OWNER]/[REPO]/pull/[NUMBER]`
    - Branch, autor
    - Resumo da análise (🔴 críticos, 🟡 atenções, 💡 sugestões)
    - Responsável
  - `format`: `"text"`
  - `mentions`: array com `{ mention, userId }` se o responsável tiver email na lista de elegíveis (resolver userId via `teams-graph_search_users_for_mentions`)
  
  Após envio bem-sucedido, exibir: `✅ Análise enviada para o Teams.`
  
  Se falhar: exibir `❌ Não foi possível enviar para o Teams.` e continuar.

- **❌ Não, cancela** → apenas continuar, sem enviar.

> **Nota:** O envio é opcional e segue o `teams-guard-rail.md` — sempre com responsável definido, mensagem visível e aprovação explícita. O fluxo se aplica independente de quem invocou o comando (usuário direto ou skill `teams-pr`).

---

## Tratamento de Erros

| Situação | Comportamento |
|---|---|
| PR não encontrado via MCP e gh CLI | "❌ Não consegui acessar o PR. Informe a URL completa ou o número:" — aguardar |
| Repo não identificado | "Qual repo? (API / APP / MOBILE / FISCAL / JOBS / CARFLOW / CNAB / WORKBENCH)" |
| Diff > 500 linhas | Avisar e oferecer opções (continuar / filtrar arquivos / cancelar) |
| Knowledge doc inexistente no path | Ignorar silenciosamente, continuar com os disponíveis |
| PR mergeado ou fechado | "⚠️ PR #N está [merged/closed]. Análise cancelada." — encerrar |
| Falha no envio para o Teams | Exibir "❌ Não foi possível enviar para o Teams." e continuar normalmente (não interrompe o fluxo) |

---

## Observações

- Sem persistência em disco: não salva arquivos, não posta comentários no GitHub, não cria artefatos
- Envio opcional para o Teams via STEP 6, sob confirmação do usuário
- Leitura de contexto: somente knowledge base — não lê arquivos do repo durante a análise
- Segue padrão MCP First / gh CLI Fallback do projeto
- **Diff stats**: `additions`, `deletions` e `files` são obtidos no STEP 2 e usados no STEP 5 (relatório) e STEP 6 (Teams). Se indisponíveis, são omitidos
- **Badge `[REPO_NOME_ALIAS]`**: prefixa o title da notificação no Teams para identificação rápida do repositório
- Quando invocado pela skill `teams-pr`, os parâmetros `PR_URL` e `--repo` são passados automaticamente
