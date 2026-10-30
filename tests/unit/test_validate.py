from __future__ import annotations

from argparse import Namespace
from pathlib import Path

from workbench.commands import validate

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


def test_branch_valid(capsys) -> None:
    code = validate._run_branch(Namespace(branch="feat/add-feature"))
    assert code == 0
    assert "é válida" in capsys.readouterr().out


def test_branch_invalid(capsys) -> None:
    code = validate._run_branch(Namespace(branch="Not A Branch"))
    assert code == 1
    assert "não corresponde" in capsys.readouterr().out


def test_branch_protected(capsys) -> None:
    code = validate._run_branch(Namespace(branch="main"))
    assert code == 0
    assert "protegida" in capsys.readouterr().out


def test_spec_valid(capsys) -> None:
    code = validate._run_spec(Namespace(path=str(FIXTURES / "spec-valid.md")))
    output = capsys.readouterr().out
    assert code == 0
    assert "Spec válida" in output


def test_spec_invalid(capsys) -> None:
    code = validate._run_spec(Namespace(path=str(FIXTURES / "spec-invalid.md")))
    output = capsys.readouterr().out
    assert code == 1
    assert "erro(s)" in output
