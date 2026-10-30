from __future__ import annotations

import json
from pathlib import Path

from workbench.commands import ado


def test_parse_ab_reference_formats() -> None:
    assert ado.parse_ab_reference("AB#1234") == {"id": 1234, "raw": "AB#1234", "format": "AB_HASH"}
    assert ado.parse_ab_reference("#1234")["format"] == "HASH_ONLY"
    assert ado.parse_ab_reference("1234")["format"] == "NUMERIC"
    assert ado.parse_ab_reference("Corrigir AB#99")["id"] == 99
    assert ado.parse_ab_reference("abc")["format"] == "INVALID"


def test_parse_ab_reference_url() -> None:
    result = ado.parse_ab_reference(
        "https://dev.azure.com/your-org/Sprint%20Team/_workitems/edit/21284"
    )
    assert result["id"] == 21284
    assert result["project"] == "Sprint Team"
    assert result["format"] == "FULL_URL"


def write_config(root: Path) -> None:
    path = root / ".opencode" / "config" / "ado-context.json"
    path.parent.mkdir(parents=True)
    path.write_text(
        json.dumps(
            {
                "organization": "your-org",
                "defaultProject": "Sprint Team",
                "projects": {
                    "Sprint Team": {
                        "type": "sprint",
                        "team": "Sprint Team",
                        "projectId": "id-1",
                    },
                    "Hotfix Team": {
                        "type": "hotfix",
                        "team": "Hotfix Team",
                        "projectId": "id-2",
                    },
                },
            }
        ),
        encoding="utf-8",
    )


def test_resolve_project(tmp_path: Path) -> None:
    write_config(tmp_path)
    default = ado.resolve_project({}, tmp_path)
    assert default["project"] == "Sprint Team"
    assert default["gitFlow"]["command"] == "/git-sprint"
    assert ado.resolve_project({"type": "hotfix"}, tmp_path)["project"] == "Hotfix Team"
    assert ado.resolve_project({"validate": True}, tmp_path) == {"valid": True, "projects": 2}
    assert len(ado.resolve_project({"list": True}, tmp_path)) == 2


def test_fallback_projects(tmp_path: Path) -> None:
    write_config(tmp_path)
    result = ado.get_fallback_projects(tmp_path)
    assert result["defaultProject"] == "Sprint Team"
    assert result["projects"][0]["project"] == "Sprint Team"
