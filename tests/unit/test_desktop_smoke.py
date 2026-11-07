from __future__ import annotations

from pathlib import Path

from workbench.desktop_smoke import check_log, read_log_since


def test_detects_schema_rejection() -> None:
    log = (
        'time=... level=WARN message="schema rejection" kind=Body '
        'reason="Expected ConfigV2.Reference.Local"\n'
    )
    assert check_log(log)


def test_detects_duplicate_agent() -> None:
    log = 'time=... level=WARN message="duplicate agent name" name=orquestrador\n'
    assert check_log(log)


def test_accepts_clean_startup() -> None:
    log = "time=... level=INFO message=init count=35\n"
    assert check_log(log) == []


def test_reads_only_new_log_content(tmp_path: Path) -> None:
    log = tmp_path / "opencode.log"
    log.write_text('message="schema rejection"\n', encoding="utf-8")
    offset = log.stat().st_size
    with log.open("a", encoding="utf-8") as handle:
        handle.write("message=init count=35\n")

    new_content = read_log_since(log, offset)

    assert "schema rejection" not in new_content
    assert "init count=35" in new_content
    assert check_log(new_content) == []
