from __future__ import annotations

import json
from pathlib import Path

from workbench.commands import metrics


def test_statistics_helpers() -> None:
    values = [1.0, 2.0, 3.0, 4.0]
    assert metrics._avg(values) == 2.5
    assert metrics._median(values) == 2.5
    assert metrics._percentile(values, 50) == 2.0
    assert metrics._percentile(values, 95) == 4.0
    assert metrics._avg([]) == 0
    assert metrics._median([]) == 0


def test_collect_defects_and_coverage(tmp_path: Path) -> None:
    config = tmp_path / ".opencode" / "config" / "project-mapping.json"
    config.parent.mkdir(parents=True)
    config.write_text(
        json.dumps(
            {
                "projects": {
                    "proj": {
                        "knowledge": "knowledge",
                        "repos": {"api": "api", "app": "app"},
                    }
                }
            }
        ),
        encoding="utf-8",
    )
    bugs = tmp_path / "knowledge" / "backlog" / "bugs"
    bugs.mkdir(parents=True)
    (bugs / "bug-1.md").write_text("## Status: Aberto\nP0\n", encoding="utf-8")
    (bugs / "bug-2.md").write_text("P1\n", encoding="utf-8")

    lcov = tmp_path / "api" / "coverage" / "lcov.info"
    lcov.parent.mkdir(parents=True)
    lcov.write_text("DA:1,1\nDA:2,0\n", encoding="utf-8")

    defects = metrics.collect_defects("proj", tmp_path)
    assert defects["total"] == 2
    assert defects["open"] == 1
    assert defects["byPriority"]["P0"] == 1
    assert metrics.collect_coverage("proj", tmp_path)["backend"] == 50


def test_tokens_from_checkpoints(tmp_path: Path) -> None:
    plans = tmp_path / ".opencode" / "knowledge" / "plans"
    plans.mkdir(parents=True)
    (plans / "checkpoint-a.json").write_text('{"a": 1}', encoding="utf-8")
    tokens = metrics.collect_tokens(tmp_path)
    assert tokens["total"] > 0
    assert tokens["byTask"][0]["file"] == "checkpoint-a.json"
