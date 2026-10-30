---
name: threat-modeling
description: STRIDE threat modeling por endpoint/serviço — identificar ameaças e mitigar no design
---

# Threat Modeling (STRIDE)

## Quando usar
- Design de novo endpoint ou serviço
- Mudança significativa em auth/permissões
- Integração com API externa
- Antes de implementar funcionalidade que lida com PII/pagamento

## Processo
1. **Mapear** endpoints, fluxos de dados, trust boundaries
2. **Aplicar STRIDE** por elemento:
   - **S**poofing: autenticação
   - **T**ampering: integridade
   - **R**epudiation: logging
   - **I**nformation Disclosure: dados expostos
   - **D**enial of Service: rate limit
   - **E**levation of Privilege: autorização
3. **Classificar** severidade de cada ameaça
4. **Propor** mitigação por ameaça
5. **Documentar** em ADR ou vault

## Output
- Lista de ameaças por endpoint
- Mitigações propostas
- Riscos aceitos (com justificativa)

> Usado por: `sec-arch`, `security-reviewer`
