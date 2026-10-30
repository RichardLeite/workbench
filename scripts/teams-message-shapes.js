#!/usr/bin/env node
// scripts/teams-message-shapes.js
// Standalone shape validation for Teams messages (Graph API).
// Valida a estrutura da mensagem ANTES de enviar via teams-graph_send_channel_message.
//
// Uso (CLI):
//   node scripts/teams-message-shapes.js validate <shape> --title "..." --message "..." --mentions '[{"name":"...","email":"..."}]'
//
// Uso (lib):
//   const { validateShape } = require("./teams-message-shapes");
//   const result = validateShape("pr-notification", title, message, mentions);
//
// Shapes disponíveis:
//   pr-notification  → notificação individual de PR (guard-rail)
//   prs-pendentes    → listagem geral de PRs (validação leve)
//   pr-analyze       → análise de PR (livre, sem validação)
//   none             → bypass explícito

const path = require("path");
const fs = require("fs");

// ── REVISORES ELEGÍVEIS ──────────────────────────────────

let eligibleReviewers = [];
try {
  const configPath = path.join(__dirname, "..", ".opencode", "config", "eligible-reviewers.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  eligibleReviewers = config.reviewers || [];
} catch (e) {
  // Silêncio — arquivo pode não existir
}

const nomesValidos = eligibleReviewers.map((r) => r.name.toLowerCase());

// ── HELPERS ──────────────────────────────────────────────

function normalizeMessage(message) {
  return message
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(?:strong|b)>/gi, "");
}

function extractRevisorNames(message) {
  const lines = normalizeMessage(message).split("\n");
  const revisorLineIdx = lines.findIndex((l) =>
    /👤\s*\*{0,2}Revisor(?:es)?:\*{0,2}/i.test(l)
  );
  if (revisorLineIdx === -1) return [];

  const revisorLine = lines[revisorLineIdx];
  let afterLabel = revisorLine
    .replace(/👤\s*\*{0,2}Revisor(?:es)?:\*{0,2}/i, "")
    .trim();

  if (!afterLabel && revisorLineIdx + 1 < lines.length) {
    const nextLine = lines[revisorLineIdx + 1].trim();
    if (nextLine && !nextLine.startsWith("→") && !/github\.com/.test(nextLine)) {
      afterLabel = nextLine;
    }
  }

  if (!afterLabel) return [];
  return afterLabel
    .split(/\s*\+\s*|\s+e\s+|\s*,\s*/)
    .map((n) => n.replace(/\*{2}/g, "").replace(/<\/?at(?:\s[^>]*)?>/gi, "").trim())
    .filter((n) => n.length > 0);
}

// ── SHAPES ────────────────────────────────────────────────

const SHAPES = {
  /**
   * pr-notification — Template padronizado de notificação de PR
   *
   * Regras de bloqueio (🔴):
   *   • Deve conter seção PR: ou PRs:
   *   • Deve conter ✍️ Autor:
   *   • Deve conter 👤 Revisor: (com nome, não vazio)
   *   • Deve conter link de PR (→ #N ou github.com/.../pull/N)
    *   • @mention consistente (<at id="N"> no message ↔ mentions array)
   *   • Autor deve vir antes de Revisor
   *   • Revisor deve estar na lista de elegíveis
   *
   * Regras de warning (🟡 — não bloqueiam):
   *   • Seção PR deveria vir antes de Autor
   *   • Title deveria começar com emoji 🔥/🚀
   *   • Title deveria conter TASK-N
   */
  "pr-notification": {
    description: "Template padronizado de notificação de PR (guard-rail)",
    validate(title, message, mentions) {
      const errors = [];
      const warnings = [];

      // ── 🔴 PRESENÇA ──────────────────────────────────

      const normalizedMessage = normalizeMessage(message);
      const hasPRSection = normalizedMessage
        .split("\n")
        .some((line) => /^\S+\s+\*{0,2}PRs?\*{0,2}:/.test(line.trim()));
      if (!hasPRSection) {
        errors.push("message deve conter seção 'PR:' ou 'PRs:' (ex: 📂 PRs:)");
      }

      if (!/✍️\s*\*{0,2}Autor:\*{0,2}/.test(normalizedMessage)) {
        errors.push("message deve conter '✍️ Autor:'");
      }

      if (!/👤\s*\*{0,2}Revisor(?:es)?:\*{0,2}/.test(normalizedMessage)) {
        errors.push("message deve conter '👤 Revisor:' ou '👤 Revisores:'");
      }

      const hasArrowLink = /→\s*#\d+/.test(normalizedMessage);
      const hasGitHubPR = /github\.com\/.*\/pull\/\d+/.test(message);
      if (!hasArrowLink && !hasGitHubPR) {
        errors.push("message deve conter link de PR (→ #N ou github.com/.../pull/N)");
      }

      // ── 🔴 @MENTION CONSISTÊNCIA ─────────────────────

      const hasAtMention = /<at(?:\s[^>]*)?>/i.test(message);
      const hasMentions = mentions && mentions.length > 0;

      if (hasMentions && !hasAtMention) {
        errors.push("'mentions' fornecido mas message não contém '<at id=\"N\">Nome</at>'");
      }
      if (!hasMentions && hasAtMention) {
        errors.push("message contém '<at id=\"N\">' mas 'mentions' não foi fornecido");
      }

      // ── 🔴 ORDEM ──────────────────────────────────────

      const idxAutor = normalizedMessage.search(/✍️\s*\*{0,2}Autor:\*{0,2}/);
      const idxRevisor = normalizedMessage.search(/👤\s*\*{0,2}Revisor(?:es)?:\*{0,2}/);
      if (idxAutor !== -1 && idxRevisor !== -1 && idxAutor > idxRevisor) {
        errors.push("'✍️ Autor:' deve vir antes de '👤 Revisor:'");
      }

      // ── 🔴 REVISOR VÁLIDO ────────────────────────────

      const revisorNames = extractRevisorNames(message);
      if (revisorNames.length === 0) {
        errors.push("'👤 Revisor:' deve conter pelo menos um nome");
      } else if (revisorNames.length > 2) {
        errors.push(`Máximo de 2 revisores. Encontrados: ${revisorNames.length}`);
      } else if (nomesValidos.length > 0) {
        for (const nome of revisorNames) {
          if (!nomesValidos.some((n) => nome.toLowerCase().includes(n) || n.includes(nome.toLowerCase()))) {
            errors.push(`'${nome}' não está na lista de revisores elegíveis. Válidos: ${eligibleReviewers.map(r => r.name).join(", ")}`);
          }
        }
      }

      // ── 🟡 WARNINGS ──────────────────────────────────

      if (idxAutor !== -1 && idxRevisor !== -1) {
        const prMatch = normalizedMessage.match(/^\S+\s+\*{0,2}PRs?\*{0,2}:/m);
        const idxPRs = prMatch ? prMatch.index : -1;
        if (idxPRs !== -1 && idxPRs > idxAutor) {
          warnings.push("Seção 'PR:'/'PRs:' deveria vir antes de '✍️ Autor:'");
        }
      }

      if (!/^[🔥🚀]/u.test(title)) {
        warnings.push("title deveria começar com 🔥 (hotfix) ou 🚀 (sprint)");
      }

      if (!/TASK-\d+/i.test(title)) {
        warnings.push("title deveria conter 'TASK-N' (ex: TASK-1234)");
      }

      return { errors, warnings };
    },
  },

  /**
   * prs-pendentes — Listagem geral de PRs pendentes
   * Validação simplificada: header, seções, autor/revisor, links.
   */
  "prs-pendentes": {
    description: "Listagem geral de PRs pendentes",
    validate(title, message, mentions) {
      const errors = [];
      const warnings = [];

      const normalizedMessage = normalizeMessage(message);
      const firstLine = normalizedMessage.split("\n")[0].trim();
      if (!/PRs Pendentes/.test(firstLine)) {
        errors.push("Primeira linha deve conter '📋 PRs Pendentes — {N}'");
      }

      const hasSection = /\u2501\u2501\u2501.+?\u2501\u2501\u2501/.test(normalizedMessage);
      if (!hasSection) {
        errors.push("message deve conter seções (HOTFIX/SPRINT/AVULSOS)");
      }

      if (!/✍️\s*\*{0,2}Autor:\*{0,2}/.test(normalizedMessage)) {
        errors.push("cada TASK deve ter '✍️ Autor:'");
      }

      if (!/👤\s*\*{0,2}Revisor(?:es)?:\*{0,2}/.test(normalizedMessage)) {
        errors.push("cada TASK deve ter '👤 Revisor:'");
      }

      const hasPRLink = /github\.com\/.*\/pull\/\d+/.test(message);
      if (!hasPRLink) {
        errors.push("message deve conter links de PR (github.com/.../pull/N)");
      }

      const hasAtMention = /<at(?:\s[^>]*)?>/i.test(message);
      const hasMentions = mentions && mentions.length > 0;
      if (hasAtMention && !hasMentions) {
        errors.push("message contém <at> mas mentions não foi fornecido");
      }

      return { errors, warnings };
    },
  },

  /**
   * pr-analyze — Análise individual de PR. Estrutura livre.
   */
  "pr-analyze": {
    description: "Análise individual de PR — sem validação estrutural",
    validate() {
      return { errors: [], warnings: [] };
    },
  },
};

// ── VALIDADOR PRINCIPAL ─────────────────────────────────

function validateShape(shapeName, title, message, mentions) {
  if (!shapeName) {
    return {
      valid: false,
      errors: ["Parâmetro 'shape' obrigatório. Valores: " + Object.keys(SHAPES).join(", ") + " ou 'none'"],
      warnings: [],
    };
  }

  if (shapeName === "none") {
    return { valid: true, errors: [], warnings: [] };
  }

  const shape = SHAPES[shapeName];
  if (!shape) {
    return {
      valid: false,
      errors: [`Shape '${shapeName}' desconhecido. Valores: ${Object.keys(SHAPES).join(", ")} ou 'none'`],
      warnings: [],
    };
  }

  const result = shape.validate(title, message, mentions);
  result.valid = result.errors.length === 0;
  return result;
}

// ── CLI ─────────────────────────────────────────────────

if (require.main === module) {
  const [cmd, shapeName] = process.argv.slice(2);
  if (cmd !== "validate" || !shapeName) {
    console.error("Uso: node scripts/teams-message-shapes.js validate <shape> --title ... --message ... [--mentions ...]");
    console.error("Shapes: " + Object.keys(SHAPES).join(", "));
    process.exit(1);
  }

  const args = {};
  for (let i = 4; i < process.argv.length; i += 2) {
    const key = process.argv[i].replace(/^--/, "");
    args[key] = process.argv[i + 1];
  }

  let mentions = [];
  if (args.mentions) {
    try {
      mentions = JSON.parse(args.mentions);
    } catch { /* ignore */ }
  }

  const result = validateShape(shapeName, args.title || "", args.message || "", mentions);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.valid ? 0 : 1);
}

module.exports = { SHAPES, validateShape };
