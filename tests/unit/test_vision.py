from __future__ import annotations

import pytest

from workbench import vision

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
JPEG = b"\xff\xd8\xff" + b"\x00" * 16
WEBP = b"RIFF\x00\x00\x00\x00WEBP" + b"\x00" * 8
GIF = b"GIF89a" + b"\x00" * 8
AVIF = b"\x00\x00\x00\x18ftypavif" + b"\x00" * 8


@pytest.mark.parametrize(
    ("data", "mime"),
    [
        (PNG, "image/png"),
        (JPEG, "image/jpeg"),
        (WEBP, "image/webp"),
        (GIF, "image/gif"),
        (AVIF, "image/avif"),
        (b"hello world", "application/octet-stream"),
    ],
)
def test_validate_magic_header(data: bytes, mime: str) -> None:
    assert vision.validate_magic_header(data) == {"ok": True, "mime": mime}


def test_validate_magic_header_too_short() -> None:
    with pytest.raises(ValueError, match="MIME_INVALID"):
        vision.validate_magic_header(b"\x00")


def test_cache_key() -> None:
    key = vision.get_url_cache_key("https://example.com/image.png")
    assert len(key) == 8
    assert int(key, 16) >= 0


def test_blocked_ips() -> None:
    assert vision.is_blocked_ip("127.0.0.1") is True
    assert vision.is_blocked_ip("10.0.0.1") is True
    assert vision.is_blocked_ip("192.168.1.1") is True
    assert vision.is_blocked_ip("::1") is True
    assert vision.is_blocked_ip("8.8.8.8") is False


def test_safe_url() -> None:
    assert vision.is_safe_url("https://example.com/image.png")["ok"] is True
    assert vision.is_safe_url("ftp://example.com")["ok"] is False
    assert vision.is_safe_url("http://127.0.0.1/image.png")["ok"] is False
    assert vision.is_safe_url("http://localhost/image.png")["ok"] is False


def test_detect_vision_error() -> None:
    assert vision.detect_vision_error("model does not support images") is True
    assert vision.detect_vision_error("all good") is False


def test_size_cap() -> None:
    vision.assert_size_cap(b"123", 3)
    with pytest.raises(ValueError, match="SIZE_EXCEEDED"):
        vision.assert_size_cap(b"1234", 3)


def test_output_path_validation() -> None:
    path = vision.resolve_output_path("example", "png")
    assert path.name == "vision-example.png"
    with pytest.raises(ValueError, match="SOURCE_INVALID"):
        vision.resolve_output_path("bad/name", "png")
    with pytest.raises(ValueError, match="SOURCE_INVALID"):
        vision.resolve_output_path("example", "bad/ext")
