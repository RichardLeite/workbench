# ADR-003: External discovery roots com allowlist explícita

**Status:** Proposto  
**Data:** 2026-11-07  
**Decisores:** Workbench maintainers  
**Fase do plano:** P6 — External discovery roots

## Context

Hoje o Workbench descobre projetos apenas dentro do workspace. `_configured_roots()` e `_repo_candidates()` rejeitam qualquer path que resolva para fora de `workbench_root()`, inclusive roots configurados e `WB_PROJECT_ROOTS`.

Isso protege contra path traversal e symlink/junction escape, mas impede projetos que vivem em outro diretório do usuário. O P6 pede suporte a roots externos sem transformar a descoberta em uma varredura arbitrária do filesystem.

O catálogo e o `wb repo resolve` hoje assumem paths relativos ao workbench e contidos nele. O plugin também ignora paths absolutos ao gerar aliases. A decisão precisa cobrir a identidade do path no catálogo, não apenas o scan.

## Evidence

- `src/workbench/discovery.py` — `_configured_roots`, `_inside_root`, `_relative`, `_repo_candidates`.
- `src/workbench/commands/repo.py` — validação de paths do catálogo.
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

- Adicionar `discovery.external_roots` como allowlist explícita.
- Aceitar entradas absolutas e `~/...`; entradas relativas continuam relativas ao workbench.
- Canonicalizar cada root e cada repositório com `resolve()` antes de comparar com a allowlist.
- Permitir um repositório externo somente se seu path canônico estiver contido em um root explicitamente autorizado.
- Manter `WB_PROJECT_ROOTS` como allowlist adicional, com a mesma validação.
- Rejeitar symlinks/junctions que escapem do root autorizado.
- Não fazer scan recursivo fora dos roots declarados.
- Não clonar automaticamente repositórios externos.

### Path identity

- O catálogo continua usando paths relativos ao workbench.
- Para repos externos, o valor será `../<caminho>` (relativo ao workbench), não um path absoluto.
- `_relative`/`repo resolve` passam a aceitar `..` somente quando o path canônico estiver contido em um root autorizado.
- O plugin pode gerar alias com `../...`, que começa com `.` e é tratado como referência local string pelo OpenCode.
- Qualquer path `..` que escape da allowlist é rejeitado no scan e na resolução.

### Documentation

A introdução de `discovery.external_roots` deve atualizar:

- `AGENTS.md` — descoberta e roots;
- `README.md` — configuração de roots;
- `docs/opencode.md` — resolução de projetos e aliases.

## Consequences

### Positivas

- Permite projetos fora do Workbench sem abrir o filesystem inteiro.
- Mantém o modelo de segurança baseado em allowlist.
- Erros de root inválido são explícitos e não derrubam o sync.
- Mantém o catálogo relativo ao workbench, sem paths absolutos dependentes da máquina.

### Negativas

- Configuração adicional para o usuário.
- Roots externos podem ficar indisponíveis entre máquinas.
- Paths `../` exigem validação cuidadosa em `repo resolve`.
- A resolução de symlink adiciona custo e casos de teste.

## Trade-offs

- **Ganho:** flexibilidade com confinamento explícito.
- **Custo:** mais validação e configuração.
- **Aceito:** roots externos não são descobertos automaticamente.
- **Não aceito:** aceitar `..`, symlink ou junction que escape da allowlist; nem paths absolutos no catálogo.

## Risks

| Risco | Impacto | Mitigação |
|---|---|---|
| Path traversal via `..` | Alto | Canonicalizar e validar containment antes de qualquer scan |
| Symlink/junction escape | Alto | Comparar `resolve()` do root e do repo |
| `_relative` falhar para external | Alto | Usar caminho relativo controlado (`../`) somente após validar a allowlist |
| Scan acidental de diretório enorme | Médio | Limitar aos roots declarados e à profundidade atual de descoberta |
| Alias externo inválido no OpenCode | Médio | Testar `../` no plugin e no `opencode debug config` |
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
- Testar que o catálogo grava path `../...` estável e que `wb repo resolve` aceita apenas quando autorizado.
- Testar que o plugin gera alias `../...` e que `opencode debug config` o aceita.
- Testar que roots internos continuam funcionando sem regressão.
- Executar `wb projects scan/sync/list`, `wb repo resolve` e a suíte Python.
