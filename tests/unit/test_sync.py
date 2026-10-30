from __future__ import annotations

import json
from pathlib import Path

from workbench.commands import sync


def test_slug_and_frontmatter() -> None:
    assert sync.slug("Backend Dev!") == "backend-dev"
    frontmatter, body = sync.parse_frontmatter("---\nname: Teste\ntools: Read\n---\n\nCorpo")
    assert frontmatter == {"name": "Teste", "tools": "Read"}
    assert body == "\nCorpo"


def test_model_and_tools() -> None:
    assert sync.model_for("orquestrador") == "opus"
    assert sync.model_for("revisor") == "haiku"
    assert sync.model_for("backend-dev") == "sonnet"
    assert sync.tools_for({"permission": {"write": "deny", "edit": "deny", "bash": "deny"}}) == [
        "Read",
        "Grep",
        "Glob",
    ]
    assert sync.tools_for({"permission": {"write": "allow", "edit": "allow"}}) is None


def test_gen_mcp_and_settings(tmp_path: Path) -> None:
    config = {
        "mcp": {
            "enabled": {"command": ["uv", "run", "python", "-m", "x"], "enabled": True},
            "disabled": {"command": ["node", "x.js"], "enabled": False},
        }
    }
    sync.gen_mcp(config, tmp_path)
    payload = json.loads((tmp_path / ".mcp.json").read_text(encoding="utf-8"))
    assert payload["mcpServers"]["enabled"] == {
        "command": "uv",
        "args": ["run", "python", "-m", "x"],
    }
    assert "disabled" not in payload["mcpServers"]

    sync.gen_settings(tmp_path)
    settings = json.loads((tmp_path / ".claude" / "settings.json").read_text(encoding="utf-8"))
    assert settings["permissions"]["defaultMode"] == "acceptEdits"
    assert settings["hooks"]["PreToolUse"]


def test_gen_agents(tmp_path: Path) -> None:
    prompt = tmp_path / ".opencode" / "agents" / "test.md"
    prompt.parent.mkdir(parents=True)
    prompt.write_text("---\nname: teste\n---\n\n# Teste\n", encoding="utf-8")
    config = {
        "agent": {
            "Teste": {
                "description": "Agente de teste",
                "prompt": "{file:./.opencode/agents/test.md}",
                "permission": {"write": "deny", "edit": "deny", "bash": "allow"},
            }
        }
    }
    ok, skipped = sync.gen_agents(config, tmp_path)
    assert (ok, skipped) == (1, 0)
    generated = (tmp_path / ".claude" / "agents" / "teste.md").read_text(encoding="utf-8")
    assert "name: teste" in generated
    assert "model: sonnet" in generated
    assert "AUTO-GERADO por wb sync claude" in generated
