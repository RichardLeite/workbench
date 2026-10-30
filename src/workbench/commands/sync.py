"""Sincronização da camada OpenCode para Claude Code e Codex CLI."""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from argparse import ArgumentParser, Namespace, _SubParsersAction
from pathlib import Path
from typing import Any

from workbench.config import load_opencode
from workbench.paths import workbench_root

OPUS = {"orquestrador"}
HAIKU = {
    "explore",
    "explorador",
    "pedreiro",
    "revisor",
    "code-reviewer",
    "image-analyzer",
    "ux-analyzer",
    "integracoes-power",
    "business-analyst",
}
DEFAULT_MODEL = "sonnet"

EXPECTED_CODEX_AGENTS = [
    "pedreiro",
    "backend-dev",
    "frontend-dev",
    "database-dev",
    "revisor",
    "code-reviewer",
    "security-reviewer",
    "pr-insight",
    "tech-architect",
    "tech-lead",
    "sec-arch",
    "explorador",
    "explore",
    "integracoes-power",
    "image-analyzer",
    "ux-analyzer",
    "scrum-master",
    "business-analyst",
    "product-manager",
    "task-refiner-ado",
    "devops-engineer",
    "qa-engineer",
    "general",
    "planner",
    "architect",
    "arbitro",
    "gestor-tokens",
    "perf-auditor",
    "tdd-guide",
    "vault-updater",
]

ASK_RULES = [
    "Bash(git push --force:*)",
    "Bash(git push -f:*)",
    "Bash(git push --force-with-lease:*)",
    "Bash(git push * main)",
    "Bash(git push origin main:*)",
    "Bash(git push * release)",
    "Bash(git push origin release:*)",
    "Bash(git push * develop)",
    "Bash(git push origin develop:*)",
    "Bash(git push --delete:*)",
    "Bash(git push -d:*)",
    "Bash(git merge:*)",
    "Bash(git rebase:*)",
    "Bash(git revert:*)",
    "Bash(git reset:*)",
    "Bash(git branch -D:*)",
]
DENY_RULES = ["Read(./.env)", "Read(./**/.env)"]


def register(subparsers: _SubParsersAction) -> None:
    parser: ArgumentParser = subparsers.add_parser("sync", help="Sincroniza camadas derivadas.")
    parser.add_argument("--json", action="store_true", help="Reservado para saída JSON.")
    sync_sub = parser.add_subparsers(dest="sync_command", required=True)
    claude = sync_sub.add_parser("claude", help="Gera .claude/ a partir de .opencode/.")
    claude.set_defaults(handler=_run_claude)
    codex = sync_sub.add_parser("codex", help="Valida a ponte .codex/.")
    codex.set_defaults(handler=_run_codex)


def slug(value: str) -> str:
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", value.lower()))


def parse_frontmatter(text: str) -> tuple[dict[str, str], str]:
    match = re.match(r"^---\r?\n([\s\S]*?)\r?\n---\r?\n?", text)
    if not match:
        return {}, text
    frontmatter: dict[str, str] = {}
    for line in match.group(1).splitlines():
        item = re.match(r"^([a-zA-Z_][\w-]*):\s*(.*)$", line)
        if item:
            frontmatter[item.group(1)] = item.group(2).strip().strip("\"'").strip()
    return frontmatter, text[match.end() :]


def model_for(name: str) -> str:
    if name in OPUS:
        return "opus"
    if name in HAIKU:
        return "haiku"
    return DEFAULT_MODEL


def tools_for(config: dict[str, Any]) -> list[str] | None:
    permissions = config.get("permission") or {}
    readonly = permissions.get("write") == "deny" and permissions.get("edit") == "deny"
    if not readonly:
        return None
    tools = ["Read", "Grep", "Glob"]
    if permissions.get("bash") != "deny":
        tools.append("Bash")
    if any(key.startswith("mcp-image") for key in permissions):
        tools.append("mcp__mcp-image")
    if any(key.startswith("azure-devops") for key in permissions):
        tools.append("mcp__azure-devops")
    if any(key.startswith("teams-graph") for key in permissions):
        tools.append("mcp__teams-graph")
    return tools


def prompt_path(prompt_ref: str, root: Path) -> Path | None:
    match = re.search(r"\{file:(.+?)\}", str(prompt_ref or ""))
    if not match:
        return None
    return (root / match.group(1).removeprefix("./")).resolve()


def _header(source: str) -> str:
    return (
        "<!-- AUTO-GERADO por wb sync claude — NÃO editar à mão.\n"
        f"     Fonte: {source}. Rode o sync após alterar a fonte. -->\n\n"
    )


def gen_agents(config: dict[str, Any], root: Path) -> tuple[int, int]:
    agents_dir = root / ".claude" / "agents"
    agents_dir.mkdir(parents=True, exist_ok=True)
    ok = skipped = 0
    for key, agent in (config.get("agent") or {}).items():
        path = prompt_path(agent.get("prompt", ""), root)
        if path is None or not path.is_file():
            print(f"   ⚠️  {key}: prompt não encontrado ({agent.get('prompt')})")
            skipped += 1
            continue
        frontmatter, body = parse_frontmatter(path.read_text(encoding="utf-8"))
        name = slug(frontmatter.get("name") or key)
        tools = tools_for(agent)
        front = f"---\nname: {name}\n"
        description = agent.get("description") or frontmatter.get("description") or name
        front += f"description: {description}\n"
        if tools:
            front += f"tools: {', '.join(tools)}\n"
        front += f"model: {model_for(name)}\n---\n\n"
        relative = path.relative_to(root).as_posix()
        (agents_dir / f"{name}.md").write_text(
            front + _header(relative) + body.lstrip(), encoding="utf-8"
        )
        ok += 1
    print(f"   Agents: {ok} gerados, {skipped} pulados")
    return ok, skipped


def gen_mcp(config: dict[str, Any], root: Path) -> None:
    servers: dict[str, Any] = {}
    for name, server in (config.get("mcp") or {}).items():
        if server.get("enabled") is False:
            continue
        command = server.get("command") or []
        if not command:
            continue
        entry: dict[str, Any] = {"command": command[0], "args": command[1:]}
        if server.get("env"):
            entry["env"] = server["env"]
        servers[name] = entry
    (root / ".mcp.json").write_text(
        json.dumps({"mcpServers": servers}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"   .mcp.json: {len(servers)} servidores")


def gen_settings(root: Path) -> None:
    settings = {
        "$schema": "https://json.schemastore.org/claude-code-settings.json",
        "permissions": {"ask": ASK_RULES, "deny": DENY_RULES, "defaultMode": "acceptEdits"},
        "hooks": {
            "PreToolUse": [
                {
                    "matcher": "Bash",
                    "hooks": [
                        {
                            "type": "command",
                            "command": (
                                'bash "$CLAUDE_PROJECT_DIR/.opencode/hooks/'
                                'block-protected-commit.sh"'
                            ),
                        }
                    ],
                }
            ]
        },
        "enableAllProjectMcpServers": True,
    }
    claude_dir = root / ".claude"
    claude_dir.mkdir(parents=True, exist_ok=True)
    (claude_dir / "settings.json").write_text(
        json.dumps(settings, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(
        f"   settings.json: {len(ASK_RULES)} ask, {len(DENY_RULES)} deny, "
        f"{len(settings['hooks']['PreToolUse'])} PreToolUse hook(s)"
    )


def copy_dir(source: Path, target: Path) -> None:
    shutil.copytree(source, target, dirs_exist_ok=True)


def link_dir(name: str, root: Path) -> None:
    claude_dir = root / ".claude"
    link = claude_dir / name
    source = root / ".opencode" / name
    if link.is_dir():
        print(f"   ok: .claude/{name} já presente")
        return
    if link.exists() or link.is_symlink():
        try:
            link.unlink()
        except OSError:
            pass
    try:
        if sys.platform == "win32":
            result = subprocess.run(
                ["cmd", "/c", "mklink", "/J", str(link), str(source)],
                capture_output=True,
                text=True,
                timeout=30,
            )
            if result.returncode != 0:
                raise OSError(result.stderr.strip() or result.stdout.strip())
            print(f"   junction: .claude/{name} -> .opencode/{name}")
        else:
            link.symlink_to(Path("..") / ".opencode" / name, target_is_directory=True)
            print(f"   symlink: .claude/{name} -> .opencode/{name}")
    except OSError as exc:
        print(f"   ⚠️  link .claude/{name} falhou ({exc}). Fallback: cópia.")
        try:
            copy_dir(source, link)
        except OSError as copy_exc:
            print(f"   ⚠️  cópia .claude/{name} falhou ({copy_exc}). Crie o link à mão.")


def _run_claude(args: Namespace) -> int:
    root = workbench_root()
    print("🔁 OpenCode → Claude Code Sync")
    print(f"   Workbench: {root}\n")
    config = load_opencode(root)
    gen_agents(config, root)
    gen_mcp(config, root)
    gen_settings(root)
    link_dir("skills", root)
    link_dir("commands", root)
    print("\n✅ Claude Code pronto. Reinicie o Claude Code para carregar agents/MCP.")
    return 0


def _run_codex(args: Namespace) -> int:
    root = workbench_root()
    print("🔁 OpenCode → Codex CLI Sync")
    print(f"   Workbench: {root}\n")

    codex_agents = root / ".codex" / "agents"
    ok = missing = 0
    for name in EXPECTED_CODEX_AGENTS:
        if (codex_agents / f"{name}.toml").is_file():
            ok += 1
        else:
            print(f"   ⚠️  Missing: {name}.toml")
            missing += 1
    print(f"   Agents: {ok} OK, {missing} missing\n")

    agents_md = root / "AGENTS.md"
    if agents_md.is_file():
        print(f"   AGENTS.md: OK ({agents_md.stat().st_size / 1024:.1f} KB)")
    else:
        print("   ⚠️  AGENTS.md not found!")

    skills_dir = root / ".opencode" / "skills"
    if skills_dir.is_dir():
        skills = [path for path in skills_dir.iterdir() if (path / "SKILL.md").is_file()]
        print(f"   Skills: {len(skills)} compatible (shared SKILL.md format)")
    else:
        print("   ⚠️  Skills directory not found")

    plugin_path = root / ".codex-plugin" / "plugin.json"
    if plugin_path.is_file():
        plugin = json.loads(plugin_path.read_text(encoding="utf-8"))
        print(f"   Plugin: {plugin.get('name')} v{plugin.get('version')}")
    else:
        print("   ⚠️  .codex-plugin/plugin.json not found")

    codex_config = Path.home() / ".codex" / "config.toml"
    codex_ok = codex_config.is_file()
    if codex_ok:
        content = codex_config.read_text(encoding="utf-8")
        has_mcp = "[mcp_servers." in content or "[mcp_servers]\n" in content
        mcp_label = " (has MCP section)" if has_mcp else " (no MCP section)"
        print(f"   ~/.codex/config.toml: exists{mcp_label}")
    else:
        print("   ⚠️  ~/.codex/config.toml not found — run `codex` once to create it")

    all_ok = (
        missing == 0
        and agents_md.is_file()
        and skills_dir.is_dir()
        and plugin_path.is_file()
        and codex_ok
    )
    message = (
        "✅ Bridge OK — Codex CLI ready" if all_ok else "⚠️  Some items need attention (see above)"
    )
    print(f"\n{message}")
    return 0
