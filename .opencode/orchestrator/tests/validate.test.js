#!/usr/bin/env node
/**
 * validate.test.js — Contract & Pipeline validation tests
 *
 * Tests for validateOutput() and CLI integration.
 * Uses Node.js built-in test runner (node:test) — zero dependencies.
 *
 * Run: node --test .opencode/orchestrator/tests/validate.test.js
 * Or:  cd .opencode/orchestrator && npx tsc && node --test tests/validate.test.js
 */

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const { validateOutput } = require("../dist/contracts");
const { execSync, spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");

const ORCHESTRATOR_DIR = path.resolve(__dirname, "..");
const CLI = `node ${path.join(ORCHESTRATOR_DIR, "dist/index.js")}`;
const ORQUESTRADOR_MD = path.resolve(__dirname, "..", "..", "..", ".opencode", "agents", "core", "orquestrador.md");

// ═══════════════════════════════════════════════════════════════
// validateOutput() — Pure function tests
// ═══════════════════════════════════════════════════════════════

describe("validateOutput — input validation", () => {
  it("should reject null input", () => {
    const r = validateOutput(null);
    assert.equal(r.valid, false);
    assert.equal(r.tipo, null);
  });

  it("should reject undefined input", () => {
    const r = validateOutput(undefined);
    assert.equal(r.valid, false);
  });

  it("should reject non-object input (string)", () => {
    const r = validateOutput("not-an-object");
    assert.equal(r.valid, false);
  });

  it("should reject non-object input (number)", () => {
    const r = validateOutput(42);
    assert.equal(r.valid, false);
  });

  it("should reject input without tipo field", () => {
    const r = validateOutput({ arquivos: ["a.ts"] });
    assert.equal(r.valid, false);
    assert.match(r.mensagem, /tipo/);
  });

  it("should reject input with empty string tipo", () => {
    const r = validateOutput({ tipo: "" });
    assert.equal(r.valid, false);
  });
});

describe("validateOutput — error passthrough", () => {
  it("should accept valid output with erro field", () => {
    // Structural validation is skipped when erro is set
    const r = validateOutput({
      tipo: "banco",
      acao: "invalid-action",
      erro: "Deu ruim",
    });
    assert.equal(r.valid, true);
    assert.equal(r.hasError, true);
  });

  it("should detect erro field with content", () => {
    const r = validateOutput({
      tipo: "resultado",
      erro: "Algo deu errado",
    });
    assert.equal(r.valid, true);
    assert.equal(r.hasError, true);
  });

  it("should detect erros array with content", () => {
    const r = validateOutput({
      tipo: "banco",
      acao: "migration",
      erros: ["Erro 1"],
    });
    assert.equal(r.valid, true);
    assert.equal(r.hasError, true);
  });

  it("should skip structural validation when erro is present", () => {
    // Even missing required field should pass when erro exists
    const r = validateOutput({
      tipo: "spec_design",
      erro: "Could not complete analysis",
    });
    assert.equal(r.valid, true);
    assert.equal(r.hasError, true);
  });
});

describe("validateOutput — explorador (resultado)", () => {
  it("should accept valid resultado", () => {
    const r = validateOutput({
      tipo: "resultado",
      arquivos: ["/src/controller.ts:42"],
      resposta: "Encontrei o controlador",
    });
    assert.equal(r.valid, true);
    assert.equal(r.hasError, false);
  });

  it("should accept minimal resultado (no optional fields)", () => {
    const r = validateOutput({ tipo: "resultado" });
    assert.equal(r.valid, true);
  });
});

describe("validateOutput — revisao_plano (tech-lead)", () => {
  it("should accept valid revisao_plano", () => {
    const r = validateOutput({
      tipo: "revisao_plano",
      status: "approved",
      problemas: [
        { item: "Falta validação", severidade: "P0", detalhe: "Campo sem validação", sugestao: "Adicionar validate()" },
      ],
      nivel_confianca: "alta",
    });
    assert.equal(r.valid, true);
  });

  it("should reject invalid severity in problemas", () => {
    const r = validateOutput({
      tipo: "revisao_plano",
      status: "approved",
      problemas: [{ item: "Issue", severidade: "CRITICAL" }],
    });
    assert.equal(r.valid, false);
    assert.match(r.mensagem, /severidade/);
  });

  it("should require status field", () => {
    const r = validateOutput({
      tipo: "revisao_plano",
      problemas: [],
    });
    assert.equal(r.valid, false);
    assert.match(r.mensagem, /Required field 'status'/);
  });

  it("should reject empty status string", () => {
    const r = validateOutput({
      tipo: "revisao_plano",
      status: "",
    });
    assert.equal(r.valid, false);
  });
});

describe("validateOutput — banco (database)", () => {
  it("should accept valid banco with migration", () => {
    const r = validateOutput({
      tipo: "banco",
      acao: "migration",
      migration: { arquivo: "2024-01-01-criar-clientes.js", tipo: "both", rollback: "DROP TABLE" },
      recomendacoes: ["Adicionar índice"],
    });
    assert.equal(r.valid, true);
  });

  it("should accept valid banco with query analysis", () => {
    const r = validateOutput({
      tipo: "banco",
      acao: "analise",
      analise: "Query lenta devido a full scan",
      impacto_linhas: 50000,
      verificacao: "EXPLAIN mostra table scan",
    });
    assert.equal(r.valid, true);
  });

  it("should reject invalid acao", () => {
    const r = validateOutput({ tipo: "banco", acao: "delete" });
    assert.equal(r.valid, false);
    assert.match(r.mensagem, /not in/);
  });
});

describe("validateOutput — spec_design (tech-architect)", () => {
  it("should accept valid spec_design", () => {
    const r = validateOutput({
      tipo: "spec_design",
      path: "projects/meu-projeto/features/invoice-retry",
      modulos: ["API", "Service", "Queue"],
      nivel_confianca: "alta",
    });
    assert.equal(r.valid, true);
  });

  it("should reject path as number (wrong type)", () => {
    const r = validateOutput({
      tipo: "spec_design",
      path: 123,
      modulos: ["Test"],
    });
    assert.equal(r.valid, false);
    assert.match(r.mensagem, /type/);
  });

  it("should reject modulos as non-array", () => {
    const r = validateOutput({
      tipo: "spec_design",
      path: "/x",
      modulos: "not-an-array",
    });
    assert.equal(r.valid, false);
  });

  it("should reject empty modulos array (minLength)", () => {
    const r = validateOutput({
      tipo: "spec_design",
      path: "/x",
      modulos: [],
    });
    assert.equal(r.valid, false);
    assert.match(r.mensagem, /minimum is 1/);
  });

  it("should reject modulos with non-string items", () => {
    const r = validateOutput({
      tipo: "spec_design",
      path: "/x",
      modulos: [42],
    });
    assert.equal(r.valid, false);
    assert.match(r.mensagem, /item type/);
  });
});

describe("validateOutput — execucao_spec (execute-spec-runner)", () => {
  it("should accept valid execucao_spec", () => {
    const r = validateOutput({
      tipo: "execucao_spec",
      status: "success",
      modulos_concluidos: 5,
      modulos_total: 5,
      testes_passando: 42,
    });
    assert.equal(r.valid, true);
  });

  it("should accept partial execution", () => {
    const r = validateOutput({
      tipo: "execucao_spec",
      status: "partial",
      modulos_concluidos: 3,
      modulos_total: 5,
    });
    assert.equal(r.valid, true);
  });

  it("should reject invalid status", () => {
    const r = validateOutput({
      tipo: "execucao_spec",
      status: "failed",
      modulos_concluidos: 0,
      modulos_total: 1,
    });
    assert.equal(r.valid, false);
  });

  it("should reject missing required fields", () => {
    const r = validateOutput({
      tipo: "execucao_spec",
      status: "success",
    });
    assert.equal(r.valid, false);
  });
});

describe("validateOutput — vault_update (vault-updater)", () => {
  it("should accept valid vault_update", () => {
    const r = validateOutput({
      tipo: "vault_update",
      status: "updated",
      alteracoes: ["ADR-002 adicionado"],
      classificacao: "STRUCTURAL_ADD",
    });
    assert.equal(r.valid, true);
  });

  it("should accept unchanged status", () => {
    const r = validateOutput({
      tipo: "vault_update",
      status: "unchanged",
      classificacao: "NO_CHANGE",
    });
    assert.equal(r.valid, true);
  });

  it("should reject invalid classificacao", () => {
    const r = validateOutput({
      tipo: "vault_update",
      status: "updated",
      classificacao: "INVALID_ACTION",
    });
    assert.equal(r.valid, false);
  });
});

describe("validateOutput — spec_negocio (business-analyst)", () => {
  it("should accept valid spec_negocio", () => {
    const r = validateOutput({
      tipo: "spec_negocio",
      titulo: "Implementar cadastro de clientes",
      regras: [
        { descricao: "CPF obrigatório", prioridade: "alta" },
        { descricao: "Email único", prioridade: "media" },
      ],
      criterios_aceite: ["Tela de cadastro salva no banco"],
    });
    assert.equal(r.valid, true);
  });

  it("should reject invalid regra prioridade", () => {
    const r = validateOutput({
      tipo: "spec_negocio",
      titulo: "Test",
      regras: [{ descricao: "Regra", prioridade: "urgent" }],
    });
    assert.equal(r.valid, false);
  });

  it("should reject empty title", () => {
    const r = validateOutput({ tipo: "spec_negocio", titulo: "" });
    assert.equal(r.valid, false);
  });
});

describe("validateOutput — unknown tipo (passthrough)", () => {
  it("should accept unknown tipos without schema enforcement", () => {
    const r = validateOutput({ tipo: "custom_output", data: "anything" });
    assert.equal(r.valid, true);
  });
});

// ═══════════════════════════════════════════════════════════════
// ECC Agent Tests
// ═══════════════════════════════════════════════════════════════

describe("validateOutput — code_review (code-reviewer)", () => {
  it("should accept valid code_review", () => {
    const r = validateOutput({
      tipo: "code_review",
      arquivo: "src/controllers/CustomerController.js:42",
      severidade: "P1",
      categoria: "bug",
      descricao: "Missing validation on email field",
      sugestao: "Add express-validator check",
      nivel_confianca: "alta",
    });
    assert.equal(r.valid, true);
    assert.equal(r.hasError, false);
  });

  it("should accept minimal code_review (optional fields omitted)", () => {
    const r = validateOutput({
      tipo: "code_review",
      arquivo: "src/app.js:10",
      severidade: "P2",
      categoria: "style",
      descricao: "Use const instead of let",
    });
    assert.equal(r.valid, true);
  });

  it("should reject missing required fields", () => {
    const r = validateOutput({
      tipo: "code_review",
      arquivo: "test.js",
      severidade: "P0",
      // only has arquivo, severidade — missing categoria and descricao
    });
    assert.equal(r.valid, false);
    // First missing required field is reported (categoria comes before descricao)
    assert.match(r.mensagem, /Required field 'categoria'/);
  });

  it("should reject invalid severidade", () => {
    const r = validateOutput({
      tipo: "code_review",
      arquivo: "test.js",
      severidade: "CRITICAL",
      categoria: "bug",
      descricao: "Bug",
    });
    assert.equal(r.valid, false);
    assert.match(r.mensagem, /severidade/);
  });

  it("should reject invalid categoria", () => {
    const r = validateOutput({
      tipo: "code_review",
      arquivo: "test.js",
      severidade: "P0",
      categoria: "refactor",
      descricao: "Bug",
    });
    assert.equal(r.valid, false);
    assert.match(r.mensagem, /categoria/);
  });

  it("should reject invalid nivel_confianca", () => {
    const r = validateOutput({
      tipo: "code_review",
      arquivo: "test.js",
      severidade: "P2",
      categoria: "code_smell",
      descricao: "Smell",
      nivel_confianca: "baixissima",
    });
    assert.equal(r.valid, false);
    assert.match(r.mensagem, /nivel_confianca/);
  });

  it("should accept code_review with erro (skip validation)", () => {
    const r = validateOutput({
      tipo: "code_review",
      erro: "Could not analyze file",
    });
    assert.equal(r.valid, true);
    assert.equal(r.hasError, true);
  });
});

describe("validateOutput — security_review (security-reviewer)", () => {
  it("should accept valid security_review", () => {
    const r = validateOutput({
      tipo: "security_review",
      arquivo: "src/middlewares/auth.js:15",
      severidade: "P0",
      categoria: "auth",
      owasp: "A01:2021",
      descricao: "No rate limiting on login endpoint",
      impacto: "Brute force attack vector",
      remediacao: "Add express-rate-limit middleware",
      nivel_confianca: "alta",
    });
    assert.equal(r.valid, true);
  });

  it("should accept minimal security_review", () => {
    const r = validateOutput({
      tipo: "security_review",
      arquivo: "src/routes/api.js:88",
      severidade: "P2",
      categoria: "misconfiguration",
      descricao: "CORS is too permissive",
    });
    assert.equal(r.valid, true);
  });

  it("should reject invalid categoria", () => {
    const r = validateOutput({
      tipo: "security_review",
      arquivo: "test.js",
      severidade: "P1",
      categoria: "sql_injection",
      descricao: "Issue",
    });
    assert.equal(r.valid, false);
    assert.match(r.mensagem, /categoria/);
  });

  it("should reject missing arquivo", () => {
    const r = validateOutput({
      tipo: "security_review",
      severidade: "P0",
      categoria: "injection",
      descricao: "Issue",
    });
    assert.equal(r.valid, false);
    assert.match(r.mensagem, /Required field 'arquivo'/);
  });
});

describe("validateOutput — implementation_plan (planner)", () => {
  it("should accept valid implementation_plan", () => {
    const r = validateOutput({
      tipo: "implementation_plan",
      feature: "Add invoice retry endpoint",
      overview: "New endpoint to retry failed invoice emissions",
      requirements: ["POST /invoices/:id/retry", "Idempotency key required"],
      architecture_changes: [
        { file: "src/controllers/InvoiceController.js", descricao: "Add retry method" },
      ],
      phases: [
        {
          nome: "Phase 1: Backend",
          steps: [
            {
              step: "Create retry endpoint",
              file: "src/controllers/InvoiceController.js",
              acao: "add",
              descricao: "POST /invoices/:id/retry handler",
              risco: "None",
              testes: "Test retry with valid invoice",
            },
          ],
        },
      ],
      riscos: [
        { tipo: "Database", descricao: "Lock contention", mitigacao: "Use optimistic locking" },
      ],
    });
    assert.equal(r.valid, true);
  });

  it("should reject missing feature", () => {
    const r = validateOutput({
      tipo: "implementation_plan",
      phases: [{ nome: "P1", steps: [] }],
    });
    assert.equal(r.valid, false);
    assert.match(r.mensagem, /Required field 'feature'/);
  });

  it("should reject missing phases", () => {
    const r = validateOutput({
      tipo: "implementation_plan",
      feature: "Test feature",
    });
    assert.equal(r.valid, false);
    assert.match(r.mensagem, /Required field 'phases'/);
  });

  it("should reject empty phases array", () => {
    const r = validateOutput({
      tipo: "implementation_plan",
      feature: "Test feature",
      phases: [],
    });
    assert.equal(r.valid, false);
    assert.match(r.mensagem, /minimum is 1/);
  });

  it("should reject phases as non-array", () => {
    const r = validateOutput({
      tipo: "implementation_plan",
      feature: "Test feature",
      phases: "not-an-array",
    });
    assert.equal(r.valid, false);
    assert.match(r.mensagem, /type/);
  });

  it("should accept implementation_plan with erro", () => {
    const r = validateOutput({
      tipo: "implementation_plan",
      erro: "Insufficient context to generate plan",
    });
    assert.equal(r.valid, true);
    assert.equal(r.hasError, true);
  });
});

describe("validateOutput — architecture_review (architect)", () => {
  it("should accept valid architecture_review", () => {
    const r = validateOutput({
      tipo: "architecture_review",
      contexto: "Invoice retry microservice design",
      current_state: {
        padroes: ["Monolith", "REST API"],
        divida_tecnica: ["No error queue"],
        limitacoes: ["Single point of failure"],
      },
      design_proposal: {
        componentes: ["Invoice Service", "Retry Queue", "DLQ"],
        data_models: ["retry_attempts table"],
        api_contracts: ["POST /retry", "GET /retry/:id/status"],
      },
      trade_offs: [
        {
          decisao: "Use SQS instead of DB table",
          pros: ["Faster", "Managed service"],
          cons: ["More AWS costs", "Eventual consistency"],
          alternativas: ["MySQL queue table"],
          risco_aceito: "Data loss if SQS message expires",
        },
      ],
      adrs_necessarios: ["ADR-005: Retry Strategy Pattern"],
      proximos_passos: ["Validate with stakeholders", "Implement POC"],
    });
    assert.equal(r.valid, true);
  });

  it("should accept minimal architecture_review", () => {
    const r = validateOutput({
      tipo: "architecture_review",
      contexto: "Database migration strategy review",
    });
    assert.equal(r.valid, true);
  });

  it("should reject empty contexto string", () => {
    const r = validateOutput({
      tipo: "architecture_review",
      contexto: "",
    });
    assert.equal(r.valid, false);
    assert.match(r.mensagem, /Required field 'contexto'/);
  });

  it("should reject missing contexto", () => {
    const r = validateOutput({
      tipo: "architecture_review",
      trade_offs: [],
    });
    assert.equal(r.valid, false);
    assert.match(r.mensagem, /Required field 'contexto'/);
  });

  it("should accept architecture_review with erro", () => {
    const r = validateOutput({
      tipo: "architecture_review",
      erro: "Context insufficient for architecture review",
    });
    assert.equal(r.valid, true);
    assert.equal(r.hasError, true);
  });
});

describe("validateOutput — tdd_guide (tdd-guide)", () => {
  it("should accept valid tdd_guide in red mode", () => {
    const r = validateOutput({
      tipo: "tdd_guide",
      modo: "red",
      testes_sugeridos: [
        { descricao: "should reject invalid email", tipo: "unit", arquivo: "test/CustomerService.test.js" },
      ],
      implementacao_minima: "Add email regex validation",
      nivel_confianca: "alta",
    });
    assert.equal(r.valid, true);
  });

  it("should accept valid tdd_guide in green mode", () => {
    const r = validateOutput({
      tipo: "tdd_guide",
      modo: "green",
      implementacao_minima: "Add isEmail() check",
    });
    assert.equal(r.valid, true);
  });

  it("should accept valid tdd_guide in refactor mode", () => {
    const r = validateOutput({
      tipo: "tdd_guide",
      modo: "refactor",
      refatoracao_sugerida: "Extract email validation to helper",
      cobertura_estimada: "90%",
    });
    assert.equal(r.valid, true);
  });

  it("should reject invalid modo", () => {
    const r = validateOutput({
      tipo: "tdd_guide",
      modo: "yellow",
    });
    assert.equal(r.valid, false);
    assert.match(r.mensagem, /modo/);
  });

  it("should reject missing modo", () => {
    const r = validateOutput({
      tipo: "tdd_guide",
      testes_sugeridos: [],
    });
    assert.equal(r.valid, false);
    assert.match(r.mensagem, /Required field 'modo'/);
  });

  it("should accept tdd_guide with erro", () => {
    const r = validateOutput({
      tipo: "tdd_guide",
      erro: "Could not generate tests without spec",
    });
    assert.equal(r.valid, true);
    assert.equal(r.hasError, true);
  });
});

describe("validateOutput — edge cases", () => {
  it("should handle input with unexpected extra fields", () => {
    const r = validateOutput({
      tipo: "resultado",
      arquivos: ["a.ts"],
      campo_extra: "should be ignored",
    });
    assert.equal(r.valid, true);
  });

  it("should handle risco item in plano_de_teste nested enums", () => {
    const r = validateOutput({
      tipo: "plano_de_teste",
      riscos: [{ item: "Performance", severidade: "P2" }],
    });
    assert.equal(r.valid, true);
  });

  it("should reject invalid nested risco severity", () => {
    const r = validateOutput({
      tipo: "plano_de_teste",
      riscos: [{ item: "Risco", severidade: "HIGH" }],
    });
    assert.equal(r.valid, false);
  });
});

// ═══════════════════════════════════════════════════════════════
// CLI integration tests
// ═══════════════════════════════════════════════════════════════

function validateInput(input) {
  return spawnSync(
    process.execPath,
    [path.join(ORCHESTRATOR_DIR, "dist/index.js"), "validate"],
    { input, encoding: "utf-8", cwd: ORCHESTRATOR_DIR }
  );
}

describe("CLI — validate", () => {
  it('valid JSON -> exit 0', () => {
    const result = validateInput('{"tipo":"resultado","arquivos":["a.ts:1"]}');
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout.trim());
    assert.equal(parsed.valid, true);
  });

  it('invalid JSON -> exit 1', () => {
    const result = validateInput('{"tipo":"resultado","invalid"}');
    assert.equal(result.status, 1);
    assert.ok((result.stderr || result.stdout).includes("Invalid JSON"));
  });

  it('valid revisao_plano -> exit 0', () => {
    const result = validateInput('{"tipo":"revisao_plano","status":"approved"}');
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout.trim());
    assert.equal(parsed.valid, true);
  });

  it('revisao_plano missing status -> exit 1', () => {
    const result = validateInput('{"tipo":"revisao_plano"}');
    assert.equal(result.status, 1);
  });
});

describe("CLI — validate-pipeline", () => {
  // Pipeline tests depend on PR #84 (pipelines SKILL.md files)
  // TODO: restore when feat/pipelines-ado-flow is merged

  it('nonexistent file -> exit 1', () => {
    try {
      execSync(
        `${CLI} validate-pipeline /nonexistent/path/SKILL.md`,
        { encoding: "utf-8", cwd: ORCHESTRATOR_DIR }
      );
      assert.fail("Should have thrown");
    } catch (e) {
      assert.ok(e.status === 1);
    }
  });
});

describe("CLI — help", () => {
  it('node dist/index.js -> exit 0 with help', () => {
    const result = execSync(
      `${CLI}`,
      { encoding: "utf-8", cwd: ORCHESTRATOR_DIR }
    );
    assert.match(result, /Orchestrator/);
  });
});

// ═══════════════════════════════════════════════════════════════
// orquestrador.md — Agent instructions consistency
// ═══════════════════════════════════════════════════════════════

describe("orquestrador.md — image handling instructions", () => {
  let content;
  before(() => {
    content = fs.readFileSync(ORQUESTRADOR_MD, "utf-8");
  });

  // ── Zero acoplamento ──────────────────────────────────────
  it("MUST NOT contain the literal token 'mcp-image' anywhere (zero coupling)", () => {
    // Spec M5: garantir ausência de menções a mcp-image no orquestrador
    // Usa word boundary para capturar token bare, não apenas prefixos
    assert.ok(
      !/\bmcp-image\b/.test(content),
      "orquestrador.md should NOT contain the literal token 'mcp-image' (matched: mcp-image)"
    );
  });

  it("MUST NOT contain 'image_save' or 'saved_path' as invocation tokens", () => {
    assert.ok(
      !/image_save/.test(content),
      "orquestrador.md should NOT reference image_save"
    );
    assert.ok(
      !/saved_path/.test(content),
      "orquestrador.md should NOT reference saved_path"
    );
  });

  it("MUST NOT contain 'listImageAttachments' as invocation token", () => {
    assert.ok(
      !/listImageAttachments/.test(content),
      "orquestrador.md should NOT reference listImageAttachments"
    );
  });

  // ── Detecção de imagem ───────────────────────────────────
  it("MUST document AB# as an optional adapter reference", () => {
    assert.ok(content.includes("AB#") && /adapter/i.test(content), "orquestrador.md should document AB# as optional");
  });

  it("MUST contain URL detection pattern", () => {
    assert.ok(/https?:\/\//.test(content), "orquestrador.md should contain regex pattern for URL detection");
  });

  it("MUST contain local path detection (.png/.jpg)", () => {
    assert.ok(/\.(png|jpg|jpeg|webp|gif|avif)/i.test(content), "orquestrador.md should detect local image paths by extension");
  });

  // ── Subagent decision ────────────────────────────────────
  it("MUST reference 'image-analyzer' subagent", () => {
    assert.ok(content.includes("image-analyzer"), "orquestrador.md should reference image-analyzer");
  });

  it("MUST reference 'ux-analyzer' subagent", () => {
    assert.ok(content.includes("ux-analyzer"), "orquestrador.md should reference ux-analyzer");
  });

  // ── Non-blocking behavior ─────────────────────────────────
  it("MUST document non-blocking behavior on vision failure", () => {
    assert.ok(
      /não.?bloqueante/.test(content),
      "orquestrador.md should document non-blocking behavior (não-bloqueante)"
    );
  });

  // ── Artifact injection ───────────────────────────────────
  it("MUST reference analises[] iteration for injection", () => {
    assert.ok(
      /analises\[\]/.test(content) || (/analises/.test(content) && /injetar|iterar|imagem/.test(content)),
      "orquestrador.md should reference analises[] iteration for artifact injection"
    );
  });
});
