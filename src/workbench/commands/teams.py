"""Utilitários de menções e validação de mensagens do Teams."""

from __future__ import annotations

import json
import re
from argparse import ArgumentParser, Namespace, _SubParsersAction
from typing import Any

from workbench.config import ConfigError, load_config

AT_TAG = re.compile(r"<at(?:\s[^>]*)?>([^<]+)</at>", re.I)
AT_PRESENCE = re.compile(r"<at(?:\s[^>]*)?>", re.I)
AUTOR = re.compile(r"✍️\s*\*{0,2}Autor:\*{0,2}")
REVISOR = re.compile(r"👤\s*\*{0,2}Revisor(?:es)?:\*{0,2}", re.I)
REVISOR_INLINE = re.compile(r"👤\s*\*{0,2}Revisor(?:es)?:\*{0,2}", re.I)
PR_SECTION = re.compile(r"^\S+\s+\*{0,2}PRs?\*{0,2}:")
PR_SECTION_ANY = re.compile(r"^\S+\s+\*{0,2}PRs?\*{0,2}:", re.M)


def register(subparsers: _SubParsersAction) -> None:
    parser: ArgumentParser = subparsers.add_parser(
        "teams", help="Utilitários de mensagens do Teams."
    )
    parser.add_argument("--json", action="store_true", help="Reservado para saída JSON.")
    teams_sub = parser.add_subparsers(dest="teams_command", required=True)

    mentions = teams_sub.add_parser("mentions", help="Extrai menções de uma mensagem.")
    mentions.add_argument("message")
    mentions.set_defaults(handler=_run_mentions)

    shapes = teams_sub.add_parser("shapes", help="Valida shapes de mensagem.")
    shapes_sub = shapes.add_subparsers(dest="shapes_command", required=True)
    validate = shapes_sub.add_parser("validate", help="Valida uma mensagem.")
    validate.add_argument("shape")
    validate.add_argument("--title", default="")
    validate.add_argument("--message", default="")
    validate.add_argument("--mentions", default=None)
    validate.set_defaults(handler=_run_validate_shape)


def extract_mention_names(message: str) -> list[str]:
    return [match.group(1) for match in AT_TAG.finditer(message)]


def load_reviewers(root: Any = None) -> list[dict[str, Any]]:
    try:
        config = load_config("eligible-reviewers.json", root)
    except ConfigError:
        return []
    reviewers = config.get("reviewers")
    return reviewers if isinstance(reviewers, list) else []


def build_mentions_array(
    message: str, reviewers: list[dict[str, Any]] | None = None
) -> list[dict[str, str]]:
    names = extract_mention_names(message)
    reviewer_list = reviewers if reviewers is not None else load_reviewers()
    return [
        {
            "name": name,
            "email": next(
                (str(r.get("email", "")) for r in reviewer_list if r.get("name") == name), ""
            ),
        }
        for name in names
    ]


def normalize_message(message: str) -> str:
    normalized = re.sub(r"<br\s*/?>", "\n", message, flags=re.I)
    return re.sub(r"</?(?:strong|b)>", "", normalized, flags=re.I)


def extract_revisor_names(message: str) -> list[str]:
    lines = normalize_message(message).split("\n")
    index = next((i for i, line in enumerate(lines) if REVISOR.search(line)), -1)
    if index == -1:
        return []
    line = lines[index]
    after_label = REVISOR_INLINE.sub("", line).strip()
    if not after_label and index + 1 < len(lines):
        next_line = lines[index + 1].strip()
        if next_line and not next_line.startswith("→") and "github.com" not in next_line:
            after_label = next_line
    if not after_label:
        return []
    names = re.split(r"\s*\+\s*|\s+e\s+|\s*,\s*", after_label)
    cleaned = []
    for name in names:
        value = re.sub(r"\*{2}", "", name)
        value = re.sub(r"</?at(?:\s[^>]*)?>", "", value, flags=re.I).strip()
        if value:
            cleaned.append(value)
    return cleaned


def _pr_notification(
    title: str, message: str, mentions: list[dict[str, Any]], eligible: list[dict[str, Any]]
) -> dict[str, list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    normalized = normalize_message(message)

    if not any(PR_SECTION.search(line.strip()) for line in normalized.split("\n")):
        errors.append("message deve conter seção 'PR:' ou 'PRs:' (ex: 📂 PRs:)")
    if not AUTOR.search(normalized):
        errors.append("message deve conter '✍️ Autor:'")
    if not REVISOR.search(normalized):
        errors.append("message deve conter '👤 Revisor:' ou '👤 Revisores:'")

    has_arrow = bool(re.search(r"→\s*#\d+", normalized))
    has_github_pr = bool(re.search(r"github\.com/.*/pull/\d+", message))
    if not has_arrow and not has_github_pr:
        errors.append("message deve conter link de PR (→ #N ou github.com/.../pull/N)")

    has_at = bool(AT_PRESENCE.search(message))
    has_mentions = bool(mentions)
    if has_mentions and not has_at:
        errors.append("'mentions' fornecido mas message não contém '<at id=\"N\">Nome</at>'")
    if not has_mentions and has_at:
        errors.append("message contém '<at id=\"N\">' mas 'mentions' não foi fornecido")

    autor_index = AUTOR.search(normalized)
    revisor_index = REVISOR.search(normalized)
    if autor_index and revisor_index and autor_index.start() > revisor_index.start():
        errors.append("'✍️ Autor:' deve vir antes de '👤 Revisor:'")

    names = extract_revisor_names(message)
    if not names:
        errors.append("'👤 Revisor:' deve conter pelo menos um nome")
    elif len(names) > 2:
        errors.append(f"Máximo de 2 revisores. Encontrados: {len(names)}")
    elif eligible:
        valid_names = [str(r.get("name", "")).lower() for r in eligible]
        for name in names:
            lower = name.lower()
            if not any(lower in valid or valid in lower for valid in valid_names):
                available = ", ".join(str(r.get("name", "")) for r in eligible)
                errors.append(
                    f"'{name}' não está na lista de revisores elegíveis. Válidos: {available}"
                )

    if autor_index and revisor_index:
        pr_match = PR_SECTION_ANY.search(normalized)
        if pr_match and pr_match.start() > autor_index.start():
            warnings.append("Seção 'PR:'/'PRs:' deveria vir antes de '✍️ Autor:'")

    if not re.match(r"^[🔥🚀]", title):
        warnings.append("title deveria começar com 🔥 (hotfix) ou 🚀 (sprint)")
    if not re.search(r"TASK-\d+", title, re.I):
        warnings.append("title deveria conter 'TASK-N' (ex: TASK-1234)")

    return {"errors": errors, "warnings": warnings}


def _prs_pendentes(message: str, mentions: list[dict[str, Any]]) -> dict[str, list[str]]:
    errors: list[str] = []
    warnings: list[str] = []
    normalized = normalize_message(message)
    first_line = normalized.split("\n")[0].strip()
    if "PRs Pendentes" not in first_line:
        errors.append("Primeira linha deve conter '📋 PRs Pendentes — {N}'")
    if not re.search(r"━.+?━", normalized):
        errors.append("message deve conter seções (HOTFIX/SPRINT/AVULSOS)")
    if not AUTOR.search(normalized):
        errors.append("cada TASK deve ter '✍️ Autor:'")
    if not REVISOR.search(normalized):
        errors.append("cada TASK deve ter '👤 Revisor:'")
    if not re.search(r"github\.com/.*/pull/\d+", message):
        errors.append("message deve conter links de PR (github.com/.../pull/N)")
    if AT_PRESENCE.search(message) and not mentions:
        errors.append("message contém <at> mas mentions não foi fornecido")
    return {"errors": errors, "warnings": warnings}


SHAPES = {
    "pr-notification": "Template padronizado de notificação de PR (guard-rail)",
    "prs-pendentes": "Listagem geral de PRs pendentes",
    "pr-analyze": "Análise individual de PR — sem validação estrutural",
}


def validate_shape(
    shape_name: str | None,
    title: str,
    message: str,
    mentions: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    mentions = mentions or []
    if not shape_name:
        return {
            "valid": False,
            "errors": [
                "Parâmetro 'shape' obrigatório. Valores: " + ", ".join(SHAPES) + " ou 'none'"
            ],
            "warnings": [],
        }
    if shape_name == "none":
        return {"valid": True, "errors": [], "warnings": []}
    if shape_name not in SHAPES:
        return {
            "valid": False,
            "errors": [
                f"Shape '{shape_name}' desconhecido. Valores: {', '.join(SHAPES)} ou 'none'"
            ],
            "warnings": [],
        }

    if shape_name == "pr-analyze":
        result: dict[str, Any] = {"errors": [], "warnings": []}
    elif shape_name == "pr-notification":
        result = _pr_notification(title, message, mentions, load_reviewers())
    else:
        result = _prs_pendentes(message, mentions)
    result["valid"] = not result["errors"]
    return result


def _print_json(payload: Any) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2))


def _run_mentions(args: Namespace) -> int:
    names = extract_mention_names(args.message)
    _print_json({"names": names, "mentions": build_mentions_array(args.message, load_reviewers())})
    return 0


def _run_validate_shape(args: Namespace) -> int:
    mentions: list[dict[str, Any]] = []
    if args.mentions:
        try:
            parsed = json.loads(args.mentions)
            if isinstance(parsed, list):
                mentions = parsed
        except json.JSONDecodeError:
            pass
    result = validate_shape(args.shape, args.title, args.message, mentions)
    _print_json(result)
    return 0 if result["valid"] else 1
