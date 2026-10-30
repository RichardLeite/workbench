from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_all_json_files_are_valid() -> None:
    for path in ROOT.rglob("*.json"):
        if any(part in {".git", ".venv", "node_modules"} for part in path.parts):
            continue
        json.loads(path.read_text(encoding="utf-8"))


def test_opencode_config_and_agent_prompts() -> None:
    config = json.loads((ROOT / "opencode.json").read_text(encoding="utf-8"))
    assert {"agent", "mcp", "instructions", "reference"} <= set(config)
    for key, agent in config["agent"].items():
        prompt = agent.get("prompt", "")
        assert "{file:" in prompt, f"agent {key} sem prompt de arquivo"
        relative = prompt.split("{file:", 1)[1].split("}", 1)[0]
        assert (ROOT / relative).is_file(), f"prompt de {key} não existe: {relative}"


def test_agent_catalog_files_exist() -> None:
    data = json.loads((ROOT / ".opencode/config/agent-catalog.json").read_text(encoding="utf-8"))
    agents = []
    for category in data["categories"].values():
        agents.extend(category["agents"])
    assert len(agents) == data["total_agents"]
    for agent in agents:
        assert (ROOT / agent["file"]).is_file(), agent["file"]


def test_project_mapping_has_workbench() -> None:
    data = json.loads((ROOT / ".opencode/config/project-mapping.json").read_text(encoding="utf-8"))
    assert "workbench" in data["projects"]
