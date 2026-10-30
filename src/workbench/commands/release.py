"""Criação de release no GitHub a partir de uma sprint do Azure DevOps."""

from __future__ import annotations

import json
import os
import re
import sys
import time
from argparse import ArgumentParser, Namespace, _SubParsersAction
from datetime import date
from typing import Any

from workbench.errors import MissingDependencyError
from workbench.paths import workbench_root
from workbench.process import run
from workbench.vision import load_env

WI_TYPE_EMOJI = {
    "Bug": "🐛",
    "Feature": "✨",
    "Product Backlog Item": "📋",
    "PBI": "📋",
    "Task": "🔧",
    "User Story": "📖",
    "Issue": "⚠️",
    "Epic": "🏗️",
}

WI_TYPE_ORDER = [
    "Epic",
    "Feature",
    "Product Backlog Item",
    "PBI",
    "User Story",
    "Bug",
    "Task",
    "Issue",
]

ADO_TIMEOUT_SECONDS = 15


def register(subparsers: _SubParsersAction) -> None:
    parser: ArgumentParser = subparsers.add_parser(
        "release",
        help="Cria release no GitHub a partir de uma sprint do Azure DevOps.",
        description=(
            "Cria GitHub Release com changelog gerado a partir de uma sprint do Azure DevOps. "
            "Sem flags e com TTY, abre o wizard interativo."
        ),
    )
    parser.add_argument("--sprint", default=None, help='Nome da sprint (ex: "Sprint 42").')
    parser.add_argument("--tag", default=None, help="Tag da release (ex: v1.9.10).")
    parser.add_argument("--repo", default=None, help="Repositório GitHub (owner/repo).")
    parser.add_argument("--preview", action="store_true", help="Apenas gera as notas.")
    parser.add_argument("--list-sprints", action="store_true", help="Lista sprints do ADO.")
    parser.add_argument("--json", action="store_true", help="Reservado para saída JSON.")
    parser.set_defaults(handler=_run_release)


def _config() -> dict[str, str]:
    load_env()
    return {
        "org": os.environ.get("ADO_ORG") or os.environ.get("AZURE_DEVOPS_ORG", ""),
        "project": os.environ.get("ADO_PROJECT", ""),
        "team": os.environ.get("ADO_TEAM", ""),
        "github_org": os.environ.get("GITHUB_ORG") or os.environ.get("GITHUB_OWNER", ""),
    }


def _ado_token() -> str | None:
    load_env()
    token = os.environ.get("ADO_MCP_AUTH_TOKEN")
    if token:
        return token
    env_path = workbench_root() / ".env"
    if env_path.is_file():
        match = re.search(
            r"^ADO_MCP_AUTH_TOKEN=(.+)$",
            env_path.read_text(encoding="utf-8"),
            re.M,
        )
        if match:
            return match.group(1).strip()
    return None


def ado_request(api_path: str, method: str = "GET", body: Any = None) -> dict[str, Any]:
    import base64
    import urllib.error
    import urllib.parse
    import urllib.request

    config = _config()
    token = _ado_token()
    if not token:
        raise ValueError("ADO_MCP_AUTH_TOKEN não encontrado no .env")
    if not config["org"]:
        raise ValueError("ADO_ORG/AZURE_DEVOPS_ORG não configurado")
    if not config["project"]:
        raise ValueError("ADO_PROJECT não configurado")

    encoded_project = urllib.parse.quote(config["project"], safe="")
    encoded_team = urllib.parse.quote(config["team"], safe="")
    separator = "&" if "?" in api_path else "?"
    if api_path.startswith("/work/teamsettings") or api_path.startswith("/wit/wiql"):
        url = (
            f"https://dev.azure.com/{config['org']}/{encoded_project}/{encoded_team}"
            f"/_apis{api_path}{separator}api-version=7.0"
        )
    else:
        url = (
            f"https://dev.azure.com/{config['org']}/{encoded_project}"
            f"/_apis{api_path}{separator}api-version=7.0"
        )

    auth = base64.b64encode(f":{token}".encode()).decode("ascii")
    headers = {"Authorization": f"Basic {auth}", "Content-Type": "application/json"}
    data = json.dumps(body).encode("utf-8") if body is not None else None
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=ADO_TIMEOUT_SECONDS) as response:
            raw = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        raise ValueError(f"ADO retornou HTTP {exc.code} para {url}") from exc
    except Exception as exc:
        raise ValueError(f"Falha na requisição ADO: {exc}") from exc
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Falha ao parsear resposta ADO: {raw[:200]}") from exc


def list_sprints() -> list[dict[str, Any]]:
    data = ado_request("/work/teamsettings/iterations")
    values = data.get("value")
    if not isinstance(values, list):
        return []
    return [
        {
            "id": item.get("id"),
            "name": item.get("name"),
            "path": item.get("path") or None,
            "timeFrame": (item.get("attributes") or {}).get("timeFrame"),
            "startDate": (item.get("attributes") or {}).get("startDate"),
            "finishDate": (item.get("attributes") or {}).get("finishDate"),
        }
        for item in values
    ]


def find_sprint(sprint_name: str) -> dict[str, Any]:
    sprints = list_sprints()
    normalized = sprint_name.lower().strip()
    for sprint in sprints:
        if str(sprint.get("name", "")).lower() == normalized:
            return {**sprint, "all": sprints}
    for sprint in sprints:
        if normalized in str(sprint.get("name", "")).lower():
            return {**sprint, "all": sprints}
    for sprint in sprints:
        if normalized in str(sprint.get("path") or "").lower():
            return {**sprint, "all": sprints}
    return {"all": sprints}


def get_work_items_from_sprint(sprint_id: str) -> list[dict[str, Any]]:
    data = ado_request(f"/work/teamsettings/iterations/{sprint_id}/workitems")
    relations = data.get("workItemRelations")
    if not isinstance(relations, list) or not relations:
        return []
    ids = sorted(
        {
            relation["target"]["id"]
            for relation in relations
            if isinstance(relation.get("target"), dict) and relation["target"].get("id")
        }
    )
    details: list[dict[str, Any]] = []
    fields = "System.Id,System.Title,System.WorkItemType,System.State,System.Parent,System.Tags"
    for index in range(0, len(ids), 200):
        batch = ids[index : index + 200]
        detail_data = ado_request(f"/wit/workitems?ids={','.join(map(str, batch))}&fields={fields}")
        if isinstance(detail_data.get("value"), list):
            details.extend(detail_data["value"])
        time.sleep(0.1)
    return details


def get_work_item_details(work_item_id: int) -> dict[str, Any]:
    return ado_request(
        f"/wit/workitems/{work_item_id}"
        "?fields=System.Id,System.Title,System.WorkItemType,System.State,System.Parent,System.Tags"
    )


def group_work_items(work_items: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for item in work_items:
        item_type = (item.get("fields") or {}).get("System.WorkItemType") or "Task"
        key = item_type if item_type in WI_TYPE_ORDER else "Task"
        groups.setdefault(key, []).append(item)
    ordered: dict[str, list[dict[str, Any]]] = {}
    for item_type in WI_TYPE_ORDER:
        if item_type in groups:
            ordered[item_type] = groups[item_type]
    for item_type, items in groups.items():
        ordered.setdefault(item_type, items)
    return ordered


def extract_task_id_from_title(title: str) -> str | None:
    match = re.search(r"(TASK[-\s]?\d+)", title, re.I)
    return match.group(1).replace(" ", "-").upper() if match else None


def generate_release_notes(
    tag: str,
    sprint: str,
    work_items: list[dict[str, Any]],
    repo: str | None,
    child_tasks: list[dict[str, Any]],
) -> str:
    from urllib.parse import quote

    config = _config()
    today = date.today().isoformat()
    grouped = group_work_items(work_items)
    parents = [
        item
        for item in work_items
        if (item.get("fields") or {}).get("System.WorkItemType") not in {"Task", "Issue"}
    ]
    notes = f"## {tag} ({today})\n\n"
    notes += f"> Sprint: **{sprint}**  \n"
    notes += f"> Work items: {len(parents)} pais, {len(work_items)} total\n\n"
    notes += "### 🚀 O que foi entregue\n\n"

    has_content = False
    for item_type in WI_TYPE_ORDER:
        items = grouped.get(item_type)
        if not items:
            continue
        has_content = True
        emoji = WI_TYPE_EMOJI.get(item_type, "📌")
        label = "PBIs" if item_type == "Product Backlog Item" else f"{item_type}s"
        notes += f"#### {emoji} {label}\n\n"
        for item in items:
            item_id = item.get("id")
            fields = item.get("fields") or {}
            title = fields.get("System.Title") or "(sem título)"
            task_id = extract_task_id_from_title(title)
            ado_url = (
                f"https://dev.azure.com/{config['org']}/"
                f"{quote(config['project'], safe='')}/_workitems/edit/{item_id}"
            )
            notes += f"- **#{item_id}** — [{title}]({ado_url})"
            if task_id:
                notes += f" (`{task_id}`)"
            notes += "\n"
        notes += "\n"

    if not has_content:
        notes += "_Nenhum work item encontrado._\n\n"

    if child_tasks:
        notes += "#### 🔧 Tarefas técnicas\n\n"
        for task in child_tasks:
            task_id = task.get("id")
            fields = task.get("fields") or {}
            title = fields.get("System.Title") or "(sem título)"
            parent_id = fields.get("System.Parent") or ""
            ado_url = (
                f"https://dev.azure.com/{config['org']}/"
                f"{quote(config['project'], safe='')}/_workitems/edit/{task_id}"
            )
            notes += f"- **#{task_id}** — [{title}]({ado_url})"
            if parent_id:
                notes += f" (parent: #{parent_id})"
            notes += "\n"
        notes += "\n"

    if repo:
        notes += "### 📂 Repositórios\n\n"
        notes += f"- [{repo}](https://github.com/{repo})\n\n"

    notes += "### 📌 Pós-release\n\n"
    notes += "1. Verificar deploy em produção\n"
    notes += "2. Fazer merge reverso `main → release`\n"
    notes += "3. Comunicar o squad\n"
    return notes


def get_current_repo() -> str | None:
    result = run(["git", "remote", "get-url", "origin"], timeout=5)
    if not result.ok or not result.stdout.strip():
        return None
    match = re.search(r"github\.com[/:]([\w-]+/[\w-]+?)(?:\.git)?$", result.stdout.strip())
    return match.group(1) if match else None


def get_last_tag() -> str | None:
    result = run(["git", "describe", "--tags", "--abbrev=0"], timeout=5)
    return result.stdout.strip() if result.ok and result.stdout.strip() else None


def get_commits_since_tag(tag: str | None) -> list[dict[str, str]]:
    command = ["git", "log", "--oneline", "--no-merges", f"{tag}..HEAD" if tag else "--all"]
    result = run(command, timeout=10)
    if not result.ok or not result.stdout.strip():
        return []
    commits = []
    for line in result.stdout.splitlines():
        match = re.match(r"^([a-f0-9]+)\s+(.+)$", line)
        commits.append(
            {"hash": match.group(1), "message": match.group(2)}
            if match
            else {"hash": "", "message": line}
        )
    return commits


def extract_task_ids(commits: list[dict[str, str]]) -> list[str]:
    ids: list[str] = []
    for commit in commits:
        match = re.search(r"(TASK[-\s]?\d+|AB#?\d+)", commit["message"], re.I)
        if match:
            value = match.group(1).replace(" ", "-").upper()
            if value not in ids:
                ids.append(value)
    return ids


def extract_pr_number(message: str) -> str | None:
    match = re.search(r"\(#(\d+)\)", message)
    return match.group(1) if match else None


def suggest_next_tag(last_tag: str | None = None) -> str:
    last_tag = last_tag if last_tag is not None else get_last_tag()
    if not last_tag:
        return "v1.0.0"
    parts = last_tag.replace("v", "").split(".")
    try:
        major, minor, patch = (int(part) for part in (parts + ["0", "0"])[:3])
    except ValueError:
        return "v1.0.0"
    return f"v{major}.{minor}.{patch + 1}"


def create_github_release(tag: str, notes: str, repo: str | None) -> dict[str, Any]:
    tmp_dir = workbench_root() / "tmp"
    tmp_dir.mkdir(parents=True, exist_ok=True)
    notes_file = tmp_dir / f"release-notes-{tag}.md"
    notes_file.write_text(notes, encoding="utf-8")
    args = ["gh", "release", "create", tag]
    if repo:
        args.extend(["--repo", repo])
    args.extend(["--title", tag, "--notes-file", str(notes_file)])
    env = {**os.environ, "GITHUB_TOKEN": ""}
    try:
        result = run(args, cwd=os.getcwd(), timeout=60, env=env)
    except MissingDependencyError as exc:
        return {"success": False, "error": str(exc), "notesFile": str(notes_file), "notes": notes}
    if not result.ok:
        return {
            "success": False,
            "error": result.stderr.strip() or result.stdout.strip(),
            "notesFile": str(notes_file),
            "notes": notes,
        }
    notes_file.unlink(missing_ok=True)
    return {
        "success": True,
        "url": f"https://github.com/{repo or '(repo)'}/releases/tag/{tag}",
    }


def _require_token() -> bool:
    if _ado_token():
        return True
    config = _config()
    print("ERRO: ADO_MCP_AUTH_TOKEN não encontrado.", file=sys.stderr)
    print("Adicione no arquivo .env: ADO_MCP_AUTH_TOKEN=seu_pat", file=sys.stderr)
    print(
        f"Gere em: https://dev.azure.com/{config['org']}/_usersSettings/tokens",
        file=sys.stderr,
    )
    return False


def _run_cli(args: Namespace) -> int:
    if not _require_token():
        return 1

    if args.list_sprints:
        try:
            print(json.dumps({"sprints": list_sprints()}, ensure_ascii=False, indent=2))
        except ValueError as exc:
            print(f"ERRO ao listar sprints: {exc}", file=sys.stderr)
            return 1
        return 0

    if not args.sprint:
        print("ERRO: --sprint é obrigatório. Use --help para ajuda.", file=sys.stderr)
        return 1
    repo = args.repo or get_current_repo()
    if not repo:
        print("ERRO: --repo é obrigatório e não pôde ser auto-detectado.", file=sys.stderr)
        print('  → Especifique: --repo "org/nome-repo"', file=sys.stderr)
        return 1

    tag = args.tag or suggest_next_tag()
    if not args.tag:
        print(f"ℹ️ Tag não especificada. Usando: {tag}", file=sys.stderr)
    print(f'🔍 Buscando sprint "{args.sprint}" no Azure DevOps...', file=sys.stderr)

    try:
        sprint = find_sprint(args.sprint)
        if not sprint.get("id"):
            print(f'❌ Sprint "{args.sprint}" não encontrada.', file=sys.stderr)
            print("\nSprints disponíveis:", file=sys.stderr)
            for item in sprint.get("all") or []:
                print(
                    f'  - "{item.get("name")}" ({item.get("path") or "sem timeFrame"})',
                    file=sys.stderr,
                )
            return 1
        print(
            f"✅ Sprint encontrada: {sprint.get('name')} ({sprint.get('path') or ''})",
            file=sys.stderr,
        )
        print("📦 Buscando work items da sprint...", file=sys.stderr)
        work_items = get_work_items_from_sprint(str(sprint["id"]))
        if not work_items:
            print("⚠️ Nenhum work item encontrado na sprint.", file=sys.stderr)
            return 1
        parents = [
            item
            for item in work_items
            if (item.get("fields") or {}).get("System.WorkItemType") != "Task"
        ]
        child_tasks = [
            item
            for item in work_items
            if (item.get("fields") or {}).get("System.WorkItemType") == "Task"
        ]
        print(f"📊 {len(work_items)} work items encontrados:", file=sys.stderr)
        print(f"   - {len(parents)} pais (PBIs, Bugs, Features)", file=sys.stderr)
        print(f"   - {len(child_tasks)} tarefas filhas", file=sys.stderr)

        notes = generate_release_notes(tag, str(sprint.get("name")), work_items, repo, child_tasks)
        if args.preview:
            print(
                json.dumps(
                    {
                        "action": "preview",
                        "tag": tag,
                        "repo": repo,
                        "sprint": sprint.get("name"),
                        "workItemsTotal": len(work_items),
                        "parentCount": len(parents),
                        "taskCount": len(child_tasks),
                        "notesPreview": notes,
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )
            return 0

        print(f"🏷️  Criando GitHub Release {tag}...", file=sys.stderr)
        result = create_github_release(tag, notes, repo)
        if result["success"]:
            print(
                json.dumps(
                    {
                        "action": "created",
                        "tag": tag,
                        "repo": repo,
                        "sprint": sprint.get("name"),
                        "workItemsTotal": len(work_items),
                        "url": result["url"],
                    },
                    ensure_ascii=False,
                    indent=2,
                )
            )
            return 0
        print(f"❌ Erro ao criar release: {result['error']}", file=sys.stderr)
        print(f"📄 Notas salvas em: {result['notesFile']}", file=sys.stderr)
        return 1
    except ValueError as exc:
        print(f"ERRO: {exc}", file=sys.stderr)
        return 1


def _run_wizard() -> int:
    if not _require_token():
        return 1
    try:
        sprints = list_sprints()
    except ValueError as exc:
        print(f"ERRO ao listar sprints: {exc}", file=sys.stderr)
        return 1
    if not sprints:
        print("ERRO: nenhuma sprint encontrada.", file=sys.stderr)
        return 1
    print("Sprints disponíveis:")
    for index, sprint in enumerate(sprints, 1):
        print(f"  {index}. {sprint.get('name')} ({sprint.get('timeFrame') or 'sem timeFrame'})")
    choice = input("Escolha a sprint (número): ").strip()
    try:
        sprint = sprints[int(choice) - 1]
    except (ValueError, IndexError):
        print("ERRO: escolha inválida.", file=sys.stderr)
        return 1
    repo = get_current_repo() or input("Repositório GitHub (owner/repo): ").strip()
    if not repo:
        print("ERRO: repositório é obrigatório.", file=sys.stderr)
        return 1
    tag = suggest_next_tag()
    tag_input = input(f"Tag [{tag}]: ").strip()
    tag = tag_input or tag
    work_items = get_work_items_from_sprint(str(sprint["id"]))
    parents = [
        item
        for item in work_items
        if (item.get("fields") or {}).get("System.WorkItemType") != "Task"
    ]
    child_tasks = [
        item
        for item in work_items
        if (item.get("fields") or {}).get("System.WorkItemType") == "Task"
    ]
    print(f"{len(work_items)} work items ({len(parents)} pais, {len(child_tasks)} tarefas)")
    notes = generate_release_notes(tag, str(sprint.get("name")), work_items, repo, child_tasks)
    print(notes)
    if input("Criar release? [s/N]: ").strip().lower() not in {"s", "sim", "y", "yes"}:
        print("Cancelado.")
        return 0
    result = create_github_release(tag, notes, repo)
    if result["success"]:
        print(result["url"])
        return 0
    print(f"ERRO: {result['error']}", file=sys.stderr)
    print(f"Notas salvas em: {result['notesFile']}", file=sys.stderr)
    return 1


def _run_release(args: Namespace) -> int:
    no_flags = not any([args.sprint, args.tag, args.repo, args.preview, args.list_sprints])
    if no_flags and sys.stdin.isatty() and sys.stdout.isatty():
        return _run_wizard()
    return _run_cli(args)
