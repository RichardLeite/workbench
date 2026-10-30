---
name: issue
description: Create GitHub issues with structured template and labels
---

# Skill: issue

## Goal
Create GitHub issues in the correct repo with proper template, labels, and description.

## Efficiency
- Be concise by default. Only expand explanations if the user asks.
- Use the `question` tool for confirmations — no verbose back-and-forth.

---

## Procedure

### Step 1 — Identify project
If user didn't specify, ask which repo:
1. `.workbench` (current repo)
2. A project in the merged catalog
3. Other (specify owner/repo)

### Step 2 — Collect info
Ask user for:
1. **Title** (required)
2. **Type**: Bug / Enhancement / Documentation / Feature
3. **Description** (required)
4. **Labels**: auto-derived from type, allow extras
5. **Milestone** (optional)

**Description template** (show only if user says "template"):
```markdown
## What needs to be done?
[objective]

## Current state
[how it is today]

## Desired state
[how it should be]

## Acceptance criteria
- [ ] criterion 1
- [ ] criterion 2

## Additional context
[links, screenshots, references]
```

### Step 3 — Present for confirmation
```
📋 ISSUE CREATION
Project: {{PROJECT}}
Repo: {{REPO}}

1. Title: {{TITLE}}
2. Type: {{TYPE}}
3. Priority: {{PRIORITY}} (high|medium|low — default: medium)
4. Labels: {{LABELS}}

5. Description:
{{DESCRIPTION}}

Options: Confirm / Edit title / Edit description / Show template
```

**Wait for user response** before proceeding.

### Step 4 — Create issue
**MCP First, gh CLI Fallback** (same as `pr` skill):

1. MCP: `github_issues_write`
2. Fallback:
```bash
gh issue create --title "{{TITLE}}" --body "{{DESCRIPTION}}" --label "{{LABELS}}" {{REPO_FLAG}}
```

`{{REPO_FLAG}}` = empty for current repo, `--repo owner/repo` otherwise.

### Step 5 — Return result
```
✅ Issue created successfully!
📎 URL: https://github.com/{{OWNER}}/{{REPO}}/issues/{{NUMBER}}
```

---

## Repo mapping

| Project               | GitHub Repo                       |
| --------------------- | --------------------------------- |
| .workbench            | (current repo)                    |
| Projetos registrados  | `$GITHUB_OWNER/<repo>` via `wb projects list` |
| Other                 | Ask owner/repo                    |

## Guardrails
1. Never create issue without title, type, and description
2. Always confirm with user before creating
3. MCP First, gh CLI Fallback
4. Return explicit issue URL
5. Be concise — no verbose preamble or postamble
