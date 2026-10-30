---
name: skill-creator
description: Create new skills, modify and improve existing skills, and measure skill performance. Use when users want to create a skill from scratch, edit, or optimize an existing skill, run evals to test a skill, benchmark skill performance with variance analysis, or optimize a skill's description for better triggering accuracy.
compatibility: "Requires: Node.js (for all scripts — stdlib only, no npm packages needed), and `claude` CLI (for description optimization via run_loop.js/run_eval.js)."
---

# Skill Creator

A skill for creating new skills and iteratively improving them through a structured loop: draft, test, evaluate, refine. The core process involves writing a SKILL.md, running it against test prompts with baseline comparisons, evaluating results (qualitatively via `eval-viewer/generate_review.js` and quantitatively via assertions), and iterating based on feedback. This skill guides you through each stage — from capturing intent to running evals, analyzing benchmarks, and optimizing the description for better triggering.

## Communicating with the user

Users range from novices to experts. Pay attention to context cues: terms like "evaluation" and "benchmark" are generally OK; "JSON" and "assertion" require the user to show familiarity first. Briefly explain terms if in doubt.

---

## Creating a skill

### Capture Intent

Start by understanding the user's intent. Extract answers from conversation history — tools used, sequence of steps, corrections, input/output formats. Confirm with the user before proceeding.

1. What should this skill enable Claude to do?
2. When should it trigger?
3. What's the expected output format?
4. Should we set up test cases? (recommended for objectively verifiable outputs)

### Write the SKILL.md

Fill in: **name** (identifier), **description** (when to trigger — make it slightly "pushy" to counter undertriggering), **compatibility** (dependencies, optional).

#### Anatomy
```
skill-name/
├── SKILL.md (YAML frontmatter + body)
└── Bundled: scripts/, references/, assets/
```

#### Progressive Disclosure
Three levels: metadata (always), SKILL.md body (<500 lines), bundled resources (as needed). Keep SKILL.md under 500 lines; add hierarchy when approaching this limit. For large references (>300 lines), include ToC. For multi-domain skills, organize by variant in `references/`.

#### Writing Patterns
- Use imperative form
- Define output formats with exact templates
- Include examples with Input/Output format
- Explain *why* instructions matter (avoid ALWAYS/NEVER)
- Keep prompts general, not narrow to specific examples

### Test Cases

Draft 2-3 realistic test prompts after writing SKILL.md. Save to `evals/evals.json` (prompts only, assertions added later). See `references/schemas.md` for the full schema.

## Running evaluations

See `references/evaluation-workflow.md` for the full detailed workflow. High-level steps:

1. Spawn with-skill and baseline runs in parallel for each test case
2. Draft quantitative assertions while runs execute
3. Capture timing data (`total_tokens`, `duration_ms`)
4. Grade runs, aggregate into benchmark, launch viewer via `eval-viewer/generate_review.js`
5. Read user feedback from `feedback.json`

Do NOT use `/skill-test` or other testing skills.

## Improving the skill

1. **Generalize from feedback** — avoid overfitting to specific examples. If stubborn issues persist, try different approaches rather than adding rigid constraints.
2. **Keep the prompt lean** — read transcripts, not just outputs. Remove parts that waste the model's time.
3. **Explain the why** — tell the model *why* instructions matter. Avoid ALWAYS/NEVER in all caps; explain reasoning instead.
4. **Look for repeated work** — if test cases all write similar helper scripts, bundle them once in `scripts/`.

After improving, rerun all test cases into a new iteration, launch viewer with `--previous-workspace`, and repeat until the user is satisfied or no meaningful progress.

## Advanced: Blind comparison

For rigorous A/B comparison between skill versions, see `agents/comparator.md` and `agents/analyzer.md`. Optional, requires subagents.

---

## Description Optimization

After creating or improving a skill, offer to optimize the description for better triggering accuracy.

See `references/description-optimization.md` for the full workflow: generate 20 trigger eval queries (mix of should-trigger/should-not-trigger), review with user via `assets/eval_review.html`, run `node scripts/run_loop.js` (auto-optimizes up to 5 iterations), and apply the `best_description` to SKILL.md frontmatter.

---

## Platform-Specific Notes

### Claude.ai (no subagents)
- Run test cases one at a time by following SKILL.md yourself; skip baseline runs.
- Present results inline (no browser viewer); use `--static <output_path>` for viewer if needed.
- Skip quantitative benchmarking and blind comparison.
- Description optimization requires `claude` CLI — skip if unavailable.
- When updating an existing skill: preserve the original name, copy to writeable location before editing.
- Packaging: `node scripts/package_skill.js <path>` works anywhere with Node.js.

### Cowork (has subagents)
- Full evaluation workflow works; viewer uses `--static <output_path>`.
- Generate the eval viewer with `generate_review.js` BEFORE evaluating inputs yourself.
- Feedback downloads as `feedback.json` from the viewer.

## Reference files

- `agents/grader.md` — How to evaluate assertions against outputs
- `agents/comparator.md` — How to do blind A/B comparison
- `agents/analyzer.md` — How to analyze benchmark results
- `references/schemas.md` — JSON structures for evals, grading, etc.
- `references/evaluation-workflow.md` — Detailed evaluation steps
- `references/description-optimization.md` — Description optimization guide
