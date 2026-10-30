# Description Optimization

The description field in SKILL.md frontmatter is the primary mechanism that determines whether Claude invokes a skill. After creating or improving a skill, offer to optimize the description for better triggering accuracy.

## Step 1: Generate trigger eval queries

Create 20 eval queries — a mix of should-trigger and should-not-trigger:
```json
[
  {"query": "the user prompt", "should_trigger": true},
  {"query": "another prompt", "should_trigger": false}
]
```

Queries must be realistic, concrete, and specific — include file paths, personal context, column names, URLs, backstory. Mix lengths, focus on edge cases.

For **should-trigger** (8-10): cover different phrasings, some casual, some formal. Include cases where user doesn't explicitly name the skill but clearly needs it.

For **should-not-trigger** (8-10): focus on near-misses — queries sharing keywords but needing something different.

## Step 2: Review with user

Present eval set using `assets/eval_review.html`:
1. Read template, replace `__EVAL_DATA_PLACEHOLDER__`, `__SKILL_NAME_PLACEHOLDER__`, `__SKILL_DESCRIPTION_PLACEHOLDER__`
2. Write to temp file and open
3. User edits queries, toggles should-trigger, clicks "Export Eval Set"
4. Find exported file in Downloads folder

## Step 3: Run optimization loop

```bash
node scripts/run_loop.js \
  --eval-set <path-to-trigger-eval.json> \
  --skill-path <path-to-skill> \
  --model <model-id-powering-this-session> \
  --max-iterations 5 \
  --verbose
```

The loop: splits eval set into 60% train/40% test, evaluates current description (3 runs/query), calls Claude to propose improvements, re-evaluates, iterates up to 5 times. Selects `best_description` by test score.

## How skill triggering works

Skills appear in `available_skills` with name + description. Claude consults skills for tasks it can't handle easily on its own — complex, multi-step, or specialized queries. Simple one-step queries like "read this PDF" may not trigger even with perfect description match.

## Step 4: Apply the result

Take `best_description` from output and update SKILL.md frontmatter. Show user before/after and scores.
