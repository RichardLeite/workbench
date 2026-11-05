"""Leitura de metadados básicos a partir dos arquivos do repositório."""

from __future__ import annotations

import json
import tomllib
from pathlib import Path
from typing import Any


def _license_from_text(path: Path) -> str | None:
    if not path.is_file():
        return None
    try:
        text = path.read_text(encoding="utf-8", errors="replace")[:4096].lower()
    except OSError:
        return None
    if "mit license" in text or "permission is hereby granted, free of charge" in text:
        return "MIT"
    if "apache license" in text:
        return "Apache-2.0"
    if "mozilla public license" in text:
        return "MPL-2.0"
    if "gnu general public license" in text:
        if "version 3" in text:
            return "GPL-3.0"
        if "version 2" in text:
            return "GPL-2.0"
    if "isc license" in text:
        return "ISC"
    if "redistribution and use in source and binary forms" in text:
        return "BSD-3-Clause"
    return None


def _string(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def read_repo_metadata(repo: Path) -> dict[str, str]:
    metadata: dict[str, str] = {}

    package_path = repo / "package.json"
    if package_path.is_file():
        try:
            package = json.loads(package_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            package = {}
        if isinstance(package, dict):
            for field in ("name", "description", "license"):
                value = _string(package.get(field))
                if value:
                    metadata[field] = value

    pyproject_path = repo / "pyproject.toml"
    if pyproject_path.is_file():
        try:
            pyproject = tomllib.loads(pyproject_path.read_text(encoding="utf-8"))
        except (OSError, tomllib.TOMLDecodeError):
            pyproject = {}
        project = pyproject.get("project") if isinstance(pyproject, dict) else None
        if isinstance(project, dict):
            for field in ("name", "description"):
                value = _string(project.get(field))
                if value and field not in metadata:
                    metadata[field] = value
            license_value = project.get("license")
            if isinstance(license_value, str):
                metadata.setdefault("license", license_value.strip())
            elif isinstance(license_value, dict):
                text = _string(license_value.get("text"))
                if text:
                    metadata.setdefault("license", text)

    if "license" not in metadata:
        for name in ("LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING"):
            detected = _license_from_text(repo / name)
            if detected:
                metadata["license"] = detected
                break

    return metadata
