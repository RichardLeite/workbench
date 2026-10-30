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


def test_state_roundtrip(tmp_path) -> None:
    state = pipeline.create_state("spec", "Descrição", "TASK-1")
    path = pipeline.save_state(state, tmp_path)
    assert path.is_file()
    loaded = pipeline.load_state("spec", tmp_path)
    assert loaded is not None
    assert loaded["slug"] == "spec"
    assert pipeline.resume_prompt("spec", tmp_path)["exists"] is True
    assert pipeline.resume_prompt("missing", tmp_path)["exists"] is False


def test_reports_and_feature_content() -> None:
    state = pipeline.create_state("spec", "Descrição")
    success = pipeline.generate_success_report(state, {"concluidos": 2, "totalModulos": 2})
    assert "Relatório Final" in success
    partial = pipeline.generate_partial_report(state, "motivo", "2")
    assert "Relatório Parcial" in partial
    feature = pipeline.generate_feature_content(
        {
            "titulo": "Feature",
            "descricao": "Desc",
            "criterios_aceite": ["um"],
            "stakeholders": ["time"],
            "riscos": ["risco"],
        }
    )
    assert "# Feature: Feature" in feature
    assert "- [ ] **um**" in feature
