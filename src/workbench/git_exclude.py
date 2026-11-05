"""Gerenciamento do bloco de repositórios descobertos em .git/info/exclude."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Any

from workbench.config import ConfigError
from workbench.discovery import discover_projects
from workbench.process import run

BEGIN_MARKER = "# BEGIN Workbench discovered repositories"
END_MARKER = "# END Workbench discovered repositories"


def exclude_path(root: Path) -> Path:
    result = run(["git", "rev-parse", "--git-path", "info/exclude"], cwd=root, timeout=10)
    if not result.ok:
        raise ConfigError(
            f"Não foi possível resolver .git/info/exclude em {root}: "
            f"{result.stderr.strip() or result.stdout.strip()}"
        )
    raw = result.stdout.strip()
    if not raw:
        raise ConfigError(f"git retornou um caminho de exclude vazio em {root}")
    path = Path(raw)
    return path if path.is_absolute() else (root / path).resolve()


def discovered_entries(root: Path) -> list[str]:
    result = discover_projects(root)
    entries: set[str] = set()
    for project in result.projects.values():
        repos = project.get("repos")
        if not isinstance(repos, dict):
            continue
        for value in repos.values():
            if not isinstance(value, str) or not value.strip():
                continue
            candidate = Path(value)
            if candidate.is_absolute():
                continue
            resolved = (root / candidate).resolve()
            try:
                relative = resolved.relative_to(root.resolve())
            except ValueError:
                continue
            if relative == Path("."):
                continue
            if not resolved.is_dir() or not (resolved / ".git").exists():
                continue
            entries.add(relative.as_posix())
    return sorted(entries)


def managed_entries(text: str) -> list[str]:
    entries: list[str] = []
    inside = False
    for line in text.splitlines():
        stripped = line.strip()
        if stripped == BEGIN_MARKER:
            inside = True
            continue
        if stripped == END_MARKER:
            inside = False
            continue
        if inside and stripped and not stripped.startswith("#"):
            entries.append(stripped.strip("/"))
    return entries


def render_exclude(existing: str, entries: list[str]) -> str:
    lines: list[str] = []
    inside = False
    for line in existing.splitlines():
        stripped = line.strip()
        if stripped == BEGIN_MARKER:
            inside = True
            continue
        if stripped == END_MARKER:
            inside = False
            continue
        if not inside:
            lines.append(line)

    while lines and not lines[-1]:
        lines.pop()

    if entries:
        if lines:
            lines.append("")
        lines.append(BEGIN_MARKER)
        lines.extend(f"/{entry}/" for entry in sorted(set(entries)))
        lines.append(END_MARKER)

    return "\n".join(lines) + ("\n" if lines else "")


def apply_exclude(
    root: Path,
    entries: list[str],
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    path = exclude_path(root)
    existing = path.read_text(encoding="utf-8") if path.is_file() else ""
    previous = managed_entries(existing)
    updated = render_exclude(existing, entries)
    changed = updated != existing
    added = sorted(set(entries) - set(previous))
    removed = sorted(set(previous) - set(entries))

    if changed and not dry_run:
        path.parent.mkdir(parents=True, exist_ok=True)
        handle = tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            newline="\n",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        )
        try:
            handle.write(updated)
            handle.close()
            os.replace(handle.name, path)
        except Exception:
            handle.close()
            Path(handle.name).unlink(missing_ok=True)
            raise

    return {
        "path": str(path),
        "entries": sorted(set(entries)),
        "added": added,
        "removed": removed,
        "changed": changed,
        "dryRun": dry_run,
    }
