"""Resolução de paths do Workbench, independente de plataforma."""

from __future__ import annotations

import os
from pathlib import Path


def workbench_root(start: Path | None = None) -> Path:
    """Retorna a raiz do Workbench.

    Prioridade: ``WB_ROOT`` > diretório atual (ou ``start``) subindo até
    encontrar ``opencode.json`` > raiz do pacote.
    """

    env_root = os.environ.get("WB_ROOT")
    if env_root:
        return Path(env_root).expanduser().resolve()

    base = (start or Path.cwd()).resolve()
    for candidate in (base, *base.parents):
        if (candidate / "opencode.json").is_file():
            return candidate
    return Path(__file__).resolve().parents[2]


def resolve_root_path(*parts: str, root: Path | None = None) -> Path:
    return (root or workbench_root()).joinpath(*parts)


def config_dir(root: Path | None = None) -> Path:
    return resolve_root_path(".opencode", "config", root=root)


def knowledge_dir(root: Path | None = None) -> Path:
    return resolve_root_path(".opencode", "knowledge", root=root)


def plans_dir(root: Path | None = None) -> Path:
    return resolve_root_path(".opencode", "plans", root=root)


def metrics_dir(root: Path | None = None) -> Path:
    return resolve_root_path(".opencode", "knowledge", "metrics", root=root)


def ensure_dir(path: Path) -> Path:
    path.mkdir(parents=True, exist_ok=True)
    return path
