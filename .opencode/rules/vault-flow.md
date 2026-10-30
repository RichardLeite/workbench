# Vault-Flow: README Auto-Documentation for Skills

> Rule: Whenever a skill is **created**, **updated**, or **installed** (via `npx skills add`),
> the `.workbench/README.md` **must** be updated to document it.

## When This Rule Triggers

This rule triggers when:
1. A new skill is created under `.opencode/skills/<name>/` or `.claude/skills/<name>/`
2. An existing skill is significantly updated (SKILL.md frontmatter changes)
3. A skill is installed via `npx skills add <repo>`
4. A PR is opened that adds or modifies skills

## What Must Be Updated

For each affected skill, update:

### 1. Structure Tree (if new skill)

Add a new entry to the directory tree in the relevant section:
```
.opencode/skills/
├── <skill-name>/     # description
```

### 2. Skills Table

Add or update the skill's row in the "Skills" table with:
- **Skill**: `<skill-name>`
- **Description**: From SKILL.md frontmatter
- **Associated Agents** (if any): Which agents use this skill

### 3. "Bons e Maus Usos" Section (if applicable)

Add an example showing when to use and when not to use this skill.

## Procedure

1. **Read the skill's SKILL.md** — extract the `name` and `description` from frontmatter
2. **Check current README** — does it already mention this skill?
3. **If missing**: Append to structure tree, skills table, and usage examples
4. **If outdated**: Update the row/entry to match current SKILL.md
5. **Commit** with message: `chore(workbench): document <skill-name> skill in README`

## Location

- Target file: `README.md` at `.workbench/` root
- Structure tree: The directory listing section near the top
- Skills table: The "Skills" table (search for `| Skill |`)
- Usage examples: The "Bons e Maus Usos" section (search for `| # |`)
