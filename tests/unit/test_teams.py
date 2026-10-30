from __future__ import annotations

from workbench.commands import teams


def test_extract_mention_names() -> None:
    message = 'Oi <at id="0">Pessoa Um</at> e <at>Pessoa Dois</at>'
    assert teams.extract_mention_names(message) == ["Pessoa Um", "Pessoa Dois"]


def test_build_mentions_array() -> None:
    reviewers = [{"name": "Pessoa Um", "email": "um@example.com"}]
    result = teams.build_mentions_array('<at id="0">Pessoa Um</at>', reviewers)
    assert result == [{"name": "Pessoa Um", "email": "um@example.com"}]


def test_validate_pr_notification_valid() -> None:
    message = "\n".join(
        [
            "🔥 HOTFIX TASK-21398 — Report layout",
            "📂 PRs:",
            "APP → #5169 → main: https://github.com/example/app/pull/5169",
            "✍️ Autor: Pessoa Exemplo",
            '👤 Revisor: <at id="0">Outra Pessoa</at>',
        ]
    )
    result = teams.validate_shape(
        "pr-notification",
        "🔥 HOTFIX TASK-21398 — Report layout",
        message,
        [{"name": "Outra Pessoa", "email": "pessoa@example.com"}],
    )
    assert result["valid"] is True
    assert result["errors"] == []


def test_validate_pr_notification_missing_revisor() -> None:
    result = teams.validate_shape(
        "pr-notification",
        "TASK-1",
        "📂 PRs:\nhttps://github.com/example/app/pull/1",
        [],
    )
    assert result["valid"] is False
    assert any("Revisor" in error for error in result["errors"])


def test_validate_unknown_shape() -> None:
    result = teams.validate_shape("unknown", "", "", [])
    assert result["valid"] is False
    assert "desconhecido" in result["errors"][0]


def test_validate_none_shape() -> None:
    assert teams.validate_shape("none", "", "", [])["valid"] is True
