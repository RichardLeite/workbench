"""Servidor MCP de imagem (JSON-RPC sobre stdio)."""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from workbench import vision

SERVER_NAME = "mcp-image"
SERVER_VERSION = "0.1.0"
PROTOCOL_VERSION = "2024-11-05"
DEFAULT_MAX_BYTES = vision.DEFAULT_MAX_IMAGE_BYTES
FETCH_TIMEOUT_MS = 10_000


def logger(level: str, event: str, data: dict[str, Any] | None = None) -> None:
    payload: dict[str, Any] = {"level": level, "event": event, "ts": _now()}
    for key, value in (data or {}).items():
        if re.search(r"token|secret|password|auth|authorization", key, re.I):
            payload[key] = "[REDACTED]"
        else:
            payload[key] = value
    try:
        sys.stderr.write(json.dumps(payload, ensure_ascii=False) + "\n")
        sys.stderr.flush()
    except Exception:
        pass


def _now() -> str:
    return (
        time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
        + f".{int(time.time() * 1000) % 1000:03d}Z"
    )


def _dump(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def send_response(message: dict[str, Any]) -> None:
    try:
        sys.stdout.write(_dump(message) + "\n")
        sys.stdout.flush()
    except Exception:
        logger("error", "stdout_write_failed")


def rpc_result(request_id: Any, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def rpc_error(request_id: Any, code: int, message: str, data: Any = None) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if data is not None:
        error["data"] = data
    return {"jsonrpc": "2.0", "id": request_id, "error": error}


def ext_from_mime(mime: str) -> str:
    return {
        "image/png": "png",
        "image/jpeg": "jpg",
        "image/webp": "webp",
        "image/gif": "gif",
        "image/avif": "avif",
    }.get(mime, "bin")


def safe_unlink(path: Path | None) -> None:
    if path is None:
        return
    try:
        if path.exists():
            path.unlink()
    except OSError:
        pass


def handle_image_get_dir() -> dict[str, Any]:
    return {"ok": True, "dir": str(vision.vision_dir()), "platform": sys.platform}


def handle_image_validate(args: dict[str, Any]) -> dict[str, Any]:
    file_path = args.get("path")
    if not file_path or not isinstance(file_path, str):
        return {"ok": False, "code": "SOURCE_INVALID", "warnings": ["path is required"]}
    path = Path(file_path)
    if not path.is_file():
        return {"ok": False, "code": "SOURCE_INVALID", "warnings": ["file not found"]}
    try:
        buffer = path.read_bytes()
        mime = vision.validate_magic_header(buffer)["mime"]
        vision.assert_size_cap(buffer)
        return {"ok": True, "mime": mime, "size_bytes": len(buffer)}
    except ValueError as exc:
        message = str(exc)
        code = "SIZE_EXCEEDED" if message.startswith("SIZE_EXCEEDED") else "SOURCE_INVALID"
        return {"ok": False, "code": code, "warnings": [message]}


def handle_check_vision_error(args: dict[str, Any]) -> dict[str, Any]:
    text = args.get("text") if isinstance(args.get("text"), str) else ""
    matched = [pattern.pattern for pattern in vision.VISION_ERROR_PATTERNS if pattern.search(text)]
    return {"is_error": bool(matched), "matched_patterns": matched}


def _handle_save_path(value: str, max_bytes: int, request_id: Any) -> dict[str, Any]:
    warnings: list[str] = []
    path = Path(value)
    if not path.is_file():
        return {
            "ok": False,
            "code": "SOURCE_INVALID",
            "warnings": ["file not found"],
            "saved_path": None,
        }
    buffer = path.read_bytes()
    mime = vision.validate_magic_header(buffer)["mime"]
    vision.assert_size_cap(buffer, max_bytes)
    raw_name = re.sub(r"\.[^.]+$", "", path.name) or "unnamed"
    name = re.sub(r"[^a-z0-9._-]", "_", raw_name, flags=re.I)[:128]
    ext = ext_from_mime(mime)
    output = vision.resolve_output_path(name, ext)
    if output.exists():
        try:
            cached = output.read_bytes()
            cached_mime = vision.validate_magic_header(cached)["mime"]
            vision.assert_size_cap(cached, max_bytes)
            logger(
                "info",
                "image_save.success",
                {
                    "request_id": request_id,
                    "size_bytes": len(cached),
                    "source": "path",
                    "mime": cached_mime,
                    "cached": True,
                },
            )
            return {
                "ok": True,
                "saved_path": str(output),
                "warnings": warnings,
                "size_bytes": len(cached),
                "mime": cached_mime,
                "cached": True,
            }
        except Exception:
            safe_unlink(output)
    output.write_bytes(buffer)
    logger(
        "info",
        "image_save.success",
        {"request_id": request_id, "size_bytes": len(buffer), "source": "path", "mime": mime},
    )
    return {
        "ok": True,
        "saved_path": str(output),
        "warnings": warnings,
        "size_bytes": len(buffer),
        "mime": mime,
    }


class _SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[override]
        if not vision.is_safe_url(newurl)["ok"]:
            raise ValueError("SSRF_BLOCKED: redirect target blocked")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _download_url(url: str, max_bytes: int, timeout_ms: int) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "workbench-mcp-image"})
    opener = urllib.request.build_opener(_SafeRedirectHandler())
    chunks: list[bytes] = []
    total = 0
    try:
        with opener.open(request, timeout=timeout_ms / 1000) as response:
            while True:
                chunk = response.read(64 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise ValueError(
                        f"SIZE_EXCEEDED: {total / (1024 * 1024):.1f} MB "
                        f"exceeds {max_bytes / (1024 * 1024):.1f} MB limit"
                    )
                chunks.append(chunk)
    except urllib.error.HTTPError as exc:
        raise ValueError(f"FETCH_FAILED: HTTP {exc.code}") from exc
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"FETCH_FAILED: {exc}") from exc
    return b"".join(chunks)


def _handle_save_url(
    value: str, max_bytes: int, timeout_ms: int, request_id: Any
) -> dict[str, Any]:
    name = vision.get_url_cache_key(value)
    guessed_ext = value.split(".")[-1].split("?")[0].lower() if "." in value else "bin"
    output = vision.resolve_output_path(name, guessed_ext)
    if output.exists():
        try:
            cached = output.read_bytes()
            mime = vision.validate_magic_header(cached)["mime"]
            vision.assert_size_cap(cached, max_bytes)
            logger(
                "info",
                "image_save.success",
                {
                    "request_id": request_id,
                    "size_bytes": len(cached),
                    "source": "url",
                    "mime": mime,
                    "cached": True,
                },
            )
            return {
                "ok": True,
                "saved_path": str(output),
                "warnings": [],
                "size_bytes": len(cached),
                "mime": mime,
                "cached": True,
            }
        except Exception:
            safe_unlink(output)

    safety = vision.is_safe_url_async(value)
    if not safety["ok"]:
        logger(
            "warn",
            "image_save.error",
            {"request_id": request_id, "code": "SSRF_BLOCKED", "source": "url"},
        )
        return {
            "ok": False,
            "code": "SSRF_BLOCKED",
            "warnings": [safety.get("reason", "SSRF_BLOCKED")],
            "saved_path": None,
        }

    try:
        buffer = _download_url(value, max_bytes, timeout_ms)
    except ValueError as exc:
        message = str(exc)
        code = "SIZE_EXCEEDED" if message.startswith("SIZE_EXCEEDED") else "FETCH_FAILED"
        logger(
            "warn", "image_save.error", {"request_id": request_id, "code": code, "source": "url"}
        )
        return {"ok": False, "code": code, "warnings": [message], "saved_path": None}

    try:
        mime = vision.validate_magic_header(buffer)["mime"]
        vision.assert_size_cap(buffer, max_bytes)
        output.write_bytes(buffer)
        logger(
            "info",
            "image_save.success",
            {"request_id": request_id, "size_bytes": len(buffer), "source": "url", "mime": mime},
        )
        return {
            "ok": True,
            "saved_path": str(output),
            "warnings": [],
            "size_bytes": len(buffer),
            "mime": mime,
        }
    except ValueError as exc:
        message = str(exc)
        safe_unlink(output)
        code = "SIZE_EXCEEDED" if message.startswith("SIZE_EXCEEDED") else "MCP_UNAVAILABLE"
        logger(
            "warn", "image_save.error", {"request_id": request_id, "code": code, "source": "url"}
        )
        return {"ok": False, "code": code, "warnings": [message], "saved_path": None}


def handle_image_save(args: dict[str, Any], request_id: Any) -> dict[str, Any]:
    source = args.get("source")
    value = args.get("value")
    options = args.get("options") or {}
    max_bytes = (
        options.get("maxBytes") if isinstance(options.get("maxBytes"), int) else DEFAULT_MAX_BYTES
    )
    timeout_ms = (
        options.get("timeoutMs") if isinstance(options.get("timeoutMs"), int) else FETCH_TIMEOUT_MS
    )
    try:
        if source == "path":
            return _handle_save_path(str(value), max_bytes, request_id)
        if source == "url":
            return _handle_save_url(str(value), max_bytes, timeout_ms, request_id)
        return {
            "ok": False,
            "code": "SOURCE_INVALID",
            "warnings": [f"unknown source '{source}', expected 'path'|'url'"],
            "saved_path": None,
        }
    except ValueError as exc:
        message = str(exc)
        logger(
            "error",
            "image_save_unexpected",
            {"source": source, "request_id": request_id, "error": message},
        )
        for prefix in ("SOURCE_INVALID", "SIZE_EXCEEDED", "SSRF_BLOCKED", "FETCH_FAILED"):
            if message.startswith(prefix):
                return {"ok": False, "code": prefix, "warnings": [message], "saved_path": None}
        return {"ok": False, "code": "MCP_UNAVAILABLE", "warnings": [message], "saved_path": None}


TOOL_DEFINITIONS = [
    {
        "name": "image_save",
        "description": (
            "Save a file from a local path or URL to the vision temp directory. "
            "Detects known image formats (PNG/JPEG/WebP/GIF/AVIF) via magic header "
            "for metadata; unknown formats are saved as application/octet-stream. "
            "Enforces size cap."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "source": {
                    "type": "string",
                    "enum": ["path", "url"],
                    "description": 'Source type: "path" (local file) or "url" (HTTP/HTTPS).',
                },
                "value": {
                    "type": "string",
                    "description": 'File path (source="path") or URL (source="url").',
                },
                "options": {
                    "type": "object",
                    "properties": {
                        "maxBytes": {
                            "type": "number",
                            "description": "Override default max image size (default: 10 MB).",
                        },
                        "timeoutMs": {
                            "type": "number",
                            "description": "Override HTTP timeout in ms (default 10000).",
                        },
                    },
                    "additionalProperties": False,
                },
            },
            "required": ["source", "value"],
            "additionalProperties": False,
        },
    },
    {
        "name": "image_get_dir",
        "description": "Get the temporary directory path where vision images are stored.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "image_validate",
        "description": (
            "Validate an existing file: check existence, detect format via magic header "
            "(known formats return specific MIME, unknown formats return "
            "application/octet-stream), and size cap."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Absolute path to the image file to validate.",
                }
            },
            "required": ["path"],
            "additionalProperties": False,
        },
    },
    {
        "name": "check_vision_error",
        "description": (
            "Check if a text string matches known vision/multimodal error patterns "
            '(e.g. "model does not support images").'
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Text to scan for vision error patterns."}
            },
            "required": ["text"],
            "additionalProperties": False,
        },
    },
]


def handle_initialize(request_id: Any) -> dict[str, Any]:
    return rpc_result(
        request_id,
        {
            "protocolVersion": PROTOCOL_VERSION,
            "capabilities": {"tools": {}},
            "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
        },
    )


def handle_tools_call(request_id: Any, params: dict[str, Any]) -> dict[str, Any]:
    name = params.get("name")
    args = params.get("arguments") or {}
    logger("debug", "tools_call", {"tool": name, "request_id": request_id})
    try:
        if name == "image_save":
            result = handle_image_save(args, request_id)
        elif name == "image_get_dir":
            result = handle_image_get_dir()
        elif name == "image_validate":
            result = handle_image_validate(args)
        elif name == "check_vision_error":
            result = handle_check_vision_error(args)
        else:
            return rpc_error(request_id, -32601, f"Method not found: tools/call name='{name}'")
        return rpc_result(
            request_id,
            {"content": [{"type": "text", "text": _dump(result)}]},
        )
    except Exception as exc:
        logger(
            "error",
            "tools_call_exception",
            {"tool": name, "request_id": request_id, "error": str(exc)},
        )
        error_result = {
            "ok": False,
            "code": "MCP_UNAVAILABLE",
            "warnings": [str(exc)],
            "saved_path": None,
        }
        return rpc_result(
            request_id,
            {"content": [{"type": "text", "text": _dump(error_result)}], "isError": True},
        )


def dispatch_message(raw_line: str) -> None:
    try:
        message = json.loads(raw_line)
    except json.JSONDecodeError:
        logger("warn", "invalid_json", {"snippet": raw_line[:200]})
        return
    if not isinstance(message, dict) or message.get("jsonrpc") != "2.0":
        logger("warn", "missing_jsonrpc_version")
        return
    request_id = message.get("id")
    if request_id is None:
        if message.get("method") == "notifications/initialized":
            logger("info", "client_initialized")
        return
    method = message.get("method")
    if method == "initialize":
        send_response(handle_initialize(request_id))
    elif method == "tools/list":
        send_response(rpc_result(request_id, {"tools": TOOL_DEFINITIONS}))
    elif method == "tools/call":
        send_response(handle_tools_call(request_id, message.get("params") or {}))
    elif method == "ping":
        send_response(rpc_result(request_id, {}))
    else:
        logger("warn", "unknown_method", {"method": method})
        send_response(rpc_error(request_id, -32601, f"Method not found: {method}"))


def main() -> int:
    logger("info", "server.start", {"version": SERVER_VERSION})
    try:
        for line in sys.stdin:
            stripped = line.strip()
            if stripped:
                dispatch_message(stripped)
    except KeyboardInterrupt:
        pass
    finally:
        logger("info", "stdin_closed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
