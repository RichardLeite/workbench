# Evaluation Workflow

## Setup

Put results in `<skill-name>-workspace/` as a sibling to the skill directory. Within the workspace, organize by iteration (`iteration-1/`, `iteration-2/`, etc.) and within each, test cases in directories (`eval-0/`, `eval-1/`, etc.).

## Step 1: Spawn all runs (with-skill AND baseline) in the same turn

For each test case, spawn two subagents in the same turn — one with the skill, one without.

**With-skill run:**
```
Execute this task:
- Skill path: <path-to-skill>
- Task: <eval prompt>
- Input files: <eval files if any, or "none">
- Save outputs to: <workspace>/iteration-<N>/eval-<ID>/with_skill/outputs/
- Outputs to save: <what the user cares about>
```

**Baseline run:**
- **Creating a new skill**: no skill at all. Save to `without_skill/outputs/`.
- **Improving an existing skill**: snapshot the skill, point baseline subagent at snapshot. Save to `old_skill/outputs/`.

Write `eval_metadata.json` for each test case (assertions empty for now):
```json
{
  "eval_id": 0,
  "eval_name": "descriptive-name-here",
  "prompt": "The user's task prompt",
  "assertions": []
}
```

## Step 2: Draft assertions while runs progress

Good assertions are objectively verifiable with descriptive names. Update `eval_metadata.json` and `evals/evals.json` with drafted assertions. Subjective skills (writing style, design) are better evaluated qualitatively.

## Step 3: Capture timing data

When each subagent task completes, save timing to `timing.json`:
```json
{
  "total_tokens": 84852,
  "duration_ms": 23332,
  "total_duration_seconds": 23.3
}
```

## Step 4: Grade, aggregate, and launch viewer

1. **Grade each run** — read `agents/grader.md`, evaluate assertions. Save to `grading.json` (requires fields `text`, `passed`, `evidence`).
2. **Aggregate into benchmark** — run `node scripts/aggregate_benchmark.js <workspace>/iteration-N --skill-name <name>`. Produces `benchmark.json` and `benchmark.md`.
3. **Analyst pass** — read benchmark data for non-discriminating assertions, flaky evals, time/token tradeoffs (see `agents/analyzer.md`).
4. **Launch viewer** — `node <skill-creator-path>/eval-viewer/generate_review.js <workspace>/iteration-N --skill-name "my-skill"`. For iteration 2+, pass `--previous-workspace`. For headless environments, use `--static <output_path>`.

The viewer shows "Outputs" tab (prompt, output, formal grades, feedback) and "Benchmark" tab (stats summary).

## Step 5: Read feedback

When the user completes review, read `feedback.json`. Empty feedback means the user thought it was fine. Kill the viewer server with `kill $VIEWER_PID`.

## The iteration loop

After improving the skill:
1. Apply improvements
2. Rerun all test cases into `iteration-<N+1>/` directory
3. Launch viewer with `--previous-workspace`
4. Wait for user review
5. Read new feedback, improve again, repeat

Keep going until user is satisfied, feedback is all empty, or no meaningful progress.
