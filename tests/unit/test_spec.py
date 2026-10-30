from __future__ import annotations

from pathlib import Path

from workbench.commands import spec

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures"


def test_migrate_dry_run(capsys) -> None:
    code = spec.migrate_spec(FIXTURES / "spec-old.md", dry_run=True)
    output = capsys.readouterr().out
    assert code == 0
    assert "Preview da spec migrada" in output
    assert "### Módulo 1" in output
    assert "Migrando" in output


def test_already_modular(capsys) -> None:
    code = spec.migrate_spec(FIXTURES / "spec-valid.md", dry_run=True)
    assert code == 0
    assert "já está no formato modular" in capsys.readouterr().out


def test_migrate_writes_backup(tmp_path: Path, capsys) -> None:
    target = tmp_path / "spec.md"
    target.write_text((FIXTURES / "spec-old.md").read_text(encoding="utf-8"), encoding="utf-8")
    code = spec.migrate_spec(target, dry_run=False, root=tmp_path)
    assert code == 0
    backup = tmp_path / "spec.backup.md"
    assert backup.is_file()
    assert target.read_text(encoding="utf-8").startswith("# Spec:")
    assert "Backup" in capsys.readouterr().out
