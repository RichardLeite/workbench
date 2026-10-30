"""Descoberta automática de projetos e repositórios locais."""

from __future__ import annotations

import fnmatch
import json
import os
import re
import tempfile
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from workbench.config import ConfigError, read_json
from workbench.paths import config_dir, workbench_root

OVERLAY_FILE = "project-mapping.local.json"
DEFAULT_ROOTS = ["."]
DEFAULT_EXCLUDE = {
    ".git",
    ".github",
    ".opencode",
    ".venv",
    ".claude",
    ".codex",
    ".agents",
    "__pycache__",
    "node_modules",
    "projects",
    "tmp",
    "dist",
    "build",
}


@dataclass(slots=True)
class RepoCandidate:
    path: Path
    rel: str
    manifest: dict[str, Any] = field(default_factory=dict)
    manifest_path: Path | None = None
    name: str | None = None
    claimed: bool = False

    @property
    def slug(self) -> str:
        manifest_slug = _valid_slug(self.manifest.get("slug"))
        return manifest_slug or _slugify(self.path.name)


@dataclass(slots=True)
class DiscoveryResult:
    root: Path
    roots: list[str]
    projects: dict[str, dict[str, Any]]
    warnings: list[str]


def now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "project"


def _valid_slug(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    candidate = value.strip().lower()
    if re.fullmatch(r"[a-z0-9][a-z0-9-]*", candidate):
        return candidate
    return None


def _title_from_slug(slug: str) -> str:
    return re.sub(r"[-_]+", " ", slug).strip().title() or slug


def _is_git_marker(path: Path) -> bool:
    marker = path / ".git"
    return marker.is_dir() or marker.is_file()


def _inside_root(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def _relative(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def _safe_rel(value: Any, root: Path, warnings: list[str], label: str) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip()
    candidate = Path(raw)
    if candidate.is_absolute():
        warnings.append(f"{label}: caminho absoluto ignorado: {raw}")
        return None
    resolved = (root / candidate).resolve()
    if not _inside_root(resolved, root):
        warnings.append(f"{label}: caminho fora do workbench ignorado: {raw}")
        return None
    return resolved.relative_to(root.resolve()).as_posix()


def _safe_pattern(value: Any, warnings: list[str], label: str) -> str | None:
    if not isinstance(value, str) or not value.strip():
        return None
    raw = value.strip().replace("\\", "/")
    if Path(raw).is_absolute() or ".." in Path(raw).parts:
        warnings.append(f"{label}: padrão inválido ignorado: {raw}")
        return None
    return raw


def _read_agents_name(path: Path) -> str | None:
    if not path.is_file():
        return None
    try:
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            if line.startswith("# "):
                name = re.split(r"\s+[—–-]\s+", line[2:].strip(), maxsplit=1)[0].strip()
                return name or None
    except OSError:
        return None
    return None


def _load_manifest(path: Path, warnings: list[str]) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        warnings.append(f"manifesto inválido ignorado: {path} ({exc})")
        return {}
    if not isinstance(data, dict):
        warnings.append(f"manifesto deve ser um objeto JSON: {path}")
        return {}
    return data


def _discovery_config(root: Path) -> tuple[list[str], set[str]]:
    try:
        base = read_json(config_dir(root) / "project-mapping.json")
    except ConfigError:
        base = {}
    settings = base.get("discovery")
    settings = settings if isinstance(settings, dict) else {}
    configured = settings.get("roots")
    if isinstance(configured, list):
        roots = [str(item) for item in configured]
    else:
        roots = list(DEFAULT_ROOTS)
    exclude = set(DEFAULT_EXCLUDE)
    extra_exclude = settings.get("exclude")
    if isinstance(extra_exclude, list):
        exclude.update(str(item) for item in extra_exclude)
    return roots, exclude


def _configured_roots(
    root: Path,
    extra_roots: list[str] | None,
    warnings: list[str],
) -> list[Path]:
    roots, _ = _discovery_config(root)
    raw_roots = list(roots)
    env_roots = os.environ.get("WB_PROJECT_ROOTS")
    if env_roots:
        raw_roots.extend(item for item in env_roots.split(os.pathsep) if item.strip())
    if extra_roots:
        raw_roots.extend(extra_roots)

    resolved: list[Path] = []
    seen: set[Path] = set()
    for item in raw_roots:
        candidate = Path(item).expanduser()
        resolved_candidate = (
            candidate.resolve() if candidate.is_absolute() else (root / candidate).resolve()
        )
        if not _inside_root(resolved_candidate, root):
            warnings.append(f"root fora do workbench ignorado: {item}")
            continue
        if not resolved_candidate.is_dir():
            warnings.append(f"root inexistente ignorado: {item}")
            continue
        if resolved_candidate in seen:
            continue
        seen.add(resolved_candidate)
        resolved.append(resolved_candidate)
    return resolved


def _skip_directory(path: Path, root: Path, exclude: set[str]) -> bool:
    if path.resolve() == root.resolve():
        return False
    if path.name in exclude or path.name.startswith("."):
        return True
    return False


def _candidate_directories(scan_root: Path, root: Path, exclude: set[str]) -> list[Path]:
    if scan_root.resolve() != root.resolve() and _is_git_marker(scan_root):
        return [scan_root]
    try:
        children = sorted(scan_root.iterdir(), key=lambda item: item.name.lower())
    except OSError:
        return []
    directories: list[Path] = []
    for child in children:
        if not child.is_dir() or _skip_directory(child, root, exclude):
            continue
        if _is_git_marker(child):
            directories.append(child)
    return directories


def _repo_candidates(
    root: Path,
    scan_roots: list[Path],
    exclude: set[str],
    warnings: list[str],
) -> dict[str, RepoCandidate]:
    candidates: dict[str, RepoCandidate] = {}
    for scan_root in scan_roots:
        for directory in _candidate_directories(scan_root, root, exclude):
            resolved = directory.resolve()
            if not _inside_root(resolved, root):
                warnings.append(f"repo fora do workbench ignorado: {directory}")
                continue
            rel = _relative(resolved, root)
            if rel in candidates:
                continue
            manifest_path = resolved / ".workbench" / "project.json"
            manifest = _load_manifest(manifest_path, warnings)
            name = _read_agents_name(resolved / "AGENTS.md")
            candidates[rel] = RepoCandidate(
                path=resolved,
                rel=rel,
                manifest=manifest,
                manifest_path=manifest_path if manifest_path.is_file() else None,
                name=name,
            )
    return candidates


def _metadata_directories(root: Path, exclude: set[str]) -> list[Path]:
    projects_dir = root / "projects"
    if not projects_dir.is_dir():
        return []
    directories: list[Path] = []
    for child in sorted(projects_dir.iterdir(), key=lambda item: item.name.lower()):
        if not child.is_dir() or child.name.startswith("_") or child.name in exclude:
            continue
        if not _inside_root(child.resolve(), root):
            continue
        if (child / "project.json").is_file() or (child / "AGENTS.md").is_file():
            directories.append(child)
    return directories


def _project_data(
    slug: str,
    root: Path,
    manifest: dict[str, Any],
    *,
    metadata_dir: Path | None = None,
    repo_name: str | None = None,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    if warnings is None:
        warnings = []
    name = manifest.get("name")
    if not isinstance(name, str) or not name.strip():
        name = _read_agents_name(metadata_dir / "AGENTS.md") if metadata_dir else repo_name
    if not isinstance(name, str) or not name.strip():
        name = _title_from_slug(slug)

    description = manifest.get("description")
    description = description.strip() if isinstance(description, str) else ""

    knowledge = _safe_rel(manifest.get("knowledge"), root, warnings, f"{slug}.knowledge")
    if knowledge is None and metadata_dir is not None:
        candidate = metadata_dir / "knowledge"
        if candidate.is_dir():
            knowledge = _relative(candidate, root)

    vault = _safe_rel(manifest.get("vault"), root, warnings, f"{slug}.vault")
    if vault is None and metadata_dir is not None:
        candidate = metadata_dir / "obsidian-vault"
        if candidate.is_dir():
            vault = _relative(candidate, root)

    agents = manifest.get("agents")
    agents = [str(item) for item in agents] if isinstance(agents, list) else []

    process = manifest.get("process")
    process = process if isinstance(process, str) and process.strip() else "default"
    license_name = manifest.get("license")
    license_name = license_name if isinstance(license_name, str) else None
    tracker = manifest.get("tracker")
    tracker = tracker if isinstance(tracker, str) and tracker.strip() else "none"

    return {
        "name": name,
        "description": description,
        "repos": {},
        "knowledge": knowledge,
        "agents": agents,
        "vault": vault,
        "process": process,
        "license": license_name,
        "tracker": tracker,
    }


def _match_repos(
    pattern: str,
    candidates: dict[str, RepoCandidate],
) -> list[RepoCandidate]:
    exact = [
        candidate
        for candidate in candidates.values()
        if candidate.rel == pattern or candidate.path.name == pattern
    ]
    if exact:
        return exact
    return [
        candidate
        for candidate in candidates.values()
        if fnmatch.fnmatch(candidate.rel, pattern) or fnmatch.fnmatch(candidate.path.name, pattern)
    ]


def _assign_repos(
    data: dict[str, Any],
    manifest: dict[str, Any],
    slug: str,
    candidates: dict[str, RepoCandidate],
    root: Path,
    warnings: list[str],
) -> None:
    configured = manifest.get("repos")
    if isinstance(configured, dict) and configured:
        repos: dict[str, str] = {}
        for role, value in configured.items():
            role_name = str(role)
            pattern = _safe_pattern(value, warnings, f"{slug}.repos.{role_name}")
            if pattern is None:
                continue
            matches = _match_repos(pattern, candidates)
            unclaimed = [candidate for candidate in matches if not candidate.claimed]
            if unclaimed:
                matches = unclaimed
            if matches:
                chosen = sorted(matches, key=lambda item: item.rel)[0]
                repos[role_name] = chosen.rel
                chosen.claimed = True
                if len(matches) > 1:
                    warnings.append(
                        f"{slug}.repos.{role_name}: múltiplos repos para {pattern}; "
                        f"usando {chosen.rel}"
                    )
            elif "*" not in pattern and "?" not in pattern:
                safe = _safe_rel(pattern, root, warnings, f"{slug}.repos.{role_name}")
                if safe:
                    repos[role_name] = safe
            else:
                warnings.append(f"{slug}.repos.{role_name}: nenhum repo para {pattern}")
        data["repos"] = repos
        return

    matches = [
        candidate
        for candidate in candidates.values()
        if not candidate.claimed and (candidate.path.name == slug or candidate.slug == slug)
    ]
    if not matches:
        prefix = f"{slug}-"
        matches = [
            candidate
            for candidate in candidates.values()
            if not candidate.claimed
            and (candidate.path.name.startswith(prefix) or candidate.slug.startswith(prefix))
        ]
    if len(matches) == 1:
        data["repos"] = {"root": matches[0].rel}
        matches[0].claimed = True
    elif len(matches) > 1:
        warnings.append(f"{slug}: múltiplos repos encontrados; use project.json#repos")


def discover_projects(
    root: Path | None = None,
    extra_roots: list[str] | None = None,
) -> DiscoveryResult:
    base = (root or workbench_root()).resolve()
    warnings: list[str] = []
    scanned_roots = _configured_roots(base, extra_roots, warnings)
    _, exclude = _discovery_config(base)
    candidates = _repo_candidates(base, scanned_roots, exclude, warnings)
    projects: dict[str, dict[str, Any]] = {}

    for metadata_dir in _metadata_directories(base, exclude):
        manifest_path = metadata_dir / "project.json"
        manifest = _load_manifest(manifest_path, warnings)
        slug = _valid_slug(manifest.get("slug")) or _valid_slug(metadata_dir.name)
        if slug is None:
            warnings.append(f"projeto sem slug válido ignorado: {metadata_dir}")
            continue
        if slug in projects:
            warnings.append(f"projeto duplicado ignorado: {slug}")
            continue
        data = _project_data(
            slug,
            base,
            manifest,
            metadata_dir=metadata_dir,
            warnings=warnings,
        )
        _assign_repos(data, manifest, slug, candidates, base, warnings)
        projects[slug] = data

    for candidate in sorted(candidates.values(), key=lambda item: item.rel):
        if candidate.claimed:
            continue
        slug = candidate.slug
        if slug in projects:
            existing = projects[slug]
            if not existing.get("repos"):
                existing["repos"] = {"root": candidate.rel}
                candidate.claimed = True
            else:
                warnings.append(f"repo {candidate.rel}: slug {slug} já associado a outro projeto")
            continue

        data = _project_data(
            slug,
            base,
            candidate.manifest,
            repo_name=candidate.name,
            warnings=warnings,
        )
        _assign_repos(data, candidate.manifest, slug, candidates, base, warnings)
        if not data.get("repos"):
            data["repos"] = {"root": candidate.rel}
            candidate.claimed = True
        projects[slug] = data

    return DiscoveryResult(
        root=base,
        roots=[_relative(path, base) if path != base else "." for path in scanned_roots],
        projects=dict(sorted(projects.items())),
        warnings=sorted(set(warnings)),
    )


def overlay_path(root: Path | None = None) -> Path:
    return config_dir(root) / OVERLAY_FILE


def sync_projects(
    root: Path | None = None,
    extra_roots: list[str] | None = None,
) -> Path:
    result = discover_projects(root, extra_roots)
    path = overlay_path(result.root)
    payload = {
        "version": 1,
        "generated_at": now_iso(),
        "roots": result.roots,
        "projects": result.projects,
        "warnings": result.warnings,
    }
    serialized = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n"

    if path.is_file():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            existing = None
        if (
            isinstance(existing, dict)
            and existing.get("roots") == payload["roots"]
            and existing.get("projects") == payload["projects"]
            and existing.get("warnings") == payload["warnings"]
        ):
            return path

    path.parent.mkdir(parents=True, exist_ok=True)
    handle = tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=path.parent,
        prefix=f".{path.name}.",
        suffix=".tmp",
        delete=False,
    )
    try:
        handle.write(serialized)
        handle.close()
        os.replace(handle.name, path)
    except Exception:
        handle.close()
        Path(handle.name).unlink(missing_ok=True)
        raise
    return path
