# Agent Permission Matrix

> Define o que agentes IA podem ou não fazer em cada repositório independente.

## Níveis de Permissão

### Nível 0 — Sem acesso operacional
Apenas lê documentação do workbench.

**Pode:**
- Ler `projects/<project>/` docs
- Ler memória do workbench
- Sugerir próximos passos

**Não pode:**
- Ler código local do projeto
- Alterar código
- Rodar comandos destrutivos

### Nível 1 — Leitura local permitida
Analisa o projeto localmente, sem alterar arquivos.

**Pode:**
- Ler estrutura do projeto
- Ler README, configs e docs
- Mapear stack
- Criar relatórios no workbench

**Não pode:**
- Alterar arquivos do projeto
- Rodar comandos destrutivos
- Fazer commit/push/deploy

### Nível 2 — Alteração controlada sem Git remoto
Altera arquivos localmente, sem push.

**Pode:**
- Alterar código com escopo aprovado
- Criar testes
- Rodar testes/build/lint seguros
- Atualizar documentação local

**Não pode:**
- Fazer commit/push
- Abrir PR
- Deploy
- Alterar banco sem aprovação
- Manipular secrets

### Nível 3 — PR permitido
Pode commitar, branch, PR.

**Pode:**
- Tudo do nível 2
- Fazer commit em branch feature
- Abrir PR

**Não pode:**
- Fazer push para main/release
- Mergear PR
- Deploy em produção

### Nível 4 — Operação avançada
Deploy e operações sensíveis.

**Pode:**
- Tudo do nível 3
- Deploy mediante aprovação

**Não pode:**
- Deploy sem aprovação explícita
- Alterar secrets sem autorização

## Status por Projeto

| Projeto | Nível | Observação |
|---------|:-----:|-----------|
| projeto com repo local | 3 | PR permitido via /git-pr |
| projeto sem repo local | 3 | somente knowledge/specs |
| workbench | 3 | Meta-projeto, PR para main |
| Demais projetos | 1 | Repositórios remotos sem clone local |

## Regras

1. Consultar `wb projects list` para verificar se `local: true`
2. Se `local: false` → nível 1 (leitura de docs apenas)
3. Cada task deve respeitar o nível do projeto alvo
4. NUNCA fazer push sem autorização explícita do usuário
