---
name: task-refiner
description: "Interview engine for refining ideas/tasks. Detects the artifact type and collects structured information via question blocks. Does NOT generate the final artifact — returns data for the /refinar command to route to the specialized generator (new-bug, new-feature, new-adr, etc.)."
---

# Task Refiner

> Interview engine. Finds out what needs to be done
> and collects all necessary information. Artifact generation is delegated
> to the `/refinar` command, which routes to the corresponding specialized command.

## Purpose

**ONLY** interview the user to refine the idea/task. Does not generate the final artifact.
The output is a structured JSON with the answers, which the `/refinar` command uses to
dispatch the appropriate generation command (`/new-bug`, `/new-feature-spec`, `/new-adr`, etc.).

## Input Parameters

Received from the `/refinar` command:

| Parameter            | Type     | Description                                       |
| -------------------- | -------- | ------------------------------------------------- |
| `source_type`        | string   | `wi` \| `file` \| `description`                   |
| `source_title`       | string?  | Original title (if available)                     |
| `source_description` | string   | Full text extracted from source                   |
| `source_id`          | number?  | Issue/URL ID (opcional)               |

---


---

## PHASE 1 — Analyze source + Detect artifact

### 1.1. Extract content

Use the provided `source_description`. If it comes from a WI or file, the `/refinar` command
already extracted it before calling the skill.

### 1.2. Automatically detect artifact type

Analyze the `source_title` + `source_description` (first 500 characters) and classify:

| Strong text clues                                     | Suggested artifact      | Destination command        |
| ----------------------------------------------------- | ----------------------- | -------------------------- |
| "bug", "error", "crash", "isn't working", "broken", "failure", "exception", "fix" | Bug spec | `/new-bug` |
| "adr", "decision", "choose between", "architecture", "trade-off", "migrate to" | ADR | `/new-adr` |
| "feature", "new functionality", "new screen", "implement", "create", "add" | Feature spec | `/new-feature-spec` |
| "plan", "planning", "breakdown", "tasks", "split" | Implementation plan | *(direct generation)* |
| (no strong clues / generic)                            | Generic spec            | *(direct generation)* |

### 1.3. Confirm or ask

- If detection is **strong** (≥2 clues) → quickly confirm:
  ```
  "I detected this looks like a <type>. Confirm? (Yes/No)"
  ```
- If **weak or ambiguous** → ask:
  ```
  "What type of artifact do you want to generate?"
  Options: Technical spec, Feature spec, Bug spec, ADR, Implementation plan, Other (describe)
  ```
- If **other** → ask which template or format they want

---

## PHASE 2 — Interview blocks

> **Style:** Blocks of 3-5 related questions. Use the `question` tool with options
> whenever possible. Each block covers one dimension of the artifact.

### Interview rules

1. **One question at a time within the block** — use `question` tool with options
2. If the answer can be found in the codebase → explore before asking
3. If the user provides enough info → skip redundant questions
4. **Maximum 5 blocks** to avoid user fatigue
5. If the user answers "don't know" or "whatever" → record and move on
6. Open-ended questions (no options) only when strictly necessary
7. **Collect answers in named variables** — each answer becomes a key in the output JSON

---

### Block A — General Context (always)

Questions about the general purpose, regardless of artifact type:

1. `objective`: "What is the main objective of this task? What problem are we solving?"
2. `stakeholder`: "Who is the user/expectation owner? (PO, client, internal team)"
3. `impact`: "What is the impact if we don't do this? (not urgent, blocks process, financial loss, risk)"

---

### Block B — Artifact-Specific

#### If **Bug spec**:

1. `environment`: "Where does the bug occur? (environment, screen, endpoint, functionality)"
2. `expected_vs_actual`: "What is the expected vs actual behavior?"
3. `repro_steps`: "Can you reproduce it consistently? Step by step?"
4. `evidence`: "Any evidence? (log, screenshot, stack trace, affected user)"
5. `severity`: "What is the severity? (cosmetic, partial functional, blocking, critical)"

#### If **Feature spec**:

1. `user_flow`: "What is the flow from start to finish? Describe the ideal scenario."
2. `scope_in_out`: "What is IN scope? What is OUT of scope?"
3. `business_rules`: "Are there specific business rules or validations?"
4. `acceptance_criteria`: "What criteria define that this feature is done?"
5. `dependencies`: "Any dependencies? (other features, teams, integrations)"

#### If **ADR**:

1. `decision_problem`: "What decision needs to be made? What is the architectural problem?"
2. `options`: "What options were considered? (list all, even discarded ones)"
3. `recommendation`: "What is your initial recommendation and why?"
4. `trade_offs`: "What trade-offs do you anticipate? (performance, maintainability, security)"
5. `validation_plan`: "How to validate the decision? (proof of concept, load test, analysis)"

#### If **Implementation plan**:

1. `layers`: "Which layers are affected? (frontend, backend, database)"
2. `execution_order`: "What is the proposed implementation order?"
3. `risks_blindspots`: "Any risks or blind spots? (complex migration, contract change)"
4. `rollback_strategy`: "Need a rollback strategy? How to revert if something goes wrong?"

#### If **Generic spec**:

1. `objective_scope`: "What is the objective and what is in scope?"
2. `prerequisites`: "What are the prerequisites and dependencies?"
3. `acceptance_criteria`: "What are the acceptance criteria? (what must be true to deliver)"
4. `risks`: "Known risks?"
5. `validation`: "How to validate we delivered correctly?" (rollout, tests, metrics)

---

### Block C — Technical (if applicable)

Questions whose answers can be found by exploring the codebase:

- **API change** → `@explorador` to map existing endpoints
- **New screen** → `@explorador` to map similar components
- **Migration** → `@explorador` or `mysql_describe_table` for current schema
- **Integration** → `@explorador` to map existing contracts

If the user mentions something technical and the agent can investigate on its own → investigate without asking.
If relevant info is found in the codebase, include it in `tech_findings` in the output.

---

### Block D — Delivery (always)

1. `deadline`: "What is the deadline/delivery expectation?"
2. `approval_needed`: "Does anyone else need to review or approve before implementing?"
3. `extra_notes`: "Any final observations that haven't been captured?"

---

## Interview Result

After the blocks, return **only** the structured JSON below to the `/refinar` command.
**Do not generate the artifact. Do not save a file.** The command will handle routing.

```json
{
  "source": {
    "type": "wi | file | description",
    "id": 19379,
    "original_title": "Bug: Price not updating in cart",
    "original_description": "When adding a product with promotional price..."
  },
  "detected_artifact": {
    "type": "bug",
    "command_target": "/new-bug",
    "confidence": "high",
    "confirmed_by_user": true
  },
  "interview": {
    "objective": "Fix promotional price calculation in cart",
    "stakeholder": "PO — John",
    "impact": "Lost sale, customer cancels",
    "environment": "Production, Chrome 120, API v2",
    "expected_vs_actual": "Expected: promotional price in subtotal. Actual: full price",
    "repro_steps": "1. Add a promotional product 2. Go to cart 3. Check subtotal",
    "severity": "blocking",
    "evidence": "Screenshot attached to WI #20531",
    "deadline": "Today",
    "approval_needed": "Tech lead",
    "extra_notes": "May be related to price caching"
  },
  "tech_findings": [
    "CartController.calculatePrice in meu-projeto-api/src/controllers/v2/CartController.ts",
    "5min TTL cache in Redis for promotional prices"
  ],
  "blocks_completed": 4,
  "warnings": []
}
```

**Output JSON rules:**
- `detected_artifact.type`: `bug` | `feature` | `adr` | `plan` | `spec` | `custom`
- `detected_artifact.command_target`: command to be called (`/new-bug`, `/new-feature-spec`, `/new-adr`, or `null` for direct generation)
- `interview`: named keys according to the questions answered (only those that were asked)
- `tech_findings`: codebase findings (empty array if nothing was found)
- Interview key names follow the prefixes defined in Block B (e.g., `repro_steps`, `environment`, `user_flow`)

---

## Examples

### Example 1: Issue — Bug spec

**Input:** `/refinar 20531` → skill receives `{ source_type: "wi", source_title: "Bug: Price not updating in cart", source_description: "..." }`

**Actions in skill:**
1. Detection: "bug", "not updating" → **Bug**, high confidence
2. Confirm: "Detected Bug spec. Confirm?" → Yes
3. Block A: Ask `objective`, `stakeholder`, `impact`
4. Block B (bug): Ask `environment`, `expected_vs_actual`, `repro_steps`, `severity`
5. Block C: Explore codebase → finds `CartController.calculatePrice`
6. Block D: Ask `deadline`, `approval_needed`, `extra_notes`

**Output:** JSON with `detected_artifact.command_target: "/new-bug"` and all answers in `interview`.

### Example 2: Free-form description → Implementation plan

**Input:** `/refinar I want to create a sales dashboard`

**Actions in skill:**
1. source_type = `description`
2. Detection: "create", "dashboard" → Feature or Plan? Ambiguous
3. Ask artifact type → user chooses "Implementation plan"
4. Block A: General context
5. Block B (plan): Ask `layers`, `execution_order`, `risks_blindspots`, `rollback_strategy`
6. Block C: Investigate codebase → finds existing sales API
7. Block D: Delivery

**Output:** JSON with `detected_artifact.command_target: null` (plan has no specific command).

### Example 3: Existing spec → ADR

**Input:** `/refinar projects/meu-projeto/knowledge/specs/payment-migration.md`

**Actions in skill:**
1. source_type = `file`
2. Detection: "migrate", "gateway" → **ADR**, medium confidence
3. Confirm → Yes
4. Block A + B (ADR) + D

**Output:** JSON with `detected_artifact.command_target: "/new-adr"`.

---

## Guardrails

1. **Never invent information.** If the user didn't answer, don't include it in the JSON.
2. **Prefer `question` tool with options** over open-ended questions.
3. **Max. 5 question blocks.**
4. **Investigate the codebase before asking.** If the answer can be found in code, don't ask.
5. **Keep a collaborative interview tone**, not an interrogation.
6. **If the user interrupts the flow**, record and adapt subsequent questions.
7. **Do NOT generate the artifact. Do NOT save a file.** The skill is only the interview engine.
8. **Never alter external issues/trackers ?** `/refinar` is read-only.
