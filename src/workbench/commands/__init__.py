"""Comandos do Workbench."""

from __future__ import annotations

from argparse import _SubParsersAction
from collections.abc import Callable

from workbench.commands import (
    ado,
    docs,
    doctor,
    hotfix,
    issue,
    knowledge,
    metrics,
    pipeline,
    release,
    repo,
    reviewers,
    spec,
    sprint,
    teams,
    validate,
    version,
    vision,
)

CommandHandler = Callable[[object], int]


def register_all(subparsers: _SubParsersAction) -> None:
    doctor.register(subparsers)
    version.register(subparsers)
    validate.register(subparsers)
    repo.register(subparsers)
    sprint.register(subparsers)
    pipeline.register(subparsers)
    ado.register(subparsers)
    hotfix.register(subparsers)
    release.register(subparsers)
    issue.register(subparsers)
    teams.register(subparsers)
    spec.register(subparsers)
    knowledge.register(subparsers)
    docs.register(subparsers)
    metrics.register(subparsers)
    reviewers.register(subparsers)
    vision.register(subparsers)
