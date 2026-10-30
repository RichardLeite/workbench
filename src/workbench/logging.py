"""Logging estruturado e medição de operações."""

from __future__ import annotations

import contextvars
import json
import logging
import sys
import time
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

_trace_id: contextvars.ContextVar[str] = contextvars.ContextVar("trace_id", default="-")

_LEVELS = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warn": logging.WARNING,
    "warning": logging.WARNING,
    "error": logging.ERROR,
}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname.lower(),
            "event": record.getMessage(),
            "trace_id": getattr(record, "trace_id", _trace_id.get()),
        }
        extra = getattr(record, "fields", None)
        if isinstance(extra, dict):
            payload.update(extra)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, sort_keys=True)


class TextFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        fields = getattr(record, "fields", None)
        suffix = ""
        if isinstance(fields, dict) and fields:
            suffix = " " + " ".join(f"{key}={value}" for key, value in sorted(fields.items()))
        return f"{record.levelname.lower():5} {record.getMessage()}{suffix}"


def configure(level: str = "info", fmt: str = "text") -> None:
    """Configura o logger raiz do Workbench (idempotente)."""

    root = logging.getLogger("workbench")
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(JsonFormatter() if fmt == "json" else TextFormatter())
    root.addHandler(handler)
    root.setLevel(_LEVELS.get(level.lower(), logging.INFO))
    root.propagate = False


def set_trace_id(trace_id: str) -> None:
    _trace_id.set(trace_id)


def get_trace_id() -> str:
    return _trace_id.get()


def log_event(event: str, level: str = "info", **fields: Any) -> None:
    logger = logging.getLogger("workbench")
    logger.log(
        _LEVELS.get(level.lower(), logging.INFO),
        event,
        extra={"fields": fields, "trace_id": _trace_id.get()},
    )


@contextmanager
def timed(event: str, **fields: Any) -> Iterator[None]:
    started = time.perf_counter()
    log_event(f"{event}.start", **fields)
    try:
        yield
    except Exception as exc:
        elapsed = round((time.perf_counter() - started) * 1000, 2)
        log_event(f"{event}.error", "error", duration_ms=elapsed, error=str(exc), **fields)
        raise
    else:
        elapsed = round((time.perf_counter() - started) * 1000, 2)
        log_event(f"{event}.end", duration_ms=elapsed, **fields)
