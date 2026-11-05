"""Validação dos manifestos de projeto (`projects/<slug>/project.json`)."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

SLUG_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]*$")
ALLOWED_FIELDS = {
    "slug",
    "name",
    "description",
    "process",
    "license",
    "tracker",
    "agents",
    "knowledge",
    "vault",
    "repos",
}


def manifest_root(root: Path) -> Path:
    return root / "projects"


def manifest_paths(root: Path, slug: str | None = None) -> list[Path]:
    base = manifest_root(root)
    if slug:
        return [base / slug / "project.json"]
    if not base.is_dir():
        return []
    paths: list[Path] = []
    for child in sorted(base.iterdir()):
        if not child.is_dir() or child.name.startswith("_"):
            continue
        try:
            child.resolve().relative_to(root.resolve())
        except ValueError:
            continue
        path = child / "project.json"
        if path.is_file():
            paths.append(path)
    return paths


def _safe_relative(value: str, root: Path) -> bool:
    candidate = Path(value)
    if candidate.is_absolute() or ".." in candidate.parts:
        return False
    resolved = (root / candidate).resolve()
    try:
        resolved.relative_to(root.resolve())
    except ValueError:
        return False
    return True


def _validate_repo_pattern(value: str) -> bool:
    candidate = Path(value.replace("\\", "/"))
    return not candidate.is_absolute() and ".." not in candidate.parts


def validate_manifest(path: Path, root: Path) -> list[str]:
    errors: list[str] = []
    if not path.is_file():
        return [f"manifesto não encontrado: {path}"]
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return [f"JSON inválido: {exc}"]
    if not isinstance(data, dict):
        return ["manifesto deve ser um objeto JSON"]

    unknown = sorted(set(data) - ALLOWED_FIELDS)
    if unknown:
        errors.append(f"campos desconhecidos: {', '.join(unknown)}")

    name = data.get("name")
    if not isinstance(name, str) or not name.strip():
        errors.append("name é obrigatório e deve ser uma string não vazia")

    slug = data.get("slug")
    if slug is not None:
        if not isinstance(slug, str) or not SLUG_PATTERN.fullmatch(slug):
            errors.append("slug deve usar lowercase, números e hífens")

    for field in ("description", "process", "tracker"):
        value = data.get(field)
        if value is not None and not isinstance(value, str):
            errors.append(f"{field} deve ser uma string")
        elif field in {"process", "tracker"} and isinstance(value, str) and not value.strip():
            errors.append(f"{field} não pode ser vazio")

    license_name = data.get("license")
    if license_name is not None and not isinstance(license_name, str):
        errors.append("license deve ser uma string ou null")

    agents = data.get("agents")
    if agents is not None:
        if not isinstance(agents, list) or any(not isinstance(item, str) for item in agents):
            errors.append("agents deve ser uma lista de strings")

    for field in ("knowledge", "vault"):
        value = data.get(field)
        if value is None:
            continue
        if not isinstance(value, str) or not _safe_relative(value, root):
            errors.append(f"{field} deve ser um caminho relativo dentro do workbench")

    repos = data.get("repos")
    if repos is not None:
        if not isinstance(repos, dict):
            errors.append("repos deve ser um objeto de papel -> caminho/glob")
        else:
            for role, value in repos.items():
                if not isinstance(role, str) or not role.strip():
                    errors.append("repos contém um papel vazio")
                    continue
                if not isinstance(value, str) or not value.strip():
                    errors.append(f"repos.{role} deve ser uma string não vazia")
                elif not _validate_repo_pattern(value):
                    errors.append(f"repos.{role} deve ser um caminho/glob relativo")

    return errors


def validate_manifests(
    root: Path,
    slug: str | None = None,
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    for path in manifest_paths(root, slug):
        errors = validate_manifest(path, root)
        results.append({"path": str(path), "ok": not errors, "errors": errors})
    return results
