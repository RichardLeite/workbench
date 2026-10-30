# Convenções e Padrões — .workbench

> Padrões obrigatórios para código, banco, API, testes e processos. Agentes de IA **devem** seguir estas convenções.

## Índice

- [1. Nomenclatura de Código](#1-nomenclatura-de-código)
- [2. Nomenclatura de Banco de Dados](#2-nomenclatura-de-banco-de-dados)
- [3. Nomenclatura de API](#3-nomenclatura-de-api)
- [4. Nomenclatura de Arquivos e Diretórios](#4-nomenclatura-de-arquivos-e-diretórios)
- [5. Padrões de Teste](#5-padrões-de-teste)
- [6. Definition of Done (DoD)](#6-definition-of-done-dod)
- [7. Critérios de Code Review](#7-critérios-de-code-review)
- [8. Padrões de API (Respostas e Erros)](#8-padrões-de-api-respostas-e-erros)
- [9. Padrões de Comunicação](#9-padrões-de-comunicação)
- [10. Variáveis de Ambiente](#10-variáveis-de-ambiente)
- [11. Logs e Observabilidade](#11-logs-e-observabilidade)

> Seções removidas (duplicadas em documentos centrais):
> - **Priorização (P0/P1/P2)** → [`.opencode/rules/constitution.md`](.opencode/rules/constitution.md) (regras 7-8)
> - **Versionamento e Compatibilidade** → [`.opencode/config/pr-config.md`](.opencode/config/pr-config.md) (seção 1)
> - **Conventional Commits** → [`.opencode/config/commit-conventions.json`](.opencode/config/commit-conventions.json) (dados) e [`.opencode/config/pr-config.md`](.opencode/config/pr-config.md) (seção 10)
> - **Conventional Branches** → [`.opencode/config/branch-conventions.json`](.opencode/config/branch-conventions.json) (dados) e [`.opencode/config/pr-config.md`](.opencode/config/pr-config.md) (seção 11)

---

## Convenções Específicas por Projeto

Cada projeto pode ter convenções adicionais em `projects/<slug>/CONVENTIONS.md`.
Consulte o `AGENTS.md` do projeto para detalhes de stack e banco de dados.

---

## 1. Nomenclatura de Código

### 1.1 Regras Gerais

| Elemento | Padrão | Exemplo Correto | Exemplo Incorreto |
|----------|--------|-----------------|-------------------|
| **Classes** | `PascalCase` | `CustomerController` | `customer_controller` |
| **Interfaces/Types** | `PascalCase` (sem prefixo `I`) | `UserService`, `CustomerData` | `IUserService`, `user_service_interface` |
| **Funções/Métodos** | `camelCase` com verbo | `findByEmail()`, `handleSubmit()` | `FindByEmail()`, `find_by_email()` |
| **Variáveis** | `camelCase` | `customerName`, `totalValue` | `customer_name`, `CustomerName` |
| **Constantes** | `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT`, `API_BASE_URL` | `maxRetryCount`, `MaxRetryCount` |
| **Booleanos** | Prefixo `is`/`has`/`should`/`can` | `isActive`, `hasPermission`, `shouldRetry` | `active`, `permissionFlag` |
| **Enums** | `PascalCase` (tipo) + `UPPER_SNAKE_CASE` (valores) | `Status.APPROVED`, `Role.ADMIN` | `status.approved` |
| **Event Handlers** | Prefixo `handle` | `handleClick()`, `handleFormSubmit()` | `onClickHandler()`, `clickHandler()` |
| **Async functions** | Sufixo `Async` (quando necessário) | `processPaymentAsync()` | `processPayment()` sem contexto |

### 1.2 Casos Específicos por Camada

**Backend (Node.js/Express)**
```typescript
// ✅ Correto
class CustomerController {
  async list(req: Request, res: Response): Promise<void> { }
  async findById(req: Request, res: Response): Promise<void> { }
}
class CustomerService {
  async findByEmail(email: string): Promise<Customer | null> { }
}
interface CustomerRepository {
  findById(id: number): Promise<Customer | null>;
}
// ❌ Incorreto: class customer_controller { }, function Find_By_Email() { }, interface ICustomerRepository { }
```

**Frontend (React)**
```typescript
// ✅ Correto: const CustomerForm: React.FC = () => { };
// const [isLoading, setIsLoading] = useState(false);
// function handleSave(): void { }
// ❌ Incorreto: const customer_form: React.FC = () => { };
// const [loading, setLoading] = useState(false); // ambíguo
```

### 1.3 Ordem de Importação

```
1. Node built-ins (fs, path, http)
2. Pacotes externos (express, react, sequelize)
3. Aliases internos (@/controllers, @/services)
4. Imports relativos (./, ../)
5. Tipos/interfaces
```
Cada grupo separado por linha em branco. Ordem alfabética dentro de cada grupo.

---

## 2. Nomenclatura de Banco de Dados

> Itens marcados com ⓘ são exemplos de convenções específicas de um projeto. Cada projeto pode ter convenções diferentes — consulte o `AGENTS.md` do respectivo projeto.

---

## 3. Nomenclatura de API

| Elemento | Padrão | Exemplo Correto | Exemplo Incorreto |
|----------|--------|-----------------|-------------------|
| **Endpoints** | `snake_case`, **plural** | `/api/v2/clientes` | `/api/v2/getClientes` |
| **Parâmetros de rota** | `camelCase` | `/:clienteId` | `/:cliente_id` |
| **Query params** | `snake_case` | `?data_inicio=2024-01-01` | `?dataInicio=` |
| **Body (request/response)** | `camelCase` | `{ "clienteNome": "João" }` | `{ "cliente_nome": "João" }` |
| **Headers customizados** | `PascalCase` com hífen | `X-Request-Id`, `X-Tenant-Id` | `x-request-id` |

> **Nota**: Endpoints usam `snake_case` (URL), JSON bodies usam `camelCase`. Intencional.

**Paginação:** `GET /api/v2/clientes?page=1&limit=20&sort=nome&order=asc`
Resposta: `{ "data": [...], "pagination": { "page": 1, "limit": 20, "total": 150, "totalPages": 8 } }`

---

## 4. Nomenclatura de Arquivos e Diretórios

> ⓘ = Exemplo de convenção específica de projeto. Consulte o `AGENTS.md` do respectivo projeto.

| Tipo | Padrão | Exemplo Correto | Exemplo Incorreto |
|------|--------|-----------------|-------------------|
| **Componentes React** | `PascalCase.tsx` | `CustomerForm.tsx` | `customerForm.tsx` |
| **Controllers/Services** | `PascalCase.js` | `CustomerController.js` | `customerController.js` |
| **Models (Sequelize)** ⓘ | `PascalCase.js` | `Customer.js` | `customer.js` |
| **Migrations** ⓘ | `YYYYMMDDHHmmss-nome.js` | `20240601120000-create-clientes.js` | `create_clientes.js` |
| **Seeds** ⓘ | `YYYYMMDDHHmmss-nome.js` | `20240601120001-clientes-padrao.js` | `seed-clientes.js` |
| **Hooks** | `useCamelCase.ts` | `useDebounce.ts` | `use-debounce.ts` |
| **Contexts** | `PascalCase.tsx` | `AuthContext.tsx` | `auth-context.tsx` |
| **Utils/Helpers** | `camelCase.ts` | `formatCurrency.ts` | `FormatCurrency.ts` |
| **Test files** | `<nome>.test.ts(x)` | `CustomerForm.test.tsx` | `test_CustomerForm.tsx` |
| **Diretórios** | `kebab-case` | `contas-a-receber/` | `contas_a_receber/` |

---

## 5. Padrões de Teste

### Localização
```
src/controllers/CustomerController.js
src/controllers/CustomerController.test.js  # Junto ao source
```

### Nomenclatura
```javascript
// ✅ Correto
describe('CustomerController', () => {
  describe('list', () => {
    it('should return paginated customers when called with valid params', () => { });
  });
});
```

### Cobertura por camada

| Camada | O que testar | O que NÃO testar |
|--------|-------------|------------------|
| **Controller** | Status code, shape resposta, chamada service | Lógica de negócio |
| **Service** | Regras de negócio, fluxos alternativos, exceções | HTTP, banco (mockar) |
| **Repository** | Queries, filtros, ordenação | Regras de negócio |
| **Component (React)** | Renderização, eventos, estados | Lógica de negócio da API |
| **Hook** | Retorno, mudança de estado, cleanup | Renderização |

### Cobertura Mínima
- **Criticais** (financeiro, fiscal, login): ≥ 90%
- **Features novas**: ≥ 70%
- **Bugs**: teste reproduz o bug antes da correção
- **Legado sem testes**: não exigir cobertura, mas não reduzir

---

## 6. Definition of Done (DoD)

### Feature
- [ ] Código implementado conforme spec
- [ ] Testes passando (quando houver infra)
- [ ] Migration `up`/`down` (se impactou banco)
- [ ] Rollback testado | Self-review sem debuggers/console.log
- [ ] @revisor aprovou | Build/CI passando
- [ ] Spec atualizada se houver mudança | Vault atualizado (@vault-updater)
- [ ] PR com template preenchido (riscos, evidências, rollback)

### Bug
- [ ] Bug reproduzido antes da correção | Não reproduz após
- [ ] Teste de regressão adicionado (se houver infra)
- [ ] Impacto mínimo (sem refatoração paralela) | Rollback planejado
- [ ] @revisor aprovou (impacto mínimo verificado)

### .workbench (infraestrutura)
- [ ] Código implementado | Testado manualmente
- [ ] Documentação atualizada | PR aberto para `main`

---

## 7. Critérios de Code Review

### 7.1 O que revisar (em ordem de prioridade)

| Prioridade | Categoria | O que verificar |
|:----------:|-----------|-----------------|
| 🔴 P0 | **Segurança** | Dados sensíveis expostos? SQL injection? Autorização? |
| 🔴 P0 | **Correção** | Lógica resolve o problema? Trata edge cases? |
| 🟡 P1 | **Regressão** | Algo existente pode quebrar? Migrations reversíveis? |
| 🟡 P1 | **Performance** | N+1 queries? Índice faltando? |
| 🟢 P2 | **Manutenibilidade** | Código legível? Responsabilidade única? |
| 🟢 P2 | **Padrões** | Segue as convenções? |
| ⚪ P3 | **Estilo** | Formatação (delegar ao linter) |

### 7.2 Regras de conduta para revisores

1. **Seja específico**: "Na linha 42, `findByEmail` pode retornar `null`" — não "isso pode dar problema"
2. **Sugira, não exija** (exceto P0): "Sugiro extrair para um service"
3. **Explique o porquê**: "P1 porque afeta query chamada 10k vezes/dia"
4. **Limite de PR**: máximo **400 linhas**. Acima, quebrar em PRs menores
5. **Tempo**: 4h úteis para hotfix, 24h para sprint | Um revisor padrão, dois para banking/fiscal

### 7.3 Sorteio e Atribuição Automática de Revisor

O revisor é **sorteado** da lista em `eligible-reviewers.json` (opcional).
- Se revisor tiver `github` preenchido → adicionado como GitHub Reviewer via `gh api`
- Se vazio → GitHub pulado

```json
{ "reviewers": [
  { "name": "Pessoa Um", "github": "pessoa-um" },
  { "name": "Pessoa Dois", "github": "pessoa-dois" }
]}
```

### 7.4 Frases modelo para review

```text
✅ "Na linha 42, `findByEmail` pode retornar `null`. Sugiro `if (!customer) throw NotFoundError`."
✅ "Migration sem DEFAULT em tabela com 500k linhas pode travar. Adicionar DEFAULT 0 + backfill."
❌ "Isso tá errado." / "Refatora tudo." / "Faltou coisa."
```

---

## 8. Padrões de API (Respostas e Erros)

### 8.1 Formato de Sucesso
```json
{ "data": { ... }, "pagination": { "page": 1, "limit": 20, "total": 150, "totalPages": 8 } }
```
Lista vazia: `{ "data": [], "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 } }`

### 8.2 Formato de Erro
```json
{ "error": { "code": "CUSTOMER_NOT_FOUND", "message": "Cliente não encontrado", "details": { "customerId": 1234 } } }
```

| Campo | Descrição | Obrigatório |
|-------|-----------|:-----------:|
| `error.code` | Código único `UPPER_SNAKE_CASE` | ✅ |
| `error.message` | PT-BR usuário final, EN para dev | ✅ |
| `error.details` | Dados adicionais (IDs, campos inválidos) | ❌ |

### 8.3 Códigos HTTP e Erros Comuns

| HTTP | Código | Uso |
|:----:|--------|-----|
| 400 | `VALIDATION_ERROR` | Dados inválidos |
| 401 | `UNAUTHORIZED` | Token ausente/inválido |
| 403 | `FORBIDDEN` | Sem permissão |
| 404 | `RESOURCE_NOT_FOUND` | Recurso não encontrado |
| 409 | `CONFLICT` | Duplicata, versão desatualizada |
| 422 | `UNPROCESSABLE_ENTITY` | Regra de negócio violada |
| 429 | `RATE_LIMIT_EXCEEDED` | Rate limit |
| 500 | `INTERNAL_ERROR` | Erro não esperado (sem detalhes ao client) |
| 502 | `BAD_GATEWAY` | Integração externa falhou |
| 503 | `SERVICE_UNAVAILABLE` | Manutenção |

---

## 9. Padrões de Comunicação

### 9.1 Pull Requests
- **Título**: `tipo(escopo): descrição em inglês` — ex: `feat(AB#1234): add invoice retry endpoint`
- **Corpo**: **SEMPRE em português** (template obrigatório) — o quê, por quê, como testar, riscos, evidências

### 9.2 Code Review Comments
- **Idioma**: Português | **Tom**: Construtivo, específico, com sugestão
- **Criticidade**: P0 (bloqueante), P1 (importante), P2 (sugestão)

### 9.3 Trackers (opcional)
- **Título**: Verbo no infinitivo em português. ✅ "Corrigir cálculo de juros" ❌ "Juros errado"
- **Tags**: `frontend`, `backend`, `banco`, `hotfix`, `sprint`

### 9.4 Notificações externas (opcional)
- **Nunca sem aprovação explícita do usuário** (guard-rail)

---

> Seções removidas (10. Priorização, 12. Versionamento, 14. Conventional Commits) — ver nota no índice.

## 10. Variáveis de Ambiente

| Convenção | Exemplo |
|-----------|---------|
| `UPPER_SNAKE_CASE` | `DATABASE_HOST`, `API_PORT` |
| Prefixo por domínio | `MYSQL_HOST`, `REDIS_URL`, `JWT_SECRET` |
| `.env` nunca versionado | Sempre no `.gitignore` |
| `.env.example` sempre atualizado | Valores mock |
| Secrets nunca em código | Nem em comentários ou commits |

## 11. Logs e Observabilidade

> Seções removidas — ver nota no índice.

| Nível | Quando usar | Exemplo |
|-------|-------------|---------|
| `error` | Ação humana imediata | Falha de pagamento, API externa offline |
| `warn` | Inesperado mas não crítico | Retry de integração, rate limit próximo |
| `info` | Evento importante do fluxo | Pedido criado, NFe emitida, email enviado |
| `debug` | Detalhado para debugging | Parâmetros de query, response de API externa |

**Regras:** (1) Nunca logar dados sensíveis (senhas, CPF, tokens). (2) Sempre incluir correlation ID (`X-Request-Id`). (3) Log estruturado (JSON). (4) `console.log` proibido em produção.

---

## 12. Referências a Scripts e Configs

Como referenciar scripts, skills, configs e ADRs no workbench:

| Tipo | Formato | Exemplo | O agente deve... |
|------|---------|---------|------------------|
| **Script (CLI)** | `` `node .opencode/scripts/<script>.js <args>` `` | `` `node .opencode/scripts/pipeline.js validate <file>` `` | Executar o comando no terminal |
| **Skill (path)** | `` `@.opencode/skills/<nome>` `` | `` `@.opencode/skills/ado-preflight` `` | Ler o documento com `Read` tool |
| **Skill (delegação)** | `` `skill("<nome>")` `` | `` `skill("ado-preflight")` `` | Carregar e executar a skill |
| **Config (JSON)** | `` `@.opencode/config/<arquivo>.json (<campo>)` `` | `` `@.opencode/config/pipeline-rules.json (fases)` `` | Ler o arquivo com `Read` tool |
| **ADR** | `` `@.opencode/backlog/adr/<arquivo>.md (R#)` `` | `` `@.opencode/backlog/adr/ADR-004-sprint-tasks.md (R4)` `` | Ler a regra de negócio no ADR |

**Regras:**
1. **Scripts** são referenciados como CLI (comando executável) — `` `node .opencode/scripts/<script>.js` ``.
2. **Documentos** (skills, ADRs, configs) usam path direto — `` `@.opencode/<path>` ``.

---

## Evolução deste Documento

Documento **vivo**. Propostas via PR: branch `feat/update-conventions`, editar, abrir PR para `main`, **2 aprovações** mínimas.
> Mudanças que afetam convenções existentes devem ser comunicadas à equipe com período de transição de 1 sprint.
