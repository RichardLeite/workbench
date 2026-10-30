# Teams Guard-Rail — Proteção Contra Envio sem Permissão

> **Propósito:** Garantir que **nenhuma mensagem seja enviada ao Microsoft Teams sem explícita autorização do usuário**, seguindo o fluxo padronizado de aprovação.
>
> Esta regra é **obrigatória e inegociável** para todos os agentes, comandos e fluxos que utilizem as ferramentas de envio do Teams (`teams-graph_send_channel_message`, `teams-graph_send_chat_message`).

## Regra 1 — Nunca enviar sem aprovação explícita

**É PROIBIDO** chamar `teams-graph_send_channel_message` ou `teams-graph_send_chat_message` diretamente sem antes:

1. ✅ Exibir a mensagem completa no chat para o usuário (como texto puro)
2. ✅ Aguardar **confirmação explícita** do usuário via tool `question`
3. ✅ Só então enviar

**NUNCA** enviar a mensagem automaticamente como parte de um fluxo, mesmo que o conteúdo já esteja pronto.

## Regra 2 — Fluxo obrigatório de 3 passos

Qualquer comando/agente que envie mensagens para o Teams DEVE seguir **exatamente** esta sequência:

```
┌─────────────────────────────────────────────────────┐
│ PASSO 1 — Definir responsável                       │
│                                                     │
│ • Se o fluxo já definiu um responsável, reutilizá-lo│
│ • Se não: perguntar ao usuário quem é o responsável │
│ • Usar a lista de elegíveis quando disponível       │
│   (.opencode/config/eligible-reviewers.json)        │
│ • Incluir @mention se o email estiver disponível    │
├─────────────────────────────────────────────────────┤
│ PASSO 2 — Exibir e confirmar                        │
│                                                     │
│ • Exibir a mensagem completa como texto no chat     │
│ • Incluir title + message + @mention se houver      │
│ • Perguntar: "Deseja enviar esta mensagem para o    │
│   Teams?" com opções Sim/Não                        │
├─────────────────────────────────────────────────────┤
│ PASSO 3 — Enviar (somente se Sim)                   │
│                                                     │
│ • Chamar a tool Graph aprovada para o destino       │
│   title, message e mentions (se @mention)           │
│ • Se falhar: informar o erro e oferecer reprocessar │
└─────────────────────────────────────────────────────┘
```

## Regra 3 — Responsável sempre presente (1 ou 2 revisores)

Toda mensagem enviada ao Teams DEVE conter pelo menos um responsável (`👤 Revisor: Nome` ou `👤 Revisores: Nome e Nome`).

- **Quantidade:** 1 revisor (padrão) ou **até 2 revisores** (para PRs complexos)
- **Formato com 2 revisores:** `👤 Revisores: <at id="0">Nome1</at> e <at id="1">Nome2</at>`, na mesma ordem de `mentions[]`
- **Origem do responsável:** pode vir de:
  - Parâmetro `--responsible` do comando
  - Lista de elegíveis (`.opencode/config/eligible-reviewers.json`)
  - Sorteio automático da lista (se complexo → 2 revisores)
  - Entrada manual do usuário
- **@mention:** usar `<at id="N">Nome</at>` + `mentions[]` na mesma ordem sempre que o email estiver disponível na lista de elegíveis
- **Sem responsável definido:** usar `—` (travessão), mas só como último caso

## Regra 4 — Mensagem sempre visível antes do envio

O usuário DEVE ver a mensagem exata que será enviada **antes de decidir**. Isso significa:

- Exibir **title e message** completos como texto puro no chat
- Formatar de forma legível, com emojis e estrutura clara
- **NUNCA** pular a exibição e ir direto para a pergunta de confirmação
- **NUNCA** enviar sem pergunta de confirmação

## Regra 5 — Fluxo de referência

A skill `teams-pr` (`.opencode/skills/teams-pr/SKILL.md`) é a **implementação de referência** deste guard-rail. Consulte-a para:

- Como definir o responsável (STEP 3.5)
- Como apresentar a mensagem para aprovação (STEP 5)
- Como formatar title/message/mentions (STEP 4 e 6)
- Como tratar erros de envio (STEP 6)

## Regra 6 — Formato de mensagem SEMPRE pelo template do /teams-pr

**É PROIBIDO** inventar formato próprio para mensagens do Teams. Toda mensagem DEVE seguir **exatamente** o template padronizado definido no STEP 4 da skill `teams-pr` (`.opencode/skills/teams-pr/SKILL.md`).

Para notificações de Pull Request:

- Destino obrigatório: chat em grupo `Chat p/ Pull Request - [PR]`, resolvido dinamicamente por tópico.
- Transporte: `teams-graph_send_chat_message`; nunca canal `Geral`/`General`.
- Wire format: `format: "text"` com HTML Graph (`<strong>`, `<br>`, `<a href>` e `<at id="N">`).
- Markdown com @mention é proibido porque pode remover o marcador indexado; `\n` e URL em texto puro também não garantem quebra ou link clicável no chat.

### Template obrigatório

```
{EMOJI} {TIPO} TASK-{TASK_NUMBER} — {DESCRICAO}

{DESCRICAO_DETALHADA}

{ICONE_REPO} **{NOME_REPO}**

📂 PRs:
{PRS_LISTAGEM}

✍️ Autor: {AUTHOR}
👤 Revisor: {RESPONSAVEL_FORMATADO}
```

### Regras de formatação

| Elemento | Regra |
|----------|-------|
| Emoji | 🔥 hotfix, 🚀 sprint |
| PRs listagem | Usar `→` (seta), não travessão ou outros separadores |
| Linha de repositório | `📱 **app**` ou `🔧 **api**` — se único, sem pipe; se ambos, `📱 **app** \| 🔧 **api**` |
| @mention | `<at id="N">Nome</at>` no message + `mentions[]` na mesma ordem |
| Descrição detalhada | Opcional — omitir linha se vazia |

### O que NÃO fazer

- ❌ Não criar seção "O que:" / "PRs:" com formato livre
- ❌ Não usar bullets diferentes de `→` para listar PRs
- ❌ Não adicionar campos que não estão no template (ex: "Impacto", "Risco")
- ❌ Não traduzir os placeholders para português criativo
- ❌ Não pular o STEP 5 (exibir no chat antes de perguntar)

### Referência

Sempre consultar o STEP 4 e STEP 5 do arquivo `.opencode/skills/teams-pr/SKILL.md` como fonte única da verdade para o formato.

## Exceções

**NÃO existem exceções.** Nenhum agente, comando ou fluxo pode enviar mensagens ao Teams sem seguir este guard-rail. Isso inclui:

- skill `teams-pr` (já segue)
- `/pr-analyze` (STEP 6 do `/pr-analyze` deve perguntar antes de enviar)
- Qualquer novo comando que venha a usar as ferramentas Graph API do Teams
- Chamadas diretas de agentes orquestrados

## Violação

Se um agente tentar enviar mensagem ao Teams sem seguir o fluxo:

1. O guard-rail **bloqueia** a chamada automaticamente
2. Exibe: "❌ Violação do Teams Guard-Rail: não é permitido enviar sem aprovação explícita. Siga o fluxo: definir responsável → exibir mensagem → confirmar → enviar pela tool Graph aprovada para o destino."
3. O fluxo correto deve ser executado antes de prosseguir
