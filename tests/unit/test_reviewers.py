from __future__ import annotations

import json
import random
from argparse import Namespace
from pathlib import Path

from workbench.commands import reviewers


def write_config(root: Path) -> Path:
    path = root / ".opencode" / "config" / "eligible-reviewers.json"
    path.parent.mkdir(parents=True)
    path.write_text(
        json.dumps(
            {
                "constraints": {"maxReviewsPerPerson": 5},
                "reviewers": [
                    {
                        "name": "Pessoa Um",
                        "email": "um@example.com",
                        "github": "um",
                        "seniority": "pleno",
                        "weightMultiplier": 3,
                        "active": True,
                        "reviewCount": 0,
                    },
                    {
                        "name": "Pessoa Dois",
                        "email": "dois@example.com",
                        "github": "dois",
                        "seniority": "senior",
                        "weightMultiplier": 2,
                        "active": True,
                        "reviewCount": 0,
                    },
                ],
            }
        ),
        encoding="utf-8",
    )
    return path


def args(**overrides):
    values = {
        "complexity": "simples",
        "author": None,
        "count": "1",
        "pr": None,
        "repo": None,
        "reset": False,
        "seed": 42,
        "json": False,
    }
    values.update(overrides)
    return Namespace(**values)


def test_sort_is_deterministic_with_seed(tmp_path: Path, monkeypatch, capsys) -> None:
    write_config(tmp_path)
    monkeypatch.setenv("WB_ROOT", str(tmp_path))
    code = reviewers._run_sort(args())
    assert code == 0
    output = json.loads(capsys.readouterr().out)
    assert len(output["selected"]) == 1
    assert output["algorithm"]["totalEligible"] == 2

    weighted = reviewers._weights(
        [
            {"name": "Pessoa Um", "github": "um", "weightMultiplier": 3, "reviewCount": 0},
            {"name": "Pessoa Dois", "github": "dois", "weightMultiplier": 2, "reviewCount": 0},
        ]
    )
    first = reviewers._pick(weighted, 1, None, random.Random(42))
    second = reviewers._pick(weighted, 1, None, random.Random(42))
    assert first["selected"][0]["github"] == second["selected"][0]["github"]


def test_reset_zeroes_counts(tmp_path: Path, monkeypatch, capsys) -> None:
    path = write_config(tmp_path)
    monkeypatch.setenv("WB_ROOT", str(tmp_path))
    code = reviewers._run_sort(args(reset=True))
    assert code == 0
    assert json.loads(capsys.readouterr().out)["reset"] is True
    config = json.loads(path.read_text(encoding="utf-8"))
    assert all(reviewer["reviewCount"] == 0 for reviewer in config["reviewers"])
