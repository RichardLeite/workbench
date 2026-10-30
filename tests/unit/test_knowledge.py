from __future__ import annotations

import json
from pathlib import Path

from workbench.commands import knowledge


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def test_parse_frontmatter() -> None:
    content = "---\ntitle: Nota\ntype: memory\n---\n\nCorpo"
    frontmatter, body = knowledge.parse_frontmatter(content)
    assert frontmatter == {"title": "Nota", "type": "memory"}
    assert body == "Corpo"


def test_search_scores_and_snippets(tmp_path: Path, capsys) -> None:
    write_json(
        tmp_path / ".opencode" / "config" / "project-mapping.json",
        {"projects": {"proj": {"vault": "vault"}}},
    )
    note = tmp_path / "vault" / "nota.md"
    note.parent.mkdir(parents=True)
    note.write_text(
        "---\ntitle: Guia de Deploy\n---\n\nO deploy usa rollback automatico.\n",
        encoding="utf-8",
    )
    code = knowledge.search("deploy", project="proj", root=tmp_path)
    assert code == 0
    output = json.loads(capsys.readouterr().out)
    assert output[0]["title"] == "Guia de Deploy"
    assert output[0]["score"] >= 1
    assert "rollback" in output[0]["snippet"]


def test_resolve_vault_root_missing(tmp_path: Path) -> None:
    write_json(
        tmp_path / ".opencode" / "config" / "project-mapping.json",
        {"projects": {"proj": {"vault": "missing"}}},
    )
    assert knowledge.resolve_vault_root("proj", tmp_path) is None
