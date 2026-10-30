"""Execução de processos externos sem shell, com timeout e métricas."""

from __future__ import annotations

import os
import shutil
import subprocess
import time
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

from workbench.errors import ExternalCommandError, MissingDependencyError, WorkbenchError


@dataclass(slots=True)
class CommandResult:
    args: tuple[str, ...]
    returncode: int
    stdout: str
    stderr: str
    duration_ms: float

    @property
    def ok(self) -> bool:
        return self.returncode == 0

    def to_dict(self) -> dict[str, object]:
        return {
            "args": list(self.args),
            "returncode": self.returncode,
            "stdout": self.stdout,
            "stderr": self.stderr,
            "duration_ms": self.duration_ms,
        }


def run(
    args: Sequence[str],
    *,
    cwd: Path | str | None = None,
    timeout: float = 30.0,
    check: bool = False,
    env: Mapping[str, str] | None = None,
    input_text: str | None = None,
) -> CommandResult:
    """Executa um comando e retorna stdout/stderr/exit code."""

    if not args:
        raise ValueError("args não pode ser vazio")

    started = time.perf_counter()
    merged_env: dict[str, str] | None = None
    if env is not None:
        merged_env = {**os.environ, **env}

    try:
        completed = subprocess.run(
            list(args),
            cwd=str(cwd) if cwd is not None else None,
            env=merged_env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            input=input_text,
            shell=False,
            check=False,
        )
    except FileNotFoundError as exc:
        raise MissingDependencyError(
            f"Comando não encontrado: {args[0]}",
            details={"command": args[0]},
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise WorkbenchError(
            f"Timeout ao executar: {' '.join(args)}",
            details={"command": list(args), "timeout_s": timeout},
        ) from exc

    elapsed = round((time.perf_counter() - started) * 1000, 2)
    result = CommandResult(
        args=tuple(args),
        returncode=completed.returncode,
        stdout=completed.stdout or "",
        stderr=completed.stderr or "",
        duration_ms=elapsed,
    )
    if check and not result.ok:
        raise ExternalCommandError(
            f"Comando falhou ({result.returncode}): {' '.join(args)}",
            details=result.to_dict(),
        )
    return result


def which(name: str) -> str | None:
    return shutil.which(name)


def tool_version(
    executable: str,
    *args: str,
    timeout: float = 5.0,
) -> str | None:
    path = which(executable)
    if not path:
        return None
    try:
        result = run([path, *args], timeout=timeout)
    except WorkbenchError:
        return None
    output = (result.stdout or result.stderr).strip().splitlines()
    return output[0] if output else None
