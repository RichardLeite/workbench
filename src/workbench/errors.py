"""Taxonomia de erros e exit codes do Workbench."""

from __future__ import annotations

from typing import Any

EXIT_OK = 0
EXIT_ERROR = 1
EXIT_USAGE = 2
EXIT_ENV = 3
EXIT_EXTERNAL = 4


class WorkbenchError(Exception):
    """Erro base com exit code e detalhes estruturados."""

    exit_code = EXIT_ERROR

    def __init__(
        self,
        message: str,
        *,
        details: dict[str, Any] | None = None,
        exit_code: int | None = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.details = details or {}
        if exit_code is not None:
            self.exit_code = exit_code

    def to_dict(self) -> dict[str, Any]:
        return {
            "error": self.__class__.__name__,
            "message": self.message,
            "details": self.details,
            "exit_code": self.exit_code,
        }


class UsageError(WorkbenchError):
    exit_code = EXIT_USAGE


class MissingDependencyError(WorkbenchError):
    exit_code = EXIT_ENV


class ExternalCommandError(WorkbenchError):
    exit_code = EXIT_EXTERNAL
