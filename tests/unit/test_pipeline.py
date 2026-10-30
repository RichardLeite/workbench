from __future__ import annotations

from workbench.commands import pipeline


def test_select_agent_falls_back_to_default() -> None:
    assert pipeline.select_agent("unknown", "backend") == "backend-dev"
    assert pipeline.select_agent("workbench", "frontend") == "frontend-dev"
    assert pipeline.select_agent("workbench", "unknown") is None


def test_validate_state_ok() -> None:
    state = {
        "tipo": "pipeline_state",
        "status": "in_progress",
        "slug": "spec",
        "descricao": "desc",
        "projeto": "workbench",
        "fase_atual": "1.1",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
    }
    assert pipeline.validate_state(state)["ok"] is True


def test_validate_state_completed_with_pending() -> None:
    state = {
        "tipo": "pipeline_state",
        "status": "completed",
        "slug": "spec",
        "descricao": "desc",
        "projeto": "workbench",
        "fase_atual": "4.0",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
        "artefatos": {"spec": {"status": "pending"}},
    }
    result = pipeline.validate_state(state)
    assert result["ok"] is False
    assert any("pending" in error for error in result["errors"])


def test_evaluate_gate() -> None:
    assert pipeline.evaluate_gate({"status": "approved"}, {"ok": True})["status"] == "approved"
    assert pipeline.evaluate_gate({"status": "approved"}, {"ok": False})["status"] == "blocked"
    warning = pipeline.evaluate_gate({"status": "failed"}, {"ok": True})
    assert warning["status"] == "approved_with_warning"
