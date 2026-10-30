/**
 * contracts.ts — Subagent output validation schemas.
 *
 * Each subagent produces JSON inside a code block.
 * The orchestrator extracts and validates against the matching schema.
 *
 * Each schema supports four validation layers:
 *   1. required  — fields that must be present and non-empty
 *   2. enums     — field must be one of N values (supports dot-path for nested arrays)
 *   3. types     — field must be of a specific JS type (string, number, array, object, boolean)
 *   4. minLength — for array fields, minimum number of elements
 *
 * Usage: pipe JSON via stdin → node dist/index.js validate
 */

// ─── Output Types ─────────────────────────────────────────────────

/** @explorador — read-only search */
export type ExploradorOutput = {
  tipo: "resultado";
  arquivos?: string[];
  resposta?: string;
  erro?: string;
};

/** @revisor — code review / architecture */
export type RevisorOutput = {
  tipo: "revisao";
  analise?: string;
  recomendacao?: string;
  alternativas?: string;
  nivel_confianca?: string;
  erro?: string;
};

/** @pedreiro / @osd-backend / @osd-frontend — implementation */
export type ImplementacaoOutput = {
  tipo: "resumo";
  alteracoes?: string[];
  verificacao?: string;
  erro?: string;
};

/** @osd-banco — database / DBA */
export type BancoOutput = {
  tipo: "banco";
  acao: "migration" | "query" | "seed" | "model" | "revisao" | "analise";
  migration?: {
    arquivo: string;
    tipo: "up" | "down" | "both";
    rollback: string;
  };
  seed?: {
    arquivo: string;
    tabela: string;
  };
  queries_executadas?: string[];
  impacto_linhas?: number;
  model?: {
    arquivo: string;
    tabela: string;
    campos: string[];
  };
  analise?: string;
  recomendacoes?: string[];
  verificacao?: string;
  erros?: string[];
};

/** @tech-lead — implementation plan review */
export type RevisaoPlanoOutput = {
  tipo: "revisao_plano";
  status: "approved" | "needs_changes" | "blocked";
  // KEEP IN SYNC with schemas.revisao_plano
  problemas?: { item: string; severidade: "P0" | "P1" | "P2"; detalhe?: string; sugestao?: string }[];
  nivel_confianca?: "alta" | "media" | "baixa";
  erro?: string;
};

/** @qa-engineer — test plan / QA */
export type PlanoDeTesteOutput = {
  tipo: "plano_de_teste";
  estrategia?: string;
  cobertura_estimada?: string;
  funcionalidades?: string[];
  casos?: string[];
  // KEEP IN SYNC with schemas.plano_de_teste
  riscos?: { item: string; severidade: "P0" | "P1" | "P2" }[];
  erro?: string;
};

/** @tech-architect — technical design spec */
export type SpecDesignOutput = {
  tipo: "spec_design";
  path: string;
  modulos: string[];
  nivel_confianca?: "alta" | "media" | "baixa";
  observacoes?: string;
  erro?: string;
};

/** @business-analyst — business spec */
// KEEP IN SYNC with schemas.spec_negocio
export type SpecNegocioOutput = {
  tipo: "spec_negocio";
  titulo: string;
  historia?: string;
  regras?: { descricao: string; prioridade: "alta" | "media" | "baixa" }[];
  criterios_aceite?: string[];
  perguntas?: string[];
  decisoes?: string[];
  erro?: string;
};

/** @vault-updater — vault documentation */
export type VaultUpdateOutput = {
  tipo: "vault_update";
  status: "updated" | "unchanged" | "skipped";
  alteracoes?: string[];
  classificacao: "STRUCTURAL_ADD" | "RULE_CHANGE" | "NEW_FLOW" | "FLOW_CHANGE" | "NEW_DOMAIN" | "FIX_ONLY" | "NO_CHANGE";
  erro?: string;
};

/** @execute-spec-runner — spec execution */
export type ExecucaoSpecOutput = {
  tipo: "execucao_spec";
  status: "success" | "partial" | "interrupted";
  modulos_concluidos: number;
  modulos_total: number;
  testes_passando?: number;
  checkpoint?: string;
  erros?: string[];
};

/** @tech-lead / @tech-architect — secondary outputs */
export type GuiaTecnicoOutput = {
  tipo: "guia_tecnico";
  recomendacao?: string;
  exemplo?: string;
  referencia?: string;
  erro?: string;
};

export type ReviewArquiteturaOutput = {
  tipo: "review_arquitetura";
  contexto?: string;
  decisoes?: string[];
  recomendacao?: string;
  impacto?: string;
  riscos?: string[];
  alternativas?: string[];
  nivel_confianca?: "alta" | "media" | "baixa";
  observacoes?: string;
  erro?: string;
};

/** @code-reviewer — line-by-line code review */
export type CodeReviewOutput = {
  tipo: "code_review";
  arquivo: string;
  severidade: "P0" | "P1" | "P2" | "P3";
  categoria: "bug" | "security" | "performance" | "code_smell" | "style";
  descricao: string;
  sugestao?: string;
  nivel_confianca?: "alta" | "media" | "baixa";
  erro?: string;
};

/** @security-reviewer — OWASP security review */
export type SecurityReviewOutput = {
  tipo: "security_review";
  arquivo: string;
  severidade: "P0" | "P1" | "P2" | "P3";
  categoria: "injection" | "auth" | "exposure" | "misconfiguration" | "dependency";
  owasp?: string;
  descricao: string;
  impacto?: string;
  remediacao?: string;
  nivel_confianca?: "alta" | "media" | "baixa";
  erro?: string;
};

/** @planner — implementation plan */
export type ImplementationPlanOutput = {
  tipo: "implementation_plan";
  feature: string;
  overview?: string;
  requirements?: string[];
  architecture_changes?: { file: string; descricao: string }[];
  phases: {
    nome: string;
    steps: { step: string; file: string; acao: string; descricao: string; risco?: string; testes?: string }[];
  }[];
  riscos?: { tipo: string; descricao: string; mitigacao?: string }[];
  erro?: string;
};

/** @architect — architecture review */
export type ArchitectureReviewOutput = {
  tipo: "architecture_review";
  contexto: string;
  current_state?: { padroes?: string[]; divida_tecnica?: string[]; limitacoes?: string[] };
  design_proposal?: { componentes?: string[]; data_models?: string[]; api_contracts?: string[] };
  trade_offs?: { decisao: string; pros: string[]; cons: string[]; alternativas?: string[]; risco_aceito?: string }[];
  adrs_necessarios?: string[];
  proximos_passos?: string[];
  erro?: string;
};

/** @tdd-guide — test-first development guide */
export type TddGuideOutput = {
  tipo: "tdd_guide";
  modo: "red" | "green" | "refactor";
  testes_sugeridos?: { descricao: string; tipo: "unit" | "integration"; arquivo?: string }[];
  implementacao_minima?: string;
  refatoracao_sugerida?: string;
  cobertura_estimada?: string;
  nivel_confianca?: "alta" | "media" | "baixa";
  erro?: string;
};

/** Union of all possible outputs — KEEP IN SYNC with schemas object below */
export type AgentOutput =
  | ExploradorOutput
  | RevisorOutput
  | ImplementacaoOutput
  | BancoOutput
  | RevisaoPlanoOutput
  | PlanoDeTesteOutput
  | SpecDesignOutput
  | SpecNegocioOutput
  | VaultUpdateOutput
  | ExecucaoSpecOutput
  | GuiaTecnicoOutput
  | ReviewArquiteturaOutput
  | CodeReviewOutput
  | SecurityReviewOutput
  | ImplementationPlanOutput
  | ArchitectureReviewOutput
  | TddGuideOutput;

// ─── Validation Schemas ────────────────────────────────────────────

type EnumMap = Record<string, string[]>;
type TypeMap = Record<string, string>;
type MinLengthMap = Record<string, number>;
type ArrayItemTypeMap = Record<string, string>;

type ContractSchema = {
  tipo: string;
  /** @deprecated documentation-only — use schemas for validation */
  campos?: string[];
  /** @deprecated documentation-only — use schemas for validation */
  permiteErro?: boolean;
  required?: string[];
  enums?: EnumMap;
  types?: TypeMap;
  minLength?: MinLengthMap;
  arrayItemTypes?: ArrayItemTypeMap;
};

const schemas: Record<string, ContractSchema> = {
  resultado: {
    tipo: "resultado",
    campos: ["arquivos", "resposta", "erro"],
    permiteErro: true,
  },
  revisao: {
    tipo: "revisao",
    campos: ["analise", "recomendacao", "alternativas", "nivel_confianca", "erro"],
    permiteErro: true,
    enums: {
      nivel_confianca: ["alta", "media", "baixa"],
    },
  },
  resumo: {
    tipo: "resumo",
    campos: ["alteracoes", "verificacao", "erro"],
    permiteErro: true,
  },
  banco: {
    tipo: "banco",
    campos: [
      "acao", "migration", "seed", "queries_executadas",
      "impacto_linhas", "model", "analise", "recomendacoes",
      "verificacao", "erros", "erro",
    ],
    permiteErro: true,
    required: ["acao"],
    enums: {
      acao: ["migration", "query", "seed", "model", "revisao", "analise"],
    },
  },
  revisao_plano: {
    tipo: "revisao_plano",
    campos: ["status", "problemas", "nivel_confianca", "erro"],
    permiteErro: true,
    required: ["status"],
    enums: {
      status: ["approved", "needs_changes", "blocked"],
      "problemas[].severidade": ["P0", "P1", "P2"],
      nivel_confianca: ["alta", "media", "baixa"],
    },
  },
  plano_de_teste: {
    tipo: "plano_de_teste",
    campos: ["estrategia", "cobertura_estimada", "funcionalidades", "casos", "riscos", "erro"],
    permiteErro: true,
    enums: {
      "riscos[].severidade": ["P0", "P1", "P2"],
    },
  },
  spec_design: {
    tipo: "spec_design",
    campos: ["path", "modulos", "nivel_confianca", "observacoes", "erro"],
    permiteErro: true,
    required: ["path", "modulos"],
    types: {
      path: "string",
      modulos: "array",
    },
    minLength: {
      modulos: 1,
    },
    arrayItemTypes: {
      modulos: "string",
    },
    enums: {
      nivel_confianca: ["alta", "media", "baixa"],
    },
  },
  spec_negocio: {
    tipo: "spec_negocio",
    campos: ["titulo", "historia", "regras", "criterios_aceite", "perguntas", "decisoes", "erro"],
    permiteErro: true,
    required: ["titulo"],
    types: {
      titulo: "string",
    },
    enums: {
      "regras[].prioridade": ["alta", "media", "baixa"],
    },
  },
  vault_update: {
    tipo: "vault_update",
    campos: ["status", "alteracoes", "classificacao", "erro"],
    permiteErro: true,
    required: ["status", "classificacao"],
    types: {
      status: "string",
      classificacao: "string",
    },
    enums: {
      status: ["updated", "unchanged", "skipped"],
      classificacao: ["STRUCTURAL_ADD", "RULE_CHANGE", "NEW_FLOW", "FLOW_CHANGE", "NEW_DOMAIN", "FIX_ONLY", "NO_CHANGE"],
    },
  },
  execucao_spec: {
    tipo: "execucao_spec",
    campos: ["status", "modulos_concluidos", "modulos_total", "testes_passando", "checkpoint", "erros"],
    permiteErro: true,
    required: ["status", "modulos_concluidos", "modulos_total"],
    types: {
      status: "string",
      modulos_concluidos: "number",
      modulos_total: "number",
    },
    enums: {
      status: ["success", "partial", "interrupted"],
    },
  },
  guia_tecnico: {
    tipo: "guia_tecnico",
    campos: ["recomendacao", "exemplo", "referencia", "erro"],
    permiteErro: true,
  },
  review_arquitetura: {
    tipo: "review_arquitetura",
    campos: ["contexto", "decisoes", "recomendacao", "impacto", "riscos", "alternativas", "nivel_confianca", "observacoes", "erro"],
    permiteErro: true,
  },

  // ─── ECC Agent Schemas ──────────────────────────────────────────────

  code_review: {
    tipo: "code_review",
    campos: ["arquivo", "severidade", "categoria", "descricao", "sugestao", "nivel_confianca", "erro"],
    permiteErro: true,
    required: ["arquivo", "severidade", "categoria", "descricao"],
    types: {
      arquivo: "string",
      severidade: "string",
      categoria: "string",
      descricao: "string",
    },
    enums: {
      severidade: ["P0", "P1", "P2", "P3"],
      categoria: ["bug", "security", "performance", "code_smell", "style"],
      nivel_confianca: ["alta", "media", "baixa"],
    },
  },
  security_review: {
    tipo: "security_review",
    campos: ["arquivo", "severidade", "categoria", "owasp", "descricao", "impacto", "remediacao", "nivel_confianca", "erro"],
    permiteErro: true,
    required: ["arquivo", "severidade", "categoria", "descricao"],
    types: {
      arquivo: "string",
      severidade: "string",
      categoria: "string",
      descricao: "string",
    },
    enums: {
      severidade: ["P0", "P1", "P2", "P3"],
      categoria: ["injection", "auth", "exposure", "misconfiguration", "dependency"],
      nivel_confianca: ["alta", "media", "baixa"],
    },
  },
  implementation_plan: {
    tipo: "implementation_plan",
    campos: ["feature", "overview", "requirements", "architecture_changes", "phases", "riscos", "erro"],
    permiteErro: true,
    required: ["feature", "phases"],
    types: {
      feature: "string",
      phases: "array",
    },
    minLength: {
      phases: 1,
    },
  },
  architecture_review: {
    tipo: "architecture_review",
    campos: ["contexto", "current_state", "design_proposal", "trade_offs", "adrs_necessarios", "proximos_passos", "erro"],
    permiteErro: true,
    required: ["contexto"],
    types: {
      contexto: "string",
    },
  },
  tdd_guide: {
    tipo: "tdd_guide",
    campos: ["modo", "testes_sugeridos", "implementacao_minima", "refatoracao_sugerida", "cobertura_estimada", "nivel_confianca", "erro"],
    permiteErro: true,
    required: ["modo"],
    types: {
      modo: "string",
    },
    enums: {
      modo: ["red", "green", "refactor"],
      nivel_confianca: ["alta", "media", "baixa"],
    },
  },
};

// ─── Validation Output ─────────────────────────────────────────────

export type ValidationResult = {
  valid: boolean;
  hasError: boolean;
  tipo: string | null;
  mensagem?: string;
};

// ─── Validation ────────────────────────────────────────────────────

function checkType(value: unknown, expected: string): boolean {
  switch (expected) {
    case "string": return typeof value === "string";
    case "number": return typeof value === "number" && !Number.isNaN(value);
    case "boolean": return typeof value === "boolean";
    case "array": return Array.isArray(value);
    case "object": return typeof value === "object" && value !== null && !Array.isArray(value);
    default: return true;
  }
}

/**
 * Validates a JSON object against known or unknown contract schemas.
 *
 * Rules:
 * - Must have a `tipo` field (any string is accepted — all agent tipos valid)
 * - Unknown tipos are treated as valid (no schema enforcement, just error check)
 * - If `erro` or `erros` has content → `hasError = true`
 * - Known schemas enforce required fields, type constraints, minLength, and enum values
 */
export function validateOutput(input: Record<string, unknown>): ValidationResult {
  if (!input || typeof input !== "object") {
    return { valid: false, hasError: false, tipo: null, mensagem: "Invalid input: not a JSON object" };
  }

  const tipo = input.tipo;

  if (!tipo || typeof tipo !== "string") {
    return { valid: false, hasError: false, tipo: null, mensagem: "Field 'tipo' missing or invalid" };
  }

  const hasError =
    (typeof input.erro === "string" && input.erro.length > 0) ||
    (Array.isArray(input.erros) && (input.erros as unknown[]).length > 0);

  // If has error, skip structural validation (allow partial/malformed output)
  if (hasError) {
    return { valid: true, hasError, tipo };
  }

  const schema = schemas[tipo];

  // Unknown tipo — accept without schema enforcement
  if (!schema) {
    return { valid: true, hasError, tipo };
  }

  // Check required fields
  if (schema.required) {
    for (const field of schema.required) {
      const value = input[field];
      if (value === undefined || value === null || value === "") {
        return {
          valid: false,
          hasError,
          tipo,
          mensagem: `Required field '${field}' missing or empty for tipo '${tipo}'`,
        };
      }
    }
  }

  // Check type constraints
  if (schema.types) {
    for (const [fieldPath, expectedType] of Object.entries(schema.types)) {
      const value = input[fieldPath];
      if (value !== undefined && value !== null) {
        if (!checkType(value, expectedType)) {
          return {
            valid: false,
            hasError,
            tipo,
            mensagem: `Field '${fieldPath}' expected type '${expectedType}', got '${typeof value}' for tipo '${tipo}'`,
          };
        }
      }
    }
  }

  // Check minimum array length
  if (schema.minLength) {
    for (const [fieldPath, minLen] of Object.entries(schema.minLength)) {
      const value = input[fieldPath];
      if (Array.isArray(value) && value.length < minLen) {
        return {
          valid: false,
          hasError,
          tipo,
          mensagem: `Field '${fieldPath}' has ${value.length} elements, minimum is ${minLen} for tipo '${tipo}'`,
        };
      }
    }
  }

  // Check array item types
  if (schema.arrayItemTypes) {
    for (const [fieldPath, expectedItemType] of Object.entries(schema.arrayItemTypes)) {
      const value = input[fieldPath];
      if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          if (!checkType(value[i], expectedItemType)) {
            return {
              valid: false,
              hasError,
              tipo,
              mensagem: `Field '${fieldPath}[${i}]' expected item type '${expectedItemType}', got '${typeof value[i]}' for tipo '${tipo}'`,
            };
          }
        }
      }
    }
  }

  // Check enum values
  if (schema.enums) {
    for (const [fieldPath, validValues] of Object.entries(schema.enums)) {
      // Parse dot-path for nested array enums: "problemas[].severidade"
      const arrayMatch = fieldPath.match(/^(\w+)\[\]\.(\w+)$/);
      if (arrayMatch) {
        const [, arrayField, nestedField] = arrayMatch;
        const arr = input[arrayField];
        if (Array.isArray(arr)) {
          for (let i = 0; i < arr.length; i++) {
            const item = arr[i] as Record<string, unknown>;
            if (item[nestedField] !== undefined && item[nestedField] !== null && item[nestedField] !== "") {
              if (!validValues.includes(item[nestedField] as string)) {
                return {
                  valid: false,
                  hasError,
                  tipo,
                  mensagem: `${arrayField}[${i}].${nestedField} '${item[nestedField]}' not in [${validValues.join(", ")}] for tipo '${tipo}'`,
                };
              }
            }
          }
        }
        continue;
      }

      // Direct field enum check
      const value = input[fieldPath];
      if (value !== undefined && value !== null && value !== "") {
        if (!validValues.includes(value as string)) {
          return {
            valid: false,
            hasError,
            tipo,
            mensagem: `Field '${fieldPath}' value '${value}' not in [${validValues.join(", ")}] for tipo '${tipo}'`,
          };
        }
      }
    }
  }

  return { valid: true, hasError, tipo };
}
