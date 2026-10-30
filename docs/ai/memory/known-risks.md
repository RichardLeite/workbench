---
title: Known Risks
type: memory
status: ativa
---

# Known Risks

> Riscos arquiteturais, de segurança e operacionais conhecidos.

## Geral
- **Push no Windows**: Env vars GITHUB_TOKEN/GH_TOKEN podem conflitar com credential manager
- **CI/CD**: Health check polling necessário após deploy
- **Adapter opcional**: MySQL exige configuração explícita; sem ela, o MCP correspondente fica indisponível
- **Dados sensíveis**: qualquer projeto pode lidar com PII — aplique `security-privacy`
