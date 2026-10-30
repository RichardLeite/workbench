---
description: "Output contexto da sessao no chat entre marcadores para copiar/colar em nova sessao"
---

# /handoff

Output contexto da sessao no chat entre `--- HANDOFF CONTEXT - INICIO ---` e `--- HANDOFF CONTEXT - FIM ---`. Usuario copia e cola em nova sessao.

## Fluxo

1. Validar: tem contexto relevante? Se nao, informar e parar
2. Coletar: `git diff --stat HEAD~10..HEAD`, `git status`, `git log --oneline -10`
3. Extrair: pedidos, conclusoes, pendencias, decisoes, arquivos, constraints
4. Output no chat no formato abaixo
5. Confirmar: instrucao para copiar/colar

## Formato

```
--- HANDOFF CONTEXT - INICIO ---

USER REQUESTS (AS-IS)
---------------------
<pedidos textuais do usuario - verbatim>

GOAL
----
<frase curta>

WORK COMPLETED
--------------
<bullets, primeira pessoa>

CURRENT STATE
-------------
<estado atual>

PENDING TASKS
-------------
<proximos passos>

KEY FILES
---------
<path - papel> (max 10)

IMPORTANT DECISIONS
-------------------
<decisoes tecnicas>

EXPLICIT CONSTRAINTS
--------------------
<None ou verbatim>

CONTEXT FOR CONTINUATION
------------------------
<avisos>

--- INSTRUCAO PARA PROXIMA IA ---
Contexto de handoff. Carregue como base e inicie pelas PENDING TASKS.

--- HANDOFF CONTEXT - FIM ---
```

## Regras

1. Sem secrets
2. Max 10 KEY FILES
3. Output no chat, nunca em arquivo
4. Texto plano, sem markdown
5. USER REQUESTS e CONSTRAINTS verbatim
6. Sempre incluir INSTRUCAO PARA PROXIMA IA
