from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def run_server(requests: list[dict]) -> tuple[list[dict], str]:
    payload = "\n".join(json.dumps(item) for item in requests) + "\n"
    env = {
        **os.environ,
        "PYTHONPATH": str(ROOT / "src"),
        "PYTHONUTF8": "1",
        "PYTHONIOENCODING": "utf-8",
    }
    process = subprocess.run(
        [sys.executable, "-m", "workbench.mcp.image"],
        input=payload,
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=30,
    )
    responses = [json.loads(line) for line in process.stdout.splitlines() if line.strip()]
    return responses, process.stderr


def test_mcp_protocol_and_tools(tmp_path: Path) -> None:
    image = tmp_path / "sample.png"
    image.write_bytes(PNG)
    requests = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
        {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {
                "name": "check_vision_error",
                "arguments": {"text": "model does not support images"},
            },
        },
        {
            "jsonrpc": "2.0",
            "id": 4,
            "method": "tools/call",
            "params": {"name": "image_validate", "arguments": {"path": str(image)}},
        },
        {
            "jsonrpc": "2.0",
            "id": 5,
            "method": "tools/call",
            "params": {"name": "image_save", "arguments": {"source": "path", "value": str(image)}},
        },
    ]
    responses, stderr = run_server(requests)
    by_id = {item["id"]: item for item in responses}
    assert by_id[1]["result"]["serverInfo"]["name"] == "mcp-image"
    tools = [tool["name"] for tool in by_id[2]["result"]["tools"]]
    assert tools == ["image_save", "image_get_dir", "image_validate", "check_vision_error"]

    error_result = json.loads(by_id[3]["result"]["content"][0]["text"])
    assert error_result["is_error"] is True

    validate_result = json.loads(by_id[4]["result"]["content"][0]["text"])
    assert validate_result["ok"] is True
    assert validate_result["mime"] == "image/png"

    save_result = json.loads(by_id[5]["result"]["content"][0]["text"])
    assert save_result["ok"] is True
    saved = Path(save_result["saved_path"])
    assert saved.is_file()
    saved.unlink()
    assert "server.start" in stderr
