from __future__ import annotations

from tests.characterization import run


def test_normalize_replaces_root(monkeypatch) -> None:
    root = str(run.ROOT)
    text = f"{root}/file.txt\r\nline  \r\n"
    normalized = run.normalize(text)
    assert normalized == "<ROOT>/file.txt\nline"


def test_argv_for_python_expands_interpreter() -> None:
    case = {"id": "x", "argv": ["node", "x.js"], "python_argv": ["{python}", "-m", "workbench"]}
    argv = run.argv_for(case, "python")
    assert argv is not None
    assert argv[0] != "{python}"
    assert argv[1:] == ["-m", "workbench"]


def test_argv_for_python_without_definition() -> None:
    case = {"id": "x", "argv": ["node", "x.js"]}
    assert run.argv_for(case, "python") is None
