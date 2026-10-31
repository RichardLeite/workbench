from __future__ import annotations

import json
import subprocess
from argparse import Namespace
from pathlib import Path

from workbench.commands import projects


def make_repo(path: Path) -> None:
    path.mkdir(parents=True)
    (path / ".git").mkdir()


def write_mapping(root: Path) -> None:
    path = root / ".opencode" / "config" / "project-mapping.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"projects": {}}), encoding="utf-8")


def test_scan_json(tmp_path: Path, capsys) -> None:
    make_repo(tmp_path / "api")
    assert projects._run_scan(Namespace(root=str(tmp_path), json=True)) == 0
    payload = json.loads(capsys.readouterr().out)
    assert "api" in payload["projects"]


def test_sync_and_list(tmp_path: Path, capsys) -> None:
    make_repo(tmp_path / "api")
    write_mapping(tmp_path)
    assert projects._run_sync(Namespace(root=str(tmp_path), json=True, quiet=True)) == 0
    sync_payload = json.loads(capsys.readouterr().out)
    assert sync_payload["projects"] == 1
    assert Path(sync_payload["path"]).is_file()

    assert projects._run_list(Namespace(root=str(tmp_path), json=True)) == 0
    listed = json.loads(capsys.readouterr().out)
    assert listed[0]["slug"] == "api"


def test_exclude_json(tmp_path: Path, capsys) -> None:
    subprocess.run(["git", "init", "-q"], cwd=tmp_path, check=True)
    make_repo(tmp_path / "api")
    args = Namespace(root=str(tmp_path), dry_run=False, json=True)
    assert projects._run_exclude(args) == 0
    payload = json.loads(capsys.readouterr().out)
    assert payload["entries"] == ["api"]
    assert payload["changed"] is True
    exclude = tmp_path / ".git" / "info" / "exclude"
    assert "/api/" in exclude.read_text(encoding="utf-8")
