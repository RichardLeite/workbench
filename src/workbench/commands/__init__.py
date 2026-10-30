"""Comandos do Workbench."""

from __future__ import annotations

from argparse import _SubParsersAction
from collections.abc import Callable

from workbench.commands import ado, doctor, hotfix, pipeline, repo, sprint, validate, version

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
