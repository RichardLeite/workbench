---
name: playwright-cli
description: Automate browser interactions via Playwright CLI — navigation, interaction, screenshots, and session management.
---

## Goal

Automate browser interactions (navigation, clicks, form filling, screenshots) via Playwright CLI (`@playwright/cli`) in a standardized, safe, and auditable way.

## Prerequisites

- **Node.js 20+**
- Playwright CLI installed: `npm install -g @playwright/cli@latest`
- Or via `npx`: `npx playwright-cli --help`
- Browser installed: `playwright-cli install-browser` (auto-installs on first use)
  - Specific browser: `playwright-cli install-browser firefox`
  - With system dependencies: `playwright-cli install-browser --with-deps`

## Procedure

### 1. Verify installation

```bash
playwright-cli --help
playwright-cli install-browser --list   # list available browsers
```

### 2. Open browser and navigate

```bash
playwright-cli open https://example.com
playwright-cli open --headed               # show browser window
playwright-cli open --browser=firefox      # specific browser
playwright-cli open --persistent           # persist profile to disk
```

Navigation commands:

| Command | Description |
|---------|-------------|
| `open [url]` | Open browser, optionally navigate to URL |
| `goto <url>` | Navigate to a URL |
| `go-back` | Go back to previous page |
| `go-forward` | Go forward to next page |
| `reload` | Reload current page |
| `close` | Close current page |
| `close-all` | Close all browser sessions |

### 3. Read page state (snapshot)

After each command, the CLI returns an accessibility tree with **element refs**:

```bash
playwright-cli snapshot                    # full page snapshot
playwright-cli snapshot [ref]              # element snapshot
playwright-cli snapshot --depth=N          # limit depth
playwright-cli snapshot --filename=f       # custom filename
```

Element refs (e.g. `e15`, `e3`) are used in subsequent interaction commands.

### 4. Interact with elements

Use refs from snapshots (recommended), CSS selectors, or Playwright locators:

**Clicking & forms:**

| Command | Description |
|---------|-------------|
| `click <ref>` | Click element |
| `dblclick <ref>` | Double-click element |
| `fill <ref> <text>` | Clear and fill input |
| `fill <ref> <text> --submit` | Fill and press Enter |
| `type <text>` | Type into focused element |
| `select <ref> <value>` | Select dropdown option |
| `check <ref>` | Check checkbox/radio |
| `uncheck <ref>` | Uncheck checkbox |
| `hover <ref>` | Hover over element |
| `drag <startRef> <endRef>` | Drag and drop |
| `upload <file>` | Upload files |
| `resize <width> <height>` | Resize viewport |

**Keyboard & Mouse:**

| Command | Description |
|---------|-------------|
| `press <key>` | Press key (Enter, Tab, Escape, etc.) |
| `press Control+a` | Key combinations |
| `keydown <key>` | Press key down |
| `keyup <key>` | Release key |
| `mousemove <x> <y>` | Move mouse to coordinates |
| `mousedown [button]` | Press mouse button |
| `mouseup [button]` | Release mouse button |
| `mousewheel <dx> <dy>` | Scroll |

**Tab management:**

| Command | Description |
|---------|-------------|
| `tab-list` | List all open tabs |
| `tab-new [url]` | Open new tab |
| `tab-select <index>` | Switch to tab |
| `tab-close [index]` | Close tab |

### 5. Capture evidence

```bash
playwright-cli screenshot                     # viewport screenshot
playwright-cli screenshot [ref]               # element screenshot
playwright-cli screenshot --full-page          # full scrollable page
playwright-cli screenshot --filename=f.png     # custom filename
playwright-cli pdf                            # PDF export
```

Use **snapshot** for page structure (refs), **screenshot** for visual evidence.

### 6. Manage sessions

```bash
playwright-cli -s=custom-session open https://example.com   # named session
playwright-cli list                                          # list all sessions
playwright-cli -s=name close                                 # close specific session
playwright-cli close-all                                     # close all sessions
playwright-cli kill-all                                      # force kill unresponsive
playwright-cli show                                          # open visual dashboard
```

**Save/restore authenticated state:**

```bash
playwright-cli state-save auth-state.json      # save cookies/storage
playwright-cli state-load auth-state.json      # restore in new session
```

**Persistent profile:**

```bash
playwright-cli open https://example.com --persistent         # survive browser restarts
playwright-cli open https://example.com --profile=./my-profile  # custom directory
```

### 7. Configuration

Use a JSON config file for advanced settings:

```bash
playwright-cli --config path/to/config.json open example.com
playwright-cli config-print                   # print resolved config
```

The CLI auto-loads `.playwright/cli.config.json` if present.

**Key env vars:**

| Variable | Description |
|----------|-------------|
| `PLAYWRIGHT_CLI_SESSION` | Default session name |
| `PLAYWRIGHT_MCP_BROWSER` | Browser (chrome, firefox, webkit, msedge) |
| `PLAYWRIGHT_MCP_HEADLESS` | Run headless |
| `PLAYWRIGHT_MCP_VIEWPORT_SIZE` | Viewport size (e.g. "1280x720") |

### 8. Best practices workflow

```
# 1. Open browser with named session
playwright-cli -s=todo-test open https://demo.playwright.dev/todomvc --headed

# 2. Snapshot to discover refs
playwright-cli -s=todo-test snapshot

# 3. Interact using refs
playwright-cli -s=todo-test fill e5 "Buy groceries"
playwright-cli -s=todo-test press Enter

# 4. Capture screenshot evidence
playwright-cli -s=todo-test screenshot --full-page --filename=groceries-added.png

# 5. Close when done
playwright-cli -s=todo-test close
```

## Guardrails

### When to use
- E2E testing of web applications
- Form filling and submission flows
- Visual regression evidence (screenshots)
- Debugging UI bugs with snapshots
- Automated data entry across multiple pages

### When NOT to use
- Unit or integration tests that don't require a browser
- Mass crawling/scraping without rate limiting and respect for robots.txt
- Testing behind complex SSO without session state pre-configured
- Operations requiring browser extensions not supported by Playwright

### Session limits
- Prefer **named sessions** (`-s=task-name`) to avoid cross-task state pollution
- Use `close` or `close-all` when finished — don't leave browsers running
- For long-running tasks, use `--persistent` or `state-save`/`state-load`
- Keep sessions short-lived; restart between unrelated scenarios

### Selector priority
1. **Refs from snapshots** (most reliable, recommended)
2. **Playwright locators**: `click "getByRole('button', ...)"`
3. **CSS selectors**: `click "#main > button.submit"`
4. **Mouse coordinates** (last resort — fragile to layout changes)

### Security
- Avoid capturing PII in screenshots sent back to logs
- Do not hardcode secrets in snapshot/screenshot filenames
- Use `state-save`/`state-load` carefully — auth files contain session tokens
- Prefer `--headed` only for debugging; use headless for automation

## References

- [Installation](https://playwright.dev/agent-cli/installation)
- [Quick Start](https://playwright.dev/agent-cli/quick-start)
- [Navigation Commands](https://playwright.dev/agent-cli/commands/navigation)
- [Interaction Commands](https://playwright.dev/agent-cli/commands/interaction)
- [Keyboard & Mouse](https://playwright.dev/agent-cli/commands/keyboard-mouse)
- [Screenshots & PDF](https://playwright.dev/agent-cli/commands/screenshots-pdf)
- [Sessions & Dashboard](https://playwright.dev/agent-cli/sessions)
- [Configuration](https://playwright.dev/agent-cli/configuration)
- [Snapshots](https://playwright.dev/agent-cli/snapshots)
