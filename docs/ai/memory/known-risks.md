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
- **Adapters opcionais**: Azure DevOps, Teams e MySQL exigem configuração explícita; sem ela, os fluxos correspondentes ficam indisponíveis
- **Dados sensíveis**: qualquer projeto pode lidar com PII — aplique `security-lgpd`
