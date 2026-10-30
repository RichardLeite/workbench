"""Comandos do Workbench."""

from __future__ import annotations

from argparse import _SubParsersAction
from collections.abc import Callable

from workbench.commands import (
    docs,
    doctor,
    issue,
    knowledge,
    metrics,
    process,
    projects,
    release,
    repo,
    reviewers,
    spec,
    sync,
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
    process.register(subparsers)
    projects.register(subparsers)
    release.register(subparsers)
    issue.register(subparsers)
    spec.register(subparsers)
    sync.register(subparsers)
    knowledge.register(subparsers)
    docs.register(subparsers)
    metrics.register(subparsers)
    reviewers.register(subparsers)
    vision.register(subparsers)
