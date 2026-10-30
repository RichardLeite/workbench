# Guia para TI — App Registration Microsoft Entra ID (Azure AD)

> **Objetivo:** Permitir que o agente de IA (OpenCode) envie mensagens diretas no Microsoft Teams usando a conta do próprio usuário via Graph API.
> **Tipo de autenticação:** OAuth 2.0 Device Code Flow (delegada — age como o usuário logado)
> **Risco:** Baixo — escopos somente de envio de mensagens, sem leitura de dados sensíveis

---

## Passo 1 — Criar App Registration

1. Acessar **[Azure Portal > App Registrations](https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)**
2. Clicar em **"New Registration"**
3. Preencher:
   - **Name:** `Teams MCP Agent — OpenCode`
   - **Supported account types:** "Accounts in this organizational directory only" (`<seu-tenant>.onmicrosoft.com`)
   - **Redirect URI:** `http://localhost` (tipo: **Public client/native**)
4. Clicar em **Register**

---

## Passo 2 — Habilitar Device Code Flow

1. No App Registration criado, ir em **Authentication**
2. Em **Advanced settings > Allow public client flows**
3. Marcar **"Yes"** (permite Device Code + SSO)
4. Clicar em **Save**

---

## Passo 3 — Configurar Permissões (Escopos Mínimos)

> **Importante:** Estamos solicitando o **mínimo necessário** para enviar mensagens. Sem permissão de leitura de chats completos.

1. Ir em **API Permissions** > **Add a permission**
2. Escolher **Microsoft Graph** > **Delegated permissions**
3. Adicionar **APENAS** estes escopos:

| Permissão | Tipo | Justificativa |
|-----------|------|---------------|
| `ChannelMessage.Send` | Delegada | Enviar mensagens em canais do Teams |
| `Chat.ReadWrite` | Delegada | Enviar mensagens em chat 1:1 (DM) |
| `User.Read` | Delegada | Identificar o usuário logado |

4. Clicar em **Add permissions**
5. Clicar em **"Grant admin consent for <sua-organização>"**

> **Nota:** Se o admin questionar `Chat.ReadWrite`, explicar que o pacote usa `Chat.ReadWrite` para enviar mensagens. Se houver restrição, podemos testar com `Chat.ReadWrite.Send` (se disponível), mas o MCP da comunidade usa `Chat.ReadWrite`.

---

## Passo 4 — Anotar o Client ID

| Campo | Valor |
|-------|-------|
| **Application (client) ID** | `{GERADO_NO_PASSO_1}` |
| **Directory (tenant) ID** | `{tenant_id}` |

Preencha esses valores no `.env` (`TEAMS_MCP_CLIENT_ID` e `TEAMS_MCP_TENANT_ID`).

---

## Resumo para o Admin

```
App: Teams MCP Agent — OpenCode
Tenant: <seu-tenant>.onmicrosoft.com
Tipo: Public client (native)
Auth: Device Code Flow (OAuth 2.0)
Escopos: ChannelMessage.Send, Chat.ReadWrite, User.Read
Risco: 🔵 Baixo — apenas envia mensagens como o usuário logado
```

---

## Documentação de Referência

- [Microsoft Identity Platform — Device Code Flow](https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-device-code)
- [Microsoft Graph — Permissions Reference](https://learn.microsoft.com/en-us/graph/permissions-reference)
- [@floriscornel/teams-mcp (GitHub)](https://github.com/floriscornel/teams-mcp)

