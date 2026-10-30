from __future__ import annotations

import json
from pathlib import Path

from workbench.commands import docs


def test_scan_readme(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)
    (tmp_path / "package.json").write_text(
        json.dumps(
            {
                "name": "sample",
                "description": "Sample project",
                "scripts": {"test": "pytest"},
                "dependencies": {"requests": "*"},
            }
        ),
        encoding="utf-8",
    )
    (tmp_path / "src").mkdir()
    result = docs.scan_readme()
    assert result["tipo"] == "readme"
    assert "# sample" in result["conteudo"]
    assert "| `test` | `pytest` |" in result["conteudo"]
    assert "- requests" in result["conteudo"]
    assert "- src" in result["conteudo"]


def test_scan_api_finds_routes(monkeypatch, tmp_path: Path) -> None:
    monkeypatch.chdir(tmp_path)
    routes = tmp_path / "src" / "routes"
    routes.mkdir(parents=True)
    (routes / "customers.js").write_text(
        "router.get('/customers', handler);\nrouter.post('/customers', handler);\n",
        encoding="utf-8",
    )
    result = docs.scan_api(None, None, tmp_path)
    assert result["tipo"] == "api"
    assert "| GET | `/customers` |" in result["conteudo"]
    assert "## Customers" in result["conteudo"]
