---
description: "Revisão completa em 4 camadas: Lint → SAST → Security → AI Review. Pré-PR obrigatório."
---

# /review-all

> **Revisão em 4 camadas.** Executa lint, SAST (Semgrep), segurança (Trivy) e code review (IA)
> em sequência — para garantir qualidade antes de abrir um PR.

## Uso

```
/review-all
/review-all <caminho>
/review-all frontend
/review-all backend
```

Se nenhum caminho for informado, escaneia o repositório atual.

## As 4 Camadas

```
/review-all

├── 🔵 CAMADA 1 — Lint (estilo + formatação)
│   ├── ESLint / Prettier — verifica estilo e padrões
│   └── Se falhar → reporta e para (não adianta escanear código mal formatado)
│
├── 🟡 CAMADA 2 — SAST (Semgrep)
│   ├── Análise estática — bugs, anti-patterns, SQL injection
│   ├── Rules: auto + OWASP top 10 + custom rules do projeto
│   └── Se ERROR → reporta e pergunta se prossegue
│
├── 🟠 CAMADA 3 — Segurança (Trivy)
│   ├── Varredura de dependências — CVEs, secrets, misconfigs
│   ├── Foco em CRITICAL/HIGH
│   └── Se CRITICAL → reporta e para (risco de segurança real)
│
└── 🔴 CAMADA 4 — AI Code Review (@revisor)
    ├── Análise semântica — lógica, arquitetura, regras de negócio
    ├── Contexto: diff das mudanças vs branch base
    └── Retorna parecer com issues P0/P1/P2
```

## Fluxo por Contexto

> O contexto é detectado do diretório atual (repositório) ou do projeto em foco.
> Para projetos não listados, detectar a stack via AGENTS.md do projeto e perguntar os comandos.

### `.workbench`

```
/review-all
├── Layer 1: Lint → reportar sugestão se não configurado
├── Layer 2: SAST → semgrep --config=auto .opencode/
├── Layer 3: Trivy → trivy fs --scanners vuln,secret .
└── Layer 4: @revisor → revisa diff dos arquivos modificados
```

### `meu-projeto-api` (Node.js/Express)

```
/review-all backend
├── Layer 1: yarn format:check + eslint src/
├── Layer 2: semgrep --config=auto src/
├── Layer 3: trivy fs --scanners vuln .
└── Layer 4: @revisor → revisa diff dos arquivos modificados
```

### `meu-projeto-app` (React)

```
/review-all frontend
├── Layer 1: yarn format:check
├── Layer 2: semgrep --config=auto src/ --lang=javascript
├── Layer 3: trivy fs --scanners vuln .
└── Layer 4: @revisor → revisa diff dos arquivos modificados
```

### `fiscal-api` (.NET Core)

```
/review-all
├── Layer 1: dotnet build → verificar compilação
├── Layer 2: SAST → semgrep --config=auto src/ --lang=csharp
├── Layer 3: Trivy → trivy fs --scanners vuln .
└── Layer 4: @revisor → revisa diff dos arquivos modificados
```

### Outros projetos

Para `meu-projeto-api`, `meu-projeto-app` ou outros, detectar a stack do `projects/<projeto>/AGENTS.md`
e perguntar ao usuário quais comandos de lint/test usar, ou pular camadas sem ferramentas.

## Relatório

```
╔═══════════════════════════════════════════════════════════╗
║  Review-All — Relatório Consolidado                      ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  🔵 Lint:       ✅ OK / ⚠️ Warnings / ❌ Error           ║
║    ├── ESLint:   <status>                                 ║
║    └── Prettier: <status>                                 ║
║                                                           ║
║  🟡 SAST:       ✅ OK / ⚠️ Warnings / ❌ Error           ║
║    ├── Regras executadas: <N>                             ║
║    ├── Findings: <N> total, <N> ERROR, <N> WARNING       ║
║    └── Top issues: <lista>                                ║
║                                                           ║
║  🟠 Security:   ✅ OK / ⚠️ Warnings / ❌ Error           ║
║    ├── CVEs:     <N> CRITICAL, <N> HIGH, <N> MEDIUM      ║
║    └── Secrets:  <N> findings                             ║
║                                                           ║
║  🔴 AI Review:  ✅ Aprovado / ⚠️ Ressalvas               ║
║    ├── P0 (bloqueante): <N>                               ║
║    ├── P1 (importante): <N>                               ║
║    └── P2 (sugestão):   <N>                               ║
║                                                           ║
║  Decisão: ✅ Prosseguir / ❌ Bloqueado                    ║
╚═══════════════════════════════════════════════════════════╝
```

## Regras

1. **Camada 1 é gate** — se lint falha, não prossegue para as demais
2. **Camada 3 bloqueia** — CRITICAL findings param o pipeline
3. **Camada 4 é consultiva** — revisor sugere, não bloqueia (exceto P0)
4. **Ferramentas instaladas?** — detectar antes de executar; se não instalado, sugerir instalação
5. **Context-aware** — detecta se é backend (Node.js), frontend (React) ou .workbench (infra)
