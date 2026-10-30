"""Migração de specs do formato flat para o formato modular."""

from __future__ import annotations

import re
import sys
from argparse import ArgumentParser, Namespace, _SubParsersAction
from datetime import date
from pathlib import Path

from workbench.paths import workbench_root


def register(subparsers: _SubParsersAction) -> None:
    parser: ArgumentParser = subparsers.add_parser("spec", help="Manipulação de specs.")
    parser.add_argument("--json", action="store_true", help="Reservado para saída JSON.")
    spec_sub = parser.add_subparsers(dest="spec_command", required=True)
    migrate = spec_sub.add_parser("migrate", help="Migra uma spec para o formato modular.")
    migrate.add_argument("path")
    migrate.add_argument("--dry-run", action="store_true")
    migrate.set_defaults(handler=_run_migrate)


def _extract_section(content: str, heading: str) -> str:
    match = re.search(
        rf"^##\s+{re.escape(heading)}\s*$(.*?)(?=^##\s|\Z)",
        content,
        re.M | re.S,
    )
    return match.group(1).strip() if match else ""


def _first_section(content: str, *headings: str) -> str:
    for heading in headings:
        value = _extract_section(content, heading)
        if value:
            return value
    return ""


def _build_modules(
    objective: str,
    scope: str,
    validation: str,
    risks: str,
) -> tuple[str, int]:
    parts: list[str] = []
    scope_lines = [line for line in scope.split("\n") if line.strip().startswith(("-", "*"))]
    scope_items = [re.sub(r"^[-*]\s*", "", line.strip()) for line in scope_lines]
    scope_items = scope_items or ["Implementar conforme especificação"]

    base_description = (
        objective or scope or "Implementar a funcionalidade descrita na especificação original."
    )
    module_count = 0
    if objective or scope:
        module_count += 1
        parts.append(
            f"### Módulo {module_count}: Implementação Base\n\n"
            "**Camada:** backend\n"
            "**Dependências:** Nenhuma\n"
            "**Estimativa:** *(a definir)*\n\n"
            "#### Descrição\n\n"
            f"{base_description}\n\n"
            "#### Requisitos\n\n"
            "##### Requisito: FuncionalidadePrincipal\n\n"
            "O sistema SHALL implementar a funcionalidade conforme especificado.\n\n"
            "###### Cenário: ComportamentoPadrao\n"
            "- **GIVEN** o estado atual do sistema\n"
            "- **WHEN** a ação principal é executada\n"
            "- **THEN** o resultado esperado é obtido\n\n"
            "#### Testes (TDD)\n\n"
            "N/A — Migrado de spec antiga sem especificação de testes.\n\n"
            "#### Implementação\n\n"
            + "\n".join(f"- [ ] {item}" for item in scope_items)
            + "\n\n#### Validação\n\n"
            "- [ ] **Testes:** N/A (spec migrada)\n"
            "- [ ] **Auto-review:** @revisor aprovou o módulo\n"
            "- [ ] **Checkpoint:** sem issues graves\n\n"
            "---\n\n"
        )

    if scope and re.search(r"frontend|ui|tela|component|react|página", scope, re.I):
        module_count += 1
        parts.append(
            f"### Módulo {module_count}: Interface do Usuário\n\n"
            "**Camada:** frontend\n"
            f"**Dependências:** Módulo {module_count - 1}\n"
            "**Estimativa:** *(a definir)*\n\n"
            "#### Descrição\n\n"
            "Implementar a interface do usuário conforme especificado.\n\n"
            "#### Requisitos\n\n"
            "##### Requisito: InterfaceFuncional\n\n"
            "O sistema SHALL exibir a interface conforme especificado.\n\n"
            "###### Cenário: ExibicaoPadrao\n"
            "- **GIVEN** o usuário acessa a funcionalidade\n"
            "- **WHEN** a tela é carregada\n"
            "- **THEN** os dados são exibidos corretamente\n\n"
            "#### Testes (TDD)\n\n"
            "N/A — Migrado de spec antiga.\n\n"
            "#### Implementação\n\n"
            "- [ ] Implementar componentes de UI\n"
            "- [ ] Integrar com API\n\n"
            "#### Validação\n\n"
            "- [ ] **Testes:** N/A (spec migrada)\n"
            "- [ ] **Auto-review:** @revisor aprovou o módulo\n"
            "- [ ] **Checkpoint:** sem issues graves\n\n"
            "---\n"
        )

    if validation:
        module_count += 1
        parts.append(
            f"### Módulo {module_count}: Validação\n\n"
            "**Camada:** docs\n"
            f"**Dependências:** Módulo {module_count - 1}\n"
            "**Estimativa:** *(a definir)*\n\n"
            "#### Descrição\n\n"
            f"{validation}\n\n"
            "#### Implementação\n\n"
            "- [ ] Validar cenários de teste\n"
            "- [ ] Verificar comportamento esperado\n\n"
            "#### Validação\n\n"
            "- [ ] **Testes:** validados conforme critérios\n"
            "- [ ] **Auto-review:** @revisor aprovou o módulo\n"
            "- [ ] **Checkpoint:** sem issues graves\n\n"
            "---\n"
        )

    if module_count == 0:
        module_count = 1
        parts.append(
            "### Módulo 1: Implementação\n\n"
            "**Camada:** backend\n"
            "**Dependências:** Nenhuma\n"
            "**Estimativa:** *(a definir)*\n\n"
            "#### Descrição\n\n"
            "Implementar conforme especificação original.\n\n"
            "#### Requisitos\n\n"
            "##### Requisito: FuncionalidadePrincipal\n\n"
            "O sistema SHALL implementar a funcionalidade.\n\n"
            "###### Cenário: ComportamentoPadrao\n"
            "- **GIVEN** o estado atual\n"
            "- **WHEN** a ação é executada\n"
            "- **THEN** o resultado esperado é obtido\n\n"
            "#### Implementação\n\n"
            "- [ ] Implementar conforme especificação\n\n"
            "#### Validação\n\n"
            "- [ ] **Auto-review:** @revisor aprovou\n"
            "- [ ] **Checkpoint:** sem issues graves\n\n"
            "---\n"
        )

    return "".join(parts), module_count


def migrate_spec(spec_path: Path, dry_run: bool = False, root: Path | None = None) -> int:
    base = root or workbench_root()
    full_path = spec_path if spec_path.is_absolute() else base / spec_path
    if not full_path.is_file():
        print(f"❌ Arquivo não encontrado: {full_path}", file=sys.stderr)
        return 1

    content = full_path.read_text(encoding="utf-8")
    if re.search(r"^### Módulo \d+:", content, re.M):
        print(f"✅ Spec já está no formato modular: {spec_path.name}")
        return 0

    title_match = re.search(r"^#\s+(.+)", content, re.M)
    title = title_match.group(1).strip() if title_match else spec_path.stem
    print(f"\n📋 Migrando: {title}")

    objective = _first_section(content, "Objective", "Objetivo", "Descrição")
    scope = _first_section(content, "Scope", "Escopo")
    acceptance = _first_section(
        content, "Acceptance criteria", "Critérios de Aceite", "Critérios de Aceitação"
    )
    risks = _first_section(content, "Risks", "Riscos")
    validation = _first_section(content, "Validation", "Validação")
    notes = _first_section(content, "Notes", "Notas", "Notas Técnicas")
    task_match = re.search(r"TASK[:\s]+([\w-]+)", content, re.I)
    task_id = task_match.group(1) if task_match else "TASK-XXXX"

    modules, module_count = _build_modules(objective, scope, validation, risks)

    prerequisitos = (
        ("- Riscos identificados: " + risks) if risks else "*(identificar durante execução)*"
    )
    modular = (
        f"# Spec: {title}\n\n"
        f"> **Gerado em:** {date.today().isoformat()}\n"
        "> **Esquema:** Spec Executável v1 — Migrado automaticamente do formato antigo\n"
        "> **Uso:** Projetada para ser executada pelo `/execute-spec`\n\n"
        "## TASK\n\n"
        f"{task_id}\n\n"
        "## Objetivo\n\n"
        f"{objective or '*(extrair do contexto original)*'}\n\n"
        "## Pré-requisitos\n\n"
        f"{prerequisitos}\n\n"
        "---\n\n"
        "## Módulos\n\n"
        "> Cada módulo é uma unidade atômica: testes primeiro (se o projeto tiver infra) "
        "→ implementação → validação.\n"
        "> A ordem dos módulos é a ordem de execução. Módulos sem dependências podem "
        "ser paralelizados.\n\n"
        "---\n\n"
        f"{modules}\n"
        "## Dependências Externas\n\n"
        f"{('- ' + risks) if risks else '- Nenhuma identificada'}\n"
    )
    if notes:
        modular += f"\n## Notas Técnicas\n\n{notes}\n"
    if acceptance:
        modular += f"\n## Critérios de Aceite (originais)\n\n{acceptance}\n"

    if dry_run:
        print("\n📄 Preview da spec migrada:")
        print("─" * 60)
        print(modular)
        print("─" * 60)
        print("\n⚠️  Dry-run — arquivo não foi modificado.")
        print("   Remova --dry-run para salvar as alterações.")
        return 0

    backup_path = (
        full_path.with_suffix(".backup.md")
        if full_path.suffix == ".md"
        else full_path.with_name(full_path.name + ".backup.md")
    )
    backup_path.write_text(content, encoding="utf-8")
    print(f"💾 Backup salvo em: {backup_path}")
    full_path.write_text(modular, encoding="utf-8")
    print(f"✅ Spec migrada: {spec_path.name}")
    print(f"   Módulos criados: {module_count}")
    print(f"   Backup: {backup_path.name}")
    return 0


def _run_migrate(args: Namespace) -> int:
    return migrate_spec(Path(args.path), dry_run=args.dry_run)
