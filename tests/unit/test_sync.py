from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

import pytest

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
    assert settings["hooks"]["SessionStart"]


def test_gen_claude_skills_plugin(tmp_path: Path) -> None:
    skill = tmp_path / ".opencode" / "skills" / "foo"
    skill.mkdir(parents=True)
    (skill / "SKILL.md").write_text("---\nname: foo\ndescription: Foo\n---\n", encoding="utf-8")

    sync.gen_claude_skills_plugin(tmp_path)

    manifest = json.loads(
        (
            tmp_path / ".claude" / "skills" / "workbench" / ".claude-plugin" / "plugin.json"
        ).read_text(encoding="utf-8")
    )
    assert manifest["name"] == "workbench"
    assert manifest["skills"] == ["../../../.opencode/skills"]
    assert not (tmp_path / ".claude" / "skills" / "foo").exists()


@pytest.mark.skipif(sys.platform != "win32", reason="junction behavior is Windows-specific")
def test_gen_claude_skills_plugin_replaces_junction(tmp_path: Path) -> None:
    source = tmp_path / ".opencode" / "skills"
    skill = source / "foo"
    skill.mkdir(parents=True)
    (skill / "SKILL.md").write_text("---\nname: foo\ndescription: Foo\n---\n", encoding="utf-8")
    (tmp_path / ".claude").mkdir()
    link = tmp_path / ".claude" / "skills"
    subprocess.run(
        ["cmd", "/c", "mklink", "/J", str(link), str(source)],
        check=True,
        capture_output=True,
    )

    sync.gen_claude_skills_plugin(tmp_path)

    assert not sync._is_link(link)
    assert (source / "foo" / "SKILL.md").is_file()
    manifest = json.loads(
        (link / "workbench" / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8")
    )
    assert manifest["skills"] == ["../../../.opencode/skills"]


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
