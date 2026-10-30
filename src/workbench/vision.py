"""Utilitários de imagem e detecção de erros de visão."""

from __future__ import annotations

import base64
import hashlib
import ipaddress
import json
import os
import re
import socket
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024
DEFAULT_TIMEOUT_MS = 10_000
MAX_REDIRECTS = 5

VISION_ERROR_PATTERNS = [
    re.compile(r"model does not support (image|vision)", re.I),
    re.compile(r"cannot (process|analyze|view|see) (image|this)", re.I),
    re.compile(r"unable to (process|analyze) (image|this)", re.I),
    re.compile(r"i can('?|no)t see images?", re.I),
    re.compile(r"no (image )?vision (capability|support)", re.I),
    re.compile(r"image (analysis|processing) (unavailable|not supported)", re.I),
    re.compile(r"unsupported (content type|media type): image", re.I),
    re.compile(r"vision[- ]?capable (model|required)", re.I),
    re.compile(r"please provide (a |the )?(text|description)", re.I),
    re.compile(r"i('?| do not| don't) have (access to )?(image|vision)", re.I),
    re.compile(r"multimodal (capability|model) (required|needed)", re.I),
    re.compile(r"image input (was|is) (not|never) (provided|supported)", re.I),
    re.compile(r"failed to (decode|load|read) image", re.I),
    re.compile(r"content policy (rejected|blocked): image", re.I),
    re.compile(r"no image attachment (found|provided)", re.I),
    re.compile(r"this (model|version) (cannot|doesn't) (handle|support) image", re.I),
    re.compile(r"image url (is|was) (inaccessible|blocked|invalid)", re.I),
    re.compile(r"cannot read (binary|image) file", re.I),
    re.compile(r"unsupported (image )?format", re.I),
]

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"}


def load_env() -> None:
    root = Path(__file__).resolve().parents[2]
    env_path = root / ".env"
    if not env_path.is_file():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        os.environ.setdefault(key, value)


def validate_magic_header(buffer: bytes) -> dict[str, Any]:
    if not isinstance(buffer, (bytes, bytearray)) or len(buffer) < 3:
        raise ValueError("MIME_INVALID: buffer too short or not a Buffer")
    data = bytes(buffer)
    if len(data) >= 8 and data[0:8] == b"\x89PNG\r\n\x1a\n":
        return {"ok": True, "mime": "image/png"}
    if data[0:3] == b"\xff\xd8\xff":
        return {"ok": True, "mime": "image/jpeg"}
    if len(data) >= 12 and data[0:4] == b"RIFF" and data[8:12] == b"WEBP":
        return {"ok": True, "mime": "image/webp"}
    if len(data) >= 6 and data[0:4] == b"GIF8" and data[4] in (0x37, 0x39) and data[5] == 0x61:
        return {"ok": True, "mime": "image/gif"}
    if len(data) >= 12 and data[4:8] == b"ftyp" and data[8:12] == b"avif":
        return {"ok": True, "mime": "image/avif"}
    return {"ok": True, "mime": "application/octet-stream"}


def vision_dir() -> Path:
    directory = Path(tempfile.gettempdir()) / "opencode"
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def resolve_output_path(name: str, ext: str) -> Path:
    if not re.fullmatch(r"[a-z0-9][a-z0-9._-]{0,127}", name, re.I):
        raise ValueError(f"SOURCE_INVALID: invalid output name '{name}'")
    if not re.fullmatch(r"[a-z0-9]{1,8}", ext, re.I):
        raise ValueError(f"SOURCE_INVALID: invalid extension '{ext}'")
    return vision_dir() / f"vision-{name}.{ext}"


def resolve_vision_path(ext: str) -> Path:
    random_part = os.urandom(4).hex()
    return resolve_output_path(f"{int(time.time() * 1000)}-{random_part}", ext)


def get_url_cache_key(url: str) -> str:
    return hashlib.sha256(url.encode("utf-8")).hexdigest()[:8]


def parse_ipv4(addr: str) -> int | None:
    parts = addr.split(".")
    if len(parts) != 4:
        return None
    result = 0
    for part in parts:
        if not part.isdigit():
            return None
        value = int(part)
        if value < 0 or value > 255 or str(value) != part:
            return None
        result = result * 256 + value
    return result


def is_private_ipv4(ip4: int) -> bool:
    return (
        (ip4 >> 24) == 127
        or (ip4 >> 24) == 10
        or (ip4 >> 20) == 0xAC1
        or (ip4 >> 16) == 0xC0A8
        or (ip4 >> 16) == 0xA9FE
        or (ip4 >> 24) == 0
    )


def is_private_ipv6(addr: str) -> bool:
    clean = addr.strip("[]").lower()
    if clean in {"::1", "0000:0000:0000:0000:0000:0000:0000:0001"}:
        return True
    if re.match(r"^f[cd]", clean):
        return True
    if re.match(r"^fe[89ab]", clean):
        return True
    if re.match(r"^ff", clean):
        return True
    if clean in {"::", "0000:0000:0000:0000:0000:0000:0000:0000"}:
        return True
    mapped = re.fullmatch(r"::ffff:(\d+\.\d+\.\d+\.\d+)", clean)
    if mapped:
        v4 = parse_ipv4(mapped.group(1))
        if v4 is not None and is_private_ipv4(v4):
            return True
    return False


def is_blocked_ip(ip: str) -> bool:
    try:
        address = ipaddress.ip_address(ip)
    except ValueError:
        return True
    if address.version == 4:
        return is_private_ipv4(int(address))
    return is_private_ipv6(ip)


def _hostname_is_local(hostname: str) -> bool:
    lower = hostname.lower()
    return lower == "localhost" or lower.endswith(".localhost")


def is_safe_url(url: str) -> dict[str, Any]:
    try:
        parsed = urllib.parse.urlparse(url)
    except ValueError:
        return {"ok": False, "reason": "SSRF_BLOCKED"}
    if parsed.scheme not in {"http", "https"}:
        return {"ok": False, "reason": "SSRF_BLOCKED"}
    hostname = parsed.hostname or ""
    bare_host = hostname.strip("[]")
    try:
        ipaddress.ip_address(bare_host)
    except ValueError:
        if _hostname_is_local(hostname):
            return {"ok": False, "reason": "SSRF_BLOCKED"}
        return {"ok": True}
    if is_blocked_ip(bare_host):
        return {"ok": False, "reason": "SSRF_BLOCKED"}
    return {"ok": True}


def is_safe_url_async(url: str, timeout: float = 5.0) -> dict[str, Any]:
    sync = is_safe_url(url)
    if not sync["ok"]:
        return sync
    parsed = urllib.parse.urlparse(url)
    hostname = parsed.hostname or ""
    try:
        ipaddress.ip_address(hostname.strip("[]"))
        return {"ok": True}
    except ValueError:
        pass
    if _hostname_is_local(hostname):
        return {"ok": False, "reason": "SSRF_BLOCKED"}

    def lookup() -> list[str]:
        return [item[4][0] for item in socket.getaddrinfo(hostname, None, proto=socket.IPPROTO_TCP)]

    try:
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(lookup)
            addresses = future.result(timeout=timeout)
    except Exception:
        return {"ok": False, "reason": "SSRF_BLOCKED"}
    if not addresses or any(is_blocked_ip(address) for address in addresses):
        return {"ok": False, "reason": "SSRF_BLOCKED"}
    return {"ok": True}


def _ado_headers() -> dict[str, str] | None:
    load_env()
    token = os.environ.get("ADO_MCP_AUTH_TOKEN")
    if not token:
        return None
    auth = base64.b64encode(f":{token}".encode()).decode("ascii")
    return {"Authorization": f"Basic {auth}", "Accept": "application/json"}


def ado_get(url: str) -> dict[str, Any]:
    headers = _ado_headers()
    if headers is None:
        raise ValueError("FETCH_FAILED: ADO_MCP_AUTH_TOKEN not set")
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=DEFAULT_TIMEOUT_MS / 1000) as response:
            body = response.read()
    except urllib.error.HTTPError as exc:
        raise ValueError(f"FETCH_FAILED: ADO returned HTTP {exc.code} for {url}") from exc
    except Exception as exc:
        raise ValueError(f"FETCH_FAILED: {exc}") from exc
    try:
        return json.loads(body.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"FETCH_FAILED: invalid JSON response from {url}") from exc


def _field_regexes(org: str) -> tuple[re.Pattern[str], re.Pattern[str]]:
    org_part = re.escape(org)
    html = re.compile(
        rf'<img[^>]+src="[^"]*/{org_part}/([a-f0-9-]+)/_apis/wit/attachments/([a-f0-9-]+)\?fileName=([^"&\s]+)',
        re.I,
    )
    markdown = re.compile(
        rf"!\[.*?\]\([^)]*/{org_part}/([a-f0-9-]+)/_apis/wit/attachments/([a-f0-9-]+)\?fileName=([^)&\s]+)",
        re.I,
    )
    return html, markdown


def extract_attachments_from_fields(
    work_item: dict[str, Any], org: str = ""
) -> list[dict[str, Any]]:
    org = org or os.environ.get("AZURE_DEVOPS_ORG", "")
    fields = (work_item or {}).get("fields") or {}
    texts = [
        fields.get("System.Description"),
        fields.get("Microsoft.VSTS.Common.AcceptanceCriteria"),
    ]
    attachments: list[dict[str, Any]] = []
    seen: set[str] = set()
    html_regex, md_regex = _field_regexes(org)
    for text in texts:
        if not text:
            continue
        for pattern, source in ((html_regex, "field_html"), (md_regex, "field_markdown")):
            for match in pattern.finditer(text):
                attachment_id = match.group(2)
                if attachment_id in seen:
                    continue
                seen.add(attachment_id)
                attachments.append(
                    {
                        "attachmentId": attachment_id,
                        "name": urllib.parse.unquote(match.group(3)),
                        "projectId": match.group(1),
                        "source": source,
                    }
                )
    return attachments


def extract_attachments_from_comments(work_item_id: int, org: str = "") -> list[dict[str, Any]]:
    org = org or os.environ.get("AZURE_DEVOPS_ORG", "")
    attachments: list[dict[str, Any]] = []
    seen: set[str] = set()
    try:
        data = ado_get(
            f"https://dev.azure.com/{org}/_apis/wit/workItems/{work_item_id}?api-version=7.0"
        )
        comments_url = ((data.get("_links") or {}).get("workItemComments") or {}).get("href")
        if not comments_url:
            return attachments
        final_url = comments_url + ("&" if "?" in comments_url else "?") + "$top=100"
        comments = ado_get(final_url).get("comments") or []
        html_regex, md_regex = _field_regexes(org)
        for comment in comments:
            text = comment.get("text") or ""
            for pattern, source in ((html_regex, "comment_html"), (md_regex, "comment_markdown")):
                for match in pattern.finditer(text):
                    attachment_id = match.group(2)
                    if attachment_id in seen:
                        continue
                    seen.add(attachment_id)
                    attachments.append(
                        {
                            "attachmentId": attachment_id,
                            "name": urllib.parse.unquote(match.group(3)),
                            "projectId": match.group(1),
                            "source": source,
                            "commentId": comment.get("id"),
                        }
                    )
    except Exception:
        return attachments
    return attachments


def list_image_attachments(work_item_id: int, org: str = "") -> list[dict[str, Any]]:
    if not isinstance(work_item_id, int) or work_item_id <= 0:
        raise ValueError("FETCH_FAILED: workItemId must be a number")
    org = org or os.environ.get("AZURE_DEVOPS_ORG", "")
    data = ado_get(
        f"https://dev.azure.com/{org}/_apis/wit/workItems/{work_item_id}"
        "?$expand=relations&api-version=7.0"
    )
    relations = data.get("relations") if isinstance(data.get("relations"), list) else []
    results: list[dict[str, Any]] = []
    seen: set[str] = set()
    for relation in relations:
        if relation.get("rel") != "AttachedFile":
            continue
        attributes = relation.get("attributes") or {}
        match = re.search(r"attachments/([0-9a-f-]{36})", relation.get("url") or "", re.I)
        if not match:
            continue
        attachment_id = match.group(1)
        if attachment_id in seen:
            continue
        seen.add(attachment_id)
        results.append(
            {
                "attachmentId": attachment_id,
                "name": attributes.get("name") or "unknown",
                "resourceSize": attributes.get("resourceSize")
                if isinstance(attributes.get("resourceSize"), int)
                else 0,
                "url": relation.get("url"),
                "source": "attached_file",
            }
        )
    for attachment in extract_attachments_from_fields(data, org):
        if attachment["attachmentId"] not in seen:
            seen.add(attachment["attachmentId"])
            results.append(attachment)
    for attachment in extract_attachments_from_comments(work_item_id, org):
        if attachment["attachmentId"] not in seen:
            seen.add(attachment["attachmentId"])
            results.append(attachment)
    return results


def download_ado_attachment(
    work_item_id: int,
    attachment_id: str,
    org: str = "",
    max_bytes: int = DEFAULT_MAX_IMAGE_BYTES,
) -> bytes:
    if not attachment_id:
        raise ValueError("FETCH_FAILED: attachmentId is required")
    headers = _ado_headers()
    if headers is None:
        raise ValueError("FETCH_FAILED: ADO_MCP_AUTH_TOKEN not set")
    org = org or os.environ.get("AZURE_DEVOPS_ORG", "")
    url = f"https://dev.azure.com/{org}/_apis/wit/attachments/{attachment_id}?api-version=7.0"
    request = urllib.request.Request(
        url, headers={**headers, "Content-Type": "application/octet-stream"}
    )
    chunks: list[bytes] = []
    total = 0
    try:
        with urllib.request.urlopen(request, timeout=DEFAULT_TIMEOUT_MS / 1000) as response:
            while True:
                chunk = response.read(64 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > max_bytes:
                    raise ValueError(
                        f"SIZE_EXCEEDED during stream: {total / (1024 * 1024):.1f} MB "
                        f"exceeds {max_bytes / (1024 * 1024):.1f} MB limit"
                    )
                chunks.append(chunk)
    except urllib.error.HTTPError as exc:
        raise ValueError(
            f"FETCH_FAILED: ADO returned HTTP {exc.code} for attachment {attachment_id}"
        ) from exc
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"FETCH_FAILED: {exc}") from exc
    return b"".join(chunks)


def detect_vision_error(text: str) -> bool:
    if not text or not isinstance(text, str):
        return False
    return any(pattern.search(text) for pattern in VISION_ERROR_PATTERNS)


def assert_size_cap(buffer: bytes, max_bytes: int = DEFAULT_MAX_IMAGE_BYTES) -> None:
    if not isinstance(buffer, (bytes, bytearray)):
        raise ValueError("SIZE_EXCEEDED: input is not a Buffer")
    if len(buffer) > max_bytes:
        raise ValueError(
            f"SIZE_EXCEEDED: buffer {len(buffer) / (1024 * 1024):.1f} MB "
            f"exceeds limit of {max_bytes / (1024 * 1024):.1f} MB"
        )
