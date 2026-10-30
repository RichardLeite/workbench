"""Sorteio ponderado de revisores."""

from __future__ import annotations

import json
import os
import random
import sys
import time
from argparse import ArgumentParser, Namespace, _SubParsersAction
from datetime import date
from pathlib import Path
from typing import Any

from workbench.config import ConfigError, load_config
from workbench.paths import config_dir, workbench_root
from workbench.process import run

VALID_COMPLEXITIES = ["complexo", "moderado", "simples"]
LOCK_TTL_SECONDS = 30


def register(subparsers: _SubParsersAction) -> None:
    parser: ArgumentParser = subparsers.add_parser("reviewers", help="Sorteio de revisores.")
    parser.add_argument("--json", action="store_true", help="Reservado para saída JSON.")
    reviewers_sub = parser.add_subparsers(dest="reviewers_command", required=True)
    sort = reviewers_sub.add_parser("sort", help="Sorteia revisores para um PR.")
    sort.add_argument("--complexity", default=None, choices=VALID_COMPLEXITIES)
    sort.add_argument("--author", default=None)
    sort.add_argument("--count", default="1")
    sort.add_argument("--pr", default=None)
    sort.add_argument("--repo", default=None)
    sort.add_argument("--reset", action="store_true")
    sort.add_argument("--seed", type=int, default=None, help="Semente para testes.")
    sort.set_defaults(handler=_run_sort)


def _load_config(root: Path) -> dict[str, Any]:
    return load_config("eligible-reviewers.json", root)


def _write_config(config: dict[str, Any], root: Path) -> None:
    path = config_dir(root) / "eligible-reviewers.json"
    path.write_text(json.dumps(config, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _lock_path(root: Path) -> Path:
    return config_dir(root) / "reviewer.lock"


def _acquire_lock(root: Path) -> bool:
    path = _lock_path(root)
    for _ in range(25):
        try:
            fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(os.getpid()).encode("utf-8"))
            os.close(fd)
            return True
        except FileExistsError:
            try:
                age = time.time() - path.stat().st_mtime
                if age > LOCK_TTL_SECONDS:
                    path.unlink()
                    continue
            except OSError:
                continue
            time.sleep(0.2)
    return False


def _release_lock(root: Path) -> None:
    path = _lock_path(root)
    try:
        if path.exists():
            pid = path.read_text(encoding="utf-8").strip()
            if pid in {str(os.getpid()), ""}:
                path.unlink()
    except OSError:
        pass


def _daily_reset(config: dict[str, Any]) -> bool:
    today = date.today().isoformat()
    if config.get("_lastReset") != today:
        for reviewer in config.get("reviewers", []):
            reviewer["reviewCount"] = 0
        config["_lastReset"] = today
        return True
    return False


def _weights(reviewers: list[dict[str, Any]]) -> list[dict[str, Any]]:
    max_count = max((int(reviewer.get("reviewCount") or 0) for reviewer in reviewers), default=0)
    max_count = max(max_count, 1)
    weighted = []
    for reviewer in reviewers:
        base = reviewer.get("weightMultiplier") or 1
        load_bonus = 1 + ((max_count - int(reviewer.get("reviewCount") or 0)) / max_count) * 2
        weighted.append(
            {
                **reviewer,
                "displayName": reviewer.get("name"),
                "finalWeight": round(base * load_bonus, 2),
            }
        )
    return weighted


def _pick(
    weighted: list[dict[str, Any]],
    count: int,
    exclude_github: str | None,
    rng: random.Random,
) -> dict[str, Any]:
    eligible = [reviewer for reviewer in weighted if reviewer.get("active") is not False]
    if exclude_github:
        eligible = [reviewer for reviewer in eligible if reviewer.get("github") != exclude_github]
    if not eligible:
        return {"selected": [], "error": "Nenhum revisor elegível disponível"}

    picks: list[dict[str, Any]] = []
    remaining = list(eligible)
    for _ in range(count):
        if not remaining:
            break
        total = sum(reviewer["finalWeight"] for reviewer in remaining)
        value = rng.random() * total
        chosen = 0
        for index, reviewer in enumerate(remaining):
            value -= reviewer["finalWeight"]
            if value <= 0:
                chosen = index
                break
        picks.append(remaining.pop(chosen))
    return {"selected": picks}


def _filter_complexity(reviewers: list[dict[str, Any]], complexity: str) -> list[dict[str, Any]]:
    if complexity == "simples":
        return reviewers
    return [reviewer for reviewer in reviewers if reviewer.get("seniority") in {"pleno", "senior"}]


def detect_complexity_from_pr(pr_number: str, repo: str) -> dict[str, str] | None:
    try:
        result = run(
            [
                "gh",
                "pr",
                "view",
                str(pr_number),
                "--json",
                "additions,deletions,changedFiles,files",
                "--repo",
                repo,
            ],
            timeout=15,
        )
    except Exception:
        return None
    if not result.ok:
        return None
    try:
        data = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None

    additions = int(data.get("additions") or 0)
    deletions = int(data.get("deletions") or 0)
    total = additions + deletions
    file_count = int(data.get("changedFiles") or 0)
    files = data.get("files") or []
    new_files = sum(1 for file in files if file.get("changeType") == "ADDED")
    modified = sum(1 for file in files if file.get("changeType") == "MODIFIED")
    core = [file for file in files if _touches_core(str(file.get("path", "")))]
    mostly_docs = bool(files) and all(
        _is_config_or_doc(str(file.get("path", ""))) for file in files
    )

    if total > 800 or file_count > 12 or (total > 300 and core and modified > 3):
        return {
            "complexity": "complexo",
            "emoji": "🔴",
            "reason": (
                f"{total} linhas em {file_count} arquivos "
                f"({new_files} novos, {modified} modificados)"
            ),
        }
    if mostly_docs and total <= 300:
        return {
            "complexity": "simples",
            "emoji": "🟢",
            "reason": (f"{total} linhas em {file_count} arquivos (majoritariamente config/doc)"),
        }
    if total > 120 or file_count > 5 or core:
        return {
            "complexity": "moderado",
            "emoji": "🟡",
            "reason": (
                f"{total} linhas em {file_count} arquivos "
                f"({new_files} novos, {modified} modificados)"
            ),
        }
    return {
        "complexity": "simples",
        "emoji": "🟢",
        "reason": f"{total} linhas em {file_count} arquivos",
    }


def _touches_core(path: str) -> bool:
    lower = path.lower()
    if not lower.endswith(
        (".js", ".ts", ".py", ".rb", ".java", ".go", ".rs", ".php", ".jsx", ".tsx")
    ):
        return False
    return not any(part in lower for part in ("/test/", "/spec/", "/__tests__/"))


def _is_config_or_doc(path: str) -> bool:
    lower = path.lower()
    return lower.endswith(".md") or any(part in lower for part in ("/config/", "/test/", "/spec/"))


def _run_sort(args: Namespace) -> int:
    root = workbench_root()
    try:
        count = int(args.count)
    except ValueError:
        count = 1
    if count < 1 or count > 6:
        print(json.dumps({"error": "--count deve ser 1 ou 2 (máx 6)"}), file=sys.stderr)
        return 1
    if args.complexity and args.complexity not in VALID_COMPLEXITIES:
        print(
            json.dumps(
                {
                    "error": (
                        f"Complexidade inválida: {args.complexity}. "
                        f"Use: {', '.join(VALID_COMPLEXITIES)}"
                    )
                }
            ),
            file=sys.stderr,
        )
        return 1
    if args.pr and not str(args.pr).isdigit():
        print(
            json.dumps({"error": f"--pr deve ser um número. Recebido: {args.pr}"}), file=sys.stderr
        )
        return 1

    complexity = args.complexity or "moderado"
    repo = args.repo or f"{os.environ.get('GITHUB_OWNER', '')}/.workbench"
    if args.pr:
        detected = detect_complexity_from_pr(str(args.pr), repo)
        if detected:
            complexity = detected["complexity"]
            print(
                f"[auto] Complexidade detectada: {detected['emoji']} {detected['complexity']} "
                f"({detected['reason']})",
                file=sys.stderr,
            )
        else:
            print(
                "[auto] Não foi possível detectar complexidade. Usando padrão: moderado.",
                file=sys.stderr,
            )

    try:
        config = _load_config(root)
        if args.reset:
            for reviewer in config.get("reviewers", []):
                reviewer["reviewCount"] = 0
            config["_lastReset"] = date.today().isoformat()
            _write_config(config, root)
            print(json.dumps({"reset": True, "message": "reviewCount zerado para todos"}))
            return 0

        did_reset = _daily_reset(config)
        if not _acquire_lock(root):
            print(json.dumps({"error": "Could not acquire lock after 25 retries"}), file=sys.stderr)
            return 1
        try:
            fresh = _load_config(root)
            reviewers = fresh.get("reviewers", [])
            max_allowed = (fresh.get("constraints") or {}).get("maxReviewsPerPerson", 5)
            eligible = [
                reviewer
                for reviewer in _filter_complexity(reviewers, complexity)
                if int(reviewer.get("reviewCount") or 0) < max_allowed
            ]
            if not eligible:
                eligible = _filter_complexity(reviewers, complexity)
                print(
                    "[aviso] Todos os revisores atingiram o limite. Usando lista completa.",
                    file=sys.stderr,
                )

            weighted = _weights(eligible)
            rng = random.Random(args.seed) if args.seed is not None else random.Random()
            result = _pick(weighted, count, args.author, rng)
            if result.get("error"):
                print(json.dumps({"error": result["error"]}), file=sys.stderr)
                return 1

            for pick in result["selected"]:
                reviewer = next(
                    (
                        item
                        for item in fresh.get("reviewers", [])
                        if item.get("github") == pick.get("github")
                    ),
                    None,
                )
                if reviewer:
                    reviewer["reviewCount"] = int(reviewer.get("reviewCount") or 0) + 1
                    reviewer["lastReviewDate"] = date.today().isoformat()
            if did_reset:
                fresh["_lastReset"] = date.today().isoformat()
            _write_config(fresh, root)

            label = {"complexo": "🔴 Complexo", "moderado": "🟡 Moderado", "simples": "🟢 Simples"}[
                complexity
            ]
            output = {
                "complexity": {"label": label, "value": complexity},
                "selected": [
                    {
                        "name": pick.get("name"),
                        "email": pick.get("email"),
                        "github": pick.get("github"),
                        "seniority": pick.get("seniority"),
                        "weight": pick.get("finalWeight"),
                        "reviewCount": next(
                            (
                                item.get("reviewCount")
                                for item in fresh.get("reviewers", [])
                                if item.get("github") == pick.get("github")
                            ),
                            0,
                        ),
                    }
                    for pick in result["selected"]
                ],
                "algorithm": {
                    "totalEligible": len(eligible),
                    "weights": [
                        {
                            "name": item.get("name"),
                            "weight": item.get("finalWeight"),
                            "seniority": item.get("seniority"),
                        }
                        for item in weighted
                    ],
                },
                "reset": did_reset,
            }
            print(json.dumps(output, ensure_ascii=False, indent=2))
            return 0
        finally:
            _release_lock(root)
    except ConfigError as exc:
        _release_lock(root)
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        return 1
