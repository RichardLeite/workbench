"""Métricas de processo (cycle time, tokens, defeitos, cobertura)."""

from __future__ import annotations

import json
import math
import re
import sys
from argparse import ArgumentParser, Namespace, _SubParsersAction
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from workbench.config import ConfigError, load_project_mapping
from workbench.paths import workbench_root
from workbench.process import run


def register(subparsers: _SubParsersAction) -> None:
    parser: ArgumentParser = subparsers.add_parser("metrics", help="Métricas de processo.")
    parser.add_argument("--json", action="store_true", help="Reservado para saída JSON.")
    metrics_sub = parser.add_subparsers(dest="metrics_command", required=True)
    cycle = metrics_sub.add_parser("cycle-time", help="Relatório de cycle time.")
    cycle.add_argument(
        "--mode", default="all", choices=["all", "cycle", "tokens", "defects", "coverage"]
    )
    cycle.add_argument("--since", default=None)
    cycle.add_argument("--project", default="workbench")
    cycle.set_defaults(handler=_run_cycle_time)


def _iso(timestamp: float | int) -> str:
    return (
        datetime.fromtimestamp(float(timestamp), tz=UTC)
        .isoformat(timespec="milliseconds")
        .replace("+00:00", "Z")
    )


def _days_between(first: datetime, last: datetime) -> float:
    return round((last - first).total_seconds() / 86400 * 10) / 10


def _avg(values: list[float]) -> float:
    return round(sum(values) / len(values) * 10) / 10 if values else 0


def _median(values: list[float]) -> float:
    if not values:
        return 0
    ordered = sorted(values)
    middle = len(ordered) // 2
    return ordered[middle] if len(ordered) % 2 else (ordered[middle - 1] + ordered[middle]) / 2


def _percentile(values: list[float], percentile: float) -> float:
    if not values:
        return 0
    ordered = sorted(values)
    index = math.ceil(percentile / 100 * len(ordered)) - 1
    return ordered[max(0, index)]


def collect_cycle_time(since: str | None = None) -> list[dict[str, Any]]:
    since_arg = since or "2026-01-01"
    log = run(
        [
            "git",
            "log",
            "--all",
            "--merges",
            "--oneline",
            f"--since={since_arg}",
            "--format=%H|%ct|%s",
        ],
        timeout=30,
    )
    if not log.ok or not log.stdout.strip():
        return []

    prs: list[dict[str, Any]] = []
    for line in log.stdout.splitlines():
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) < 3:
            continue
        commit_hash, timestamp, message = parts[0], parts[1], "|".join(parts[2:])
        branch_match = re.search(r"into\s+(\S+)", message)
        pr_match = re.search(r"pull request #(\d+)", message)
        parents = run(
            ["git", "log", "--format=%H", commit_hash, "-2", "--reverse"], timeout=10
        ).stdout.splitlines()
        if len(parents) < 2:
            continue
        branch_log = run(
            ["git", "log", "--format=%ct", f"{parents[0]}..{parents[1]}"], timeout=10
        ).stdout.splitlines()
        if not branch_log:
            continue
        first_ts = int(branch_log[-1])
        merge_ts = int(timestamp)
        first_date = datetime.fromtimestamp(first_ts, tz=UTC)
        merge_date = datetime.fromtimestamp(merge_ts, tz=UTC)
        prs.append(
            {
                "hash": commit_hash,
                "pr": pr_match.group(1) if pr_match else None,
                "branch": branch_match.group(1) if branch_match else None,
                "firstCommit": _iso(first_ts),
                "mergedAt": _iso(merge_ts),
                "cycleDays": _days_between(first_date, merge_date),
            }
        )
    return prs


def collect_tokens(root: Path) -> dict[str, Any]:
    base = root / ".opencode" / "knowledge" / "plans"
    tokens: dict[str, Any] = {"total": 0, "byAgent": {}, "byTask": []}
    if not base.exists():
        return tokens
    for file in sorted(base.iterdir()):
        if not file.is_file() or not file.name.startswith("checkpoint-") or file.suffix != ".json":
            continue
        try:
            data = json.loads(file.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        estimated = round(len(json.dumps(data, ensure_ascii=False)) / 4)
        tokens["total"] += estimated
        tokens["byTask"].append({"file": file.name, "estimated": estimated})
    return tokens


def _mapping(root: Path) -> dict[str, Any]:
    try:
        return load_project_mapping(root)
    except ConfigError:
        return {"projects": {}}


def resolve_project_paths(slug: str, root: Path) -> dict[str, Path | None]:
    mapping = _mapping(root)
    project = (mapping.get("projects") or {}).get(slug)
    if not isinstance(project, dict):
        raise ConfigError(f'Projeto "{slug}" não encontrado em project-mapping.json')
    repos = project.get("repos") or {}
    knowledge = project.get("knowledge")
    api_repo = repos.get("api") or repos.get("root")
    return {
        "knowledgeBugsDir": (root / str(knowledge) / "backlog" / "bugs") if knowledge else None,
        "apiCoverageLcov": (root / str(api_repo) / "coverage" / "lcov.info") if api_repo else None,
        "appCoverageLcov": (root / str(repos["app"]) / "coverage" / "lcov.info")
        if repos.get("app")
        else None,
    }


def collect_defects(slug: str, root: Path) -> dict[str, Any]:
    paths = resolve_project_paths(slug, root)
    defects: dict[str, Any] = {
        "open": 0,
        "closed": 0,
        "byPriority": {"P0": 0, "P1": 0, "P2": 0},
        "total": 0,
        "project": slug,
    }
    bugs_dir = paths["knowledgeBugsDir"]
    if bugs_dir and bugs_dir.exists():
        files = sorted(file for file in bugs_dir.iterdir() if file.suffix == ".md")
        defects["total"] = len(files)
        for file in files:
            try:
                content = file.read_text(encoding="utf-8")
            except OSError:
                continue
            if "## Status: Aberto" in content or "status: aberto" in content:
                defects["open"] += 1
            else:
                defects["closed"] += 1
            if "P0" in content or "severidade: crítica" in content:
                defects["byPriority"]["P0"] += 1
            elif "P1" in content or "severidade: alta" in content:
                defects["byPriority"]["P1"] += 1
            elif "P2" in content:
                defects["byPriority"]["P2"] += 1
    return defects


def collect_coverage(slug: str, root: Path) -> dict[str, Any]:
    paths = resolve_project_paths(slug, root)
    coverage: dict[str, Any] = {"backend": None, "frontend": None}
    for key, path in (
        ("backend", paths["apiCoverageLcov"]),
        ("frontend", paths["appCoverageLcov"]),
    ):
        if path and path.exists():
            content = path.read_text(encoding="utf-8")
            lines = re.findall(r"^DA:\d+,(\d+)", content, re.M)
            if lines:
                hit = sum(1 for value in lines if value == "1")
                coverage[key] = round(hit / len(lines) * 100) if lines else 0
    return coverage


def cycle_time(
    mode: str = "all",
    since: str | None = None,
    project: str = "workbench",
    root: Path | None = None,
) -> dict[str, Any]:
    base = root or workbench_root()
    resolve_project_paths(project, base)  # valida cedo
    repository = run(["git", "remote", "get-url", "origin"], timeout=5).stdout.strip() or "unknown"
    branch = run(["git", "branch", "--show-current"], timeout=5).stdout.strip() or "unknown"
    result: dict[str, Any] = {
        "timestamp": datetime.now(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z"),
        "mode": mode,
        "project": project,
        "repository": repository,
        "branch": branch,
    }
    if mode in {"all", "cycle"}:
        prs = collect_cycle_time(since)
        cycle_days = [pr["cycleDays"] for pr in prs if pr["cycleDays"]]
        result["cycleTime"] = {
            "prs": len(prs),
            "avg": _avg(cycle_days),
            "median": _median(cycle_days),
            "p50": _percentile(cycle_days, 50),
            "p80": _percentile(cycle_days, 80),
            "p95": _percentile(cycle_days, 95),
            "min": min(cycle_days) if cycle_days else 0,
            "max": max(cycle_days) if cycle_days else 0,
        }
    if mode in {"all", "tokens"}:
        result["tokens"] = collect_tokens(base)
    if mode in {"all", "defects"}:
        result["defects"] = collect_defects(project, base)
    if mode in {"all", "coverage"}:
        result["coverage"] = collect_coverage(project, base)
    return result


def _run_cycle_time(args: Namespace) -> int:
    try:
        result = cycle_time(args.mode, args.since, args.project)
    except ConfigError as exc:
        print(f"Erro: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0
