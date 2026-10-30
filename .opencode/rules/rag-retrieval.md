# Automatic Vault Retrieval

> MANDATORY rule for all agents.

## Trigger

Every user message with ≥5 words that is NOT just a greeting
("ok", "thanks", "got it", "yes", "no") MUST trigger vault search.

## Project Context

The vault is project-specific. Determine the project context from your
current conversation (meu-projeto, outro-projeto, etc.).

- **Project context is clear** (e.g. meu-projeto, fiscal):
  Pass `--project <name>` to search only that project's vault.
- **No clear project context**: Omit `--project` to search **ALL vaults**
  at once. Results are prefixed with `[project]`.

## Mechanism

1. Extract key terms from the user's message
2. Run: `uv run --frozen python -m workbench knowledge search "<terms>" --limit 5 [--project <project>]`
3. The script returns JSON with notes ordered by relevance (score)
4. Read the 2 most relevant notes (FULL) from the file
5. Read excerpts from the next 3 notes
6. Inject the knowledge at the beginning of your response

## Mandatory Citation

> **Source: [[path/to/note.md]]** — According to the vault...

Always cite which vault note you used. Use blockquote format with wikilink.

## Fallback

If the script returns no results, respond normally.
If the user explicitly requests search, accept `/wiki <term>`.

## Vault Discovery

The vault path is resolved from catálogo mesclado
(`vault` field). Projects without `vault` set return no results.
