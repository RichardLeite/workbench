---
description: "Inicia MCP MySQL para um projeto específico"
---

# /mcp-start

> Inicia o servidor MCP MySQL para um projeto, carregando as credenciais
> do `.env` do repositório correspondente.

## Uso

```
/mcp-start meu-projeto
```

## Funcionamento

1. Consulta `project-mapping.json` para descobrir o diretório do repositório
2. Executa: `node scripts/start-mysql-mcp.js <project>`
3. O MCP fica rodando em foreground (stdin/stdout)

## MCPs registrados no opencode.json

Quando um projeto é usado com frequência, registre o MCP no `opencode.json`:

```json
"mcp": {
  "mysql-<project>": {
    "type": "local",
    "command": ["node", "scripts/start-mysql-mcp.js", "<project>"],
    "enabled": true
  }
}
```

## Requisitos

O projeto precisa ter um arquivo `.env` com as credenciais MySQL no diretório
do repositório. O MCP usa `mysql-mcp-server` via npx. Repositórios são
resolvidos via `project-mapping.json`.
