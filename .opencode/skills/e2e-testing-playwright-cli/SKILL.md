---
name: e2e-testing-playwright-cli
description: Skill para criar e executar testes E2E com playwright-cli no Meu Projeto App — estrutura base, templates, helpers reutilizáveis, padrões e fluxo GOAP.
category: development
---

# E2E Testing — playwright-cli (Meu Projeto App)

## Goal

Criar testes E2E padronizados usando `playwright-cli` para o Meu Projeto App. A skill define a **estrutura base** (templates + helpers genéricos) que a IA segue. O que é **específico do app** (login, seletores) fica no próprio projeto.

## Estrutura

### Workbench — Base (reutilizável entre projetos)

```
.opencode/skills/e2e-testing-playwright-cli/
├── SKILL.md                          ← instruções + padrões (este arquivo)
├── templates/
│   ├── run-test.js                   ← template de script (cópia para cada teste)
│   └── test.yml                      ← template de guia de execução
└── helpers/
    ├── _base.js                      ← runPw, sleep, clickByText, fillByPlaceholder, fillBySelector
    ├── navigation.js                 ← navigate, clickSidebarItem, switchTab
    └── assertions.js                 ← assertTextVisible, assertUrlContains, waitFor
```

### Meu Projeto App — Específico do projeto

```
src/__tests__/e2e/
├── config/
│   ├── .env.example                  ← template de variáveis (copiar → .env)
│   └── users.js                      ← central de credenciais (client, admin)
├── helpers/
│   └── login.js                      ← loginOSDigital, loginOSDigitalAdmin (DOM do app)
├── evidence/                         ← screenshots + vídeos (.gitignore)
├── <teste>/
│   ├── run-<teste>.js                ← script do teste (cópia do template)
│   └── <teste>.yml                   ← guia de execução
├── login/                            ← teste exemplo
│   ├── run-login.js
│   └── login.yml
└── lock-screen/                      ← teste exemplo
    ├── run-lock-screen.js
    └── lock-screen.yml
```

## Fluxo de criação (GOAP para IA)

```
Usuário: "Criar teste E2E para [fluxo]"

1. CARREGAR skill: skill("e2e-testing-playwright-cli")
2. AVALIAR se é E2E:
   ├── Não é fluxo de usuário? → ❌ Não é E2E
   └── É fluxo crítico de usuário? → ✅ Seguir
3. PERGUNTAR ao usuário: "Qual o fluxo? Quais etapas?"
4. CRIAR diretório: src/__tests__/e2e/<fluxo>/
5. COPIAR template: templates/run-test.js → adaptar
6. COPIAR template: templates/test.yml → preencher
7. IMPORTAR helpers conforme necessário:
   const { runPw, clickByText } = require('...helpers/_base');    // base
   const { loginOSDigital } = require('../helpers/login');        // app-specific
   const { client } = require('../config/users');                 // credenciais
8. ESCREVER cenários com padrões obrigatórios
9. EXECUTAR: nvm use 20 && node run-<teste>.js
```

## Padrões Obrigatórios

### 1. Credenciais — SEMPRE via config/users.js
```javascript
// App-specific
const { client, admin } = require('../config/users');
loginOSDigital(client.email, client.password);
```

### 2. Login (Meu Projeto)
```javascript
// helpers/login.js já faz isso, mas o padrão é:
fillByPlaceholder('seu@gmail.com', email);          // email com placeholder
fillBySelector('.password-div input', password);     // senha SEM placeholder
runPw(['click', 'button.btn-sucesso'], { allowFailure: true });
sleep(10000);                                        // aguardar carregamento
```

### 3. Navegação
- **Preferir** `clickByText('Nome do Menu')` (simula clique real)
- **Fallback** para navegação direta via `goto('/caminho')`

### 4. Inputs — ordem de prioridade
1. `fillByPlaceholder('Placeholder', valor)` — quando tem placeholder
2. `fillBySelector('.classe input', valor)` — quando NÃO tem placeholder
3. `runPw(['fill', ref, valor])` — fallback com ref do snapshot

### 5. Asserção
```javascript
assertUrlContains('/client/home');     // URL atual contém path
assertTextVisible('Texto na página');  // texto visível no body
```

### 6. Vídeo com capítulos
```javascript
runPw(['video-start', VIDEO_FILE, '--size', '1920x1080']);
runPw(['video-chapter', '1) Etapa']);
runPw(['video-stop']);
```

### 7. Aguardar carregamento antes de screenshot
```javascript
// ❌ screenshot branca
runPw(['goto', url]);
screenshot('01-pagina');

// ✅ aguardar e depois printar
runPw(['goto', url]);
sleep(5000);
screenshot('01-pagina');
```

### 8. Evidências
```javascript
screenshot('01-nome-descritivo');  // salva em evidence/<teste>/01-....png
runPw(['screenshot']);              // sem nome, salva na raiz (evitar)
```

## Dependências entre camadas

```
Test Script (app)
  ├── importa _base.js (workbench)  → runPw, clickByText, fillByPlaceholder
  ├── importa assertions.js (wkb)   → assertUrlContains, assertTextVisible
  ├── importa login.js (app)        → loginOSDigital (usa _base.js internamente)
  └── importa users.js (app)        → client, admin

login.js (app) → importa _base.js (workbench) → usa runPw, fillByPlaceholder, fillBySelector
```

## Guardrails

1. **Login helpers SEMPRE no app** — nunca no workbench (DOM específico)
2. **Nunca hardcode credenciais** — sempre via `config/users.js`
3. **Cada teste em seu diretório** — `src/__tests__/e2e/<fluxo>/`
4. **Sempre criar .yml junto** — documenta env vars, pré-condições, capítulos
5. **Screenshots nomeados por etapa** — `01-login-page`, `02-credenciais`, etc
6. **Aguardar carregamento** — `sleep(5000)` após `goto` antes do print
7. **Vídeo começa no início** — `video-start` antes do primeiro cenário
8. **.gitignore** — `evidence/` + `.playwright-cli/` + `.env` ignorados

## Referências

- Teste exemplo (login): `meu-projeto-app/src/__tests__/e2e/login/`
- Teste exemplo (lock-screen): `meu-projeto-app/src/__tests__/e2e/lock-screen/`
- Helpers base: `.opencode/skills/e2e-testing-playwright-cli/helpers/`
- ADR-006: `.opencode/backlog/adr/ADR-006-e2e-testing-skill.md`
- CLI Docs: https://playwright.dev/agent-cli/quick-start
