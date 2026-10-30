# Company OS

> **Engine executa. Company OS orienta. Workbench governa.**

Company OS contém **papéis conceituais, skills de negócio, playbooks e templates**
que orientam o raciocínio e a operação. Esta camada NÃO executa — ela orienta.

## O que pertence aqui

- **Roles/**: Papéis conceituais (CTO, EM, QA, Security)
- **Skills/**: Skills de negócio (product-discovery, threat-modeling, pricing)
- **Templates/**: Templates de documentos (ADR, feature-spec, PRD, etc.)

## Estrutura

```
company-os/
├── README.md       → Este arquivo
├── roles/          → Papéis conceituais
├── skills/         → Skills de negócio
└── templates/      → Templates de documentos
```

## Três Camadas

| Camada | Path | Função |
|--------|------|--------|
| **Workbench Governance** | `docs/ai/` | Memória, permissões, políticas, contratos |
| **OpenCode Engine** | `.opencode/agents/`, `.opencode/skills/` | Execução técnica |
| **Company OS** | `.opencode/company-os/` | Orientação de negócio |
