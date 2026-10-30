from __future__ import annotations

import json
from pathlib import Path

from workbench import config, discovery


def make_repo(path: Path, agents: str | None = None) -> Path:
    path.mkdir(parents=True)
    (path / ".git").mkdir()
    if agents is not None:
        (path / "AGENTS.md").write_text(agents, encoding="utf-8")
    return path


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_discover_repo_and_name(tmp_path: Path) -> None:
    make_repo(tmp_path / "api", "# Sample API — Project Agents\n")
    result = discovery.discover_projects(tmp_path)
    assert result.projects["api"]["name"] == "Sample API"
    assert result.projects["api"]["repos"] == {"root": "api"}


def test_discover_skips_tooling_directories(tmp_path: Path) -> None:
    make_repo(tmp_path / ".opencode" / "hidden")
    make_repo(tmp_path / "node_modules" / "hidden")
    make_repo(tmp_path / "app")
    result = discovery.discover_projects(tmp_path)
    assert list(result.projects) == ["app"]


def test_manifest_precedence_and_multi_repo(tmp_path: Path) -> None:
    make_repo(tmp_path / "foo-api")
    make_repo(tmp_path / "foo-web")
    write_json(
        tmp_path / "projects" / "foo" / "project.json",
        {
            "slug": "foo",
            "name": "Foo",
            "description": "Foo platform",
            "process": "custom",
            "repos": {"api": "foo-api", "web": "foo-*"},
        },
    )

    result = discovery.discover_projects(tmp_path)
    project = result.projects["foo"]
    assert project["name"] == "Foo"
    assert project["description"] == "Foo platform"
    assert project["process"] == "custom"
    assert project["repos"] == {"api": "foo-api", "web": "foo-web"}


def test_manifest_agents_markdown_fallback(tmp_path: Path) -> None:
    metadata = tmp_path / "projects" / "foo"
    metadata.mkdir(parents=True)
    (metadata / "AGENTS.md").write_text("# Foo Platform — Project Agents\n", encoding="utf-8")
    result = discovery.discover_projects(tmp_path)
    assert result.projects["foo"]["name"] == "Foo Platform"


def test_extra_roots(tmp_path: Path) -> None:
    make_repo(tmp_path / "repos" / "api")
    result = discovery.discover_projects(tmp_path, extra_roots=["repos"])
    assert "api" in result.projects
    assert result.projects["api"]["repos"] == {"root": "repos/api"}


def test_invalid_manifest_is_a_warning(tmp_path: Path) -> None:
    metadata = tmp_path / "projects" / "foo"
    metadata.mkdir(parents=True)
    (metadata / "project.json").write_text("{invalid", encoding="utf-8")
    result = discovery.discover_projects(tmp_path)
    assert "foo" in result.projects
    assert any("manifesto inválido" in warning for warning in result.warnings)


def test_sync_writes_overlay_and_merges_with_static(tmp_path: Path) -> None:
    make_repo(tmp_path / "api")
    write_json(
        tmp_path / ".opencode" / "config" / "project-mapping.json",
        {"projects": {"workbench": {"name": "Workbench", "repos": {}}}},
    )
    path = discovery.sync_projects(tmp_path)
    assert path == tmp_path / ".opencode" / "config" / "project-mapping.local.json"
    overlay = json.loads(path.read_text(encoding="utf-8"))
    assert "api" in overlay["projects"]
    merged = config.load_project_mapping(tmp_path)
    assert set(merged["projects"]) == {"api", "workbench"}


def test_static_project_overrides_discovered(tmp_path: Path) -> None:
    make_repo(tmp_path / "api")
    write_json(
        tmp_path / ".opencode" / "config" / "project-mapping.json",
        {
            "projects": {
                "api": {
                    "name": "Explicit API",
                    "repos": {"api": "api"},
                    "process": "explicit",
                }
            }
        },
    )
    discovery.sync_projects(tmp_path)
    merged = config.load_project_mapping(tmp_path)
    assert merged["projects"]["api"]["name"] == "Explicit API"
    assert merged["projects"]["api"]["process"] == "explicit"
    assert merged["projects"]["api"]["repos"] == {"api": "api"}


def test_single_unambiguous_prefix_is_assigned(tmp_path: Path) -> None:
    make_repo(tmp_path / "carflow-api")
    metadata = tmp_path / "projects" / "carflow"
    metadata.mkdir(parents=True)
    (metadata / "AGENTS.md").write_text("# CarFlow\n", encoding="utf-8")
    result = discovery.discover_projects(tmp_path)
    assert result.projects["carflow"]["repos"] == {"root": "carflow-api"}


def test_multiple_prefix_repositories_require_manifest(tmp_path: Path) -> None:
    make_repo(tmp_path / "carflow-api")
    make_repo(tmp_path / "carflow-web")
    metadata = tmp_path / "projects" / "carflow"
    metadata.mkdir(parents=True)
    (metadata / "AGENTS.md").write_text("# CarFlow\n", encoding="utf-8")
    result = discovery.discover_projects(tmp_path)
    assert result.projects["carflow"]["repos"] == {}
    assert any("project.json#repos" in warning for warning in result.warnings)
