# Skill: review-bot

## Trigger
`/review-bot` — invoked on demand, processes GPT-4o-mini bot suggestions on current PR

## Context
A GitHub Action (Review-PR-IA.yml) runs on every PR in meu-projeto-api and meu-projeto-app.
It posts a comment with code improvement suggestions. This skill parses that comment,
lets the user select which improvements to implement, and commits them to the PR.

## Workflow

### 1. Identify current repo
- Run `git remote -v` to get remote URL
- Determine if `meu-projeto-api` (backend) or `meu-projeto-app` (frontend)
- Ask user if detection fails: "Could not detect the repo. Is it api or app?"

### 2. Get current PR
- Run `git branch --show-current` to get branch name
- Use `github_pull_request_read` (method: get) with branch name or ask user for PR number

### 3. Read bot comment
- Use `github_pull_request_read` (method: get_comments)
- Filter comments where `user.login === 'github-actions[bot]'`
- Take the most recent one
- If no bot comment found:
  - Inform: "No bot comment found. The action runs on opened/synchronize/reopened."
  - Exit skill

### 4. Parse suggestions
- If response contains "Approved" or "Verdict" with positive sentiment:
  - Inform: "The bot approved the PR. No improvements to implement."
  - Exit skill

Parse based on repo type:

**API (meu-projeto-api)**:
- 🔴 [CRITICAL]: Title, description, code_snippet
- 🟡 [IMPROVEMENT]: Title, description, code_snippet, rationale

**APP (meu-projeto-app)**:
- 🔴 [ERROR]: Title, description, code_snippet
- 💡 [TIP]: Title, description, code_snippet

Extract: priority, title, description, code_snippet

### 5. Present to user
- Show numbered list of suggestions (CRITICAL/ERROR first)
- Ask user to select which to implement (multi-select)
- If none selected: exit skill

### 6. For each selected improvement:

a) Extract TASK ID from PR title
   - Regex: `AB#(\d+)` from PR title
   - Use taskId in commit messages

b) Enter PLAN mode
   - Analyze the PR diff using `github_pull_request_read` (method: get_diff)
   - Read the specific file(s) mentioned in the suggestion
   - Propose a specific implementation plan with code
   - Show plan to user and ask for confirmation

c) If user accepts:
   - Implement the change
   - Stage and commit with:
     - CRITICAL/ERROR → `fix(AB#TASKID): description`
     - IMPROVEMENT/TIP → `refactor(AB#TASKID): description`
   - Ask user before committing (no auto-commit)
   - Push: `git push`
   - GitHub Action will comment again after push

### 7. Summary
- List all implemented improvements
- Include commit links
- Remind: "The action will comment again after push"

## Fallback rules
- No bot comment → informative message, exit
- Bot approved → informative message, exit
- Repo detection failed → ask user
- TASK ID not found → use generic message: `refactor(WORKBENCH):`
- User rejects plan → skip this improvement, continue to next
