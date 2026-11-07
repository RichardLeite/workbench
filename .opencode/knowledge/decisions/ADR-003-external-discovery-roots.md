# ADR-003: External discovery roots com allowlist explícita

**Status:** Proposto  
**Data:** 2026-11-07  
**Decisores:** Workbench maintainers  
**Fase do plano:** P6 — External discovery roots

## Context

Hoje o Workbench descobre projetos apenas dentro do workspace. `_configured_roots()` e `_repo_candidates()` rejeitam qualquer path que resolva para fora de `workbench_root()`, inclusive roots configurados e `WB_PROJECT_ROOTS`.

Isso protege contra path traversal e symlink/junction escape, mas impede projetos que vivem em outro diretório do usuário. O P6 pede suporte a roots externos sem transformar a descoberta em uma varredura arbitrária do filesystem.

O plugin também precisa gerar aliases para repositórios externos; caminhos absolutos são ignorados hoje, então a decisão de descoberta precisa considerar a estratégia de referência do OpenCode.

## Evidence

- `src/workbench/discovery.py` — `_configured_roots`, `_inside_root`, `_repo_candidates`.
- `src/workbench/commands/projects.py` — `projects scan/sync/list`.
- `.opencode/plugins/projects.ts` — geração de aliases; paths absolutos são ignorados.
- `tests/unit/test_discovery.py` — roots, ignore, overlay e prefixos.
- `.opencode/config/project-mapping.json` — `discovery.roots`.

## Options

1. **Manter apenas roots dentro do workspace**
   - Seguro e simples.
   - Obriga clone/cópia para dentro do Workbench.
   - Não atende projetos externos.

2. **Permitir qualquer path externo**
   - Atende todos os casos.
   - Abre risco de varredura e exposição de diretórios arbitrários.
   - Inaceitável sem confinamento.

3. **Allowlist explícita de roots externos com canonicalização (recomendado)**
   - Novos roots só entram por configuração explícita.
   - Paths são canonicalizados e symlinks/junctions são verificados.
   - Roots ausentes ou inválidos geram warning, não erro fatal.
   - A descoberta continua limitada aos roots declarados.

4. **Symlink/junction dentro do workspace apontando para fora**
   - Não muda a configuração.
   - O path canônico ainda escapa; exige a mesma proteção.
   - Pode confundir a resolução de aliases.

## Decision

Adotar a **opção 3**:

- Adicionar `discovery.external_roots` ao catálogo, como allowlist explícita.
- Aceitar entradas absolutas e `~/...`; entradas relativas continuam relativas ao workbench.
- Canonicalizar cada root e cada repositório com `resolve()` antes de comparar com a allowlist.
- Permitir um repositório externo somente se seu path canônico estiver contido em um root explicitamente autorizado.
- Manter `WB_PROJECT_ROOTS` como allowlist adicional, com a mesma validação.
- Rejeitar symlinks/junctions que escapem do root autorizado.
- Não fazer scan recursivo fora dos roots declarados.
- Não clonar automaticamente repositórios externos.

Para aliases, a estratégia inicial será expor apenas paths que possam ser representados como referência local válida pelo OpenCode; absolute paths continuam fora do plugin até que a compatibilidade seja comprovada. Roots externos sem alias válido continuam disponíveis para `wb repo resolve` e para o catálogo, mas não geram `@alias`.

## Consequences

### Positivas

- Permite projetos fora do Workbench sem abrir o filesystem inteiro.
- Mantém o modelo de segurança baseado em allowlist.
- Erros de root inválido são explícitos e não derrubam o sync.
- Cria uma base para futura política de roots por projeto.

### Negativas

- Configuração adicional para o usuário.
- Roots externos podem ficar indisponíveis entre máquinas.
- Aliases externos exigem uma decisão separada de path/portabilidade.
- A resolução de symlink adiciona custo e casos de teste.

## Trade-offs

- **Ganho:** flexibilidade com confinamento explícito.
- **Custo:** mais validação e configuração.
- **Aceito:** roots externos não são descobertos automaticamente.
- **Não aceito:** aceitar `..`, symlink ou junction que escape da allowlist.

## Risks

| Risco | Impacto | Mitigação |
|---|---|---|
| Path traversal via `..` | Alto | Canonicalizar e validar containment antes de qualquer scan |
| Symlink/junction escape | Alto | Comparar `resolve()` do root e do repo |
| Scan acidental de diretório enorme | Médio | Limitar aos roots declarados e à profundidade atual de descoberta |
| Alias externo inválido no OpenCode | Médio | Não gerar alias até validar o formato; manter descoberta desacoplada |
| Config divergente entre máquinas | Baixo | Warning para root ausente e documentação de portabilidade |

## Rollback

- Remover `discovery.external_roots` e voltar a rejeitar paths externos.
- Manter a validação de symlink, que também protege roots internos.
- Nenhum projeto ou arquivo é migrado; apenas a configuração de descoberta muda.
- O rollback não afeta P1–P5.

## Validation

- **Red:** root externo não autorizado deve ser ignorado com warning.
- **Green:** root externo listado e válido deve ser descoberto.
- Testar symlink/junction que aponta para fora do root autorizado.
- Testar root inexistente e root com `..`.
- Testar que um repo fora de todos os roots não é descoberto.
- Testar que roots internos continuam funcionando sem regressão.
- Executar `wb projects scan/sync/list` e a suíte Python.
