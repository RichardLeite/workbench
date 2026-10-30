import type { Plugin } from "@opencode-ai/plugin"
import { appendFileSync, mkdirSync, existsSync } from "fs"
import { join } from "path"
import { homedir } from "os"

/**
 * Metrics Plugin
 *
 * Tracks three types of events via NDJSON logging:
 *   1. Subagent delegations (task tool calls) — com source detection
 *   2. Skill loading (skill tool calls) — nova feature
 *   3. Subagent session creation (session.created + parentID) — para
 *      detectar @mention vs chamada programática
 *
 * Log format: NDJSON (newline-delimited JSON)
 * Location: <workspace>/.opencode/knowledge/metrics/delegations.ndjson
 *
 * Event types logged:
 *   - start / end        → subagent delegations (enhanced with `source`)
 *   - skill_start / skill_end → skill usage
 *
 * To disable: remove or rename this file from the plugins/ directory.
 */

// ─── In-memory state ────────────────────────────────────────────────

/** sessionID → current agent name (tracked via chat.message) */
const agentMap = new Map<string, string>()

/** callID → start info for subagent duration calculation */
const subagentStartMap = new Map<string, {
  startTime: number
  subagent_type: string
  caller: string
  sessionID: string
}>()

/** callID → start info for skill duration calculation */
const skillStartMap = new Map<string, {
  startTime: number
  skill: string
  caller: string
  sessionID: string
}>()

/** sessionID set for subagent sessions (those created with parentID) */
const subagentSessions = new Set<string>()

// ─── Logging ─────────────────────────────────────────────────────────

/**
 * Resolves the metrics log directory.
 * Uses the current working directory (project root)
 * and falls back to ~/.opencode/metrics/ if CWD is not a project.
 */
function resolveMetricsDir(cwd: string): string {
  if (cwd && existsSync(join(cwd, ".opencode"))) {
    return join(cwd, ".opencode", "knowledge", "metrics")
  }
  return join(homedir(), ".opencode", "metrics")
}

/**
 * Appends a JSON entry as a new line in the NDJSON log file.
 * Creates the directory and file if they don't exist.
 */
function logEntry(cwd: string, entry: Record<string, unknown>): void {
  try {
    const dir = resolveMetricsDir(cwd)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const logFile = join(dir, "delegations.ndjson")
    appendFileSync(logFile, JSON.stringify(entry) + "\n")
  } catch (err) {
    // Silently fail — metrics should never crash the runtime
    console.error("[metrics] Failed to write log:", err)
  }
}

// ─── Plugin ──────────────────────────────────────────────────────────

export const MetricsPlugin: Plugin = async () => {
  return {
    /**
     * Track which agent is currently active per session.
     * This gives us the "caller" for any subsequent task() calls.
     */
    "chat.message": async (input) => {
      if (input.agent) {
        agentMap.set(input.sessionID, input.agent)
      }
    },

    /**
     * Track subagent session creation (session.created with parentID).
     * This is the definitive way to detect @mention invocations:
     * when a user types @agent_name, OpenCode creates a new session
     * with the parent session's ID as parentID.
     */
    event: async ({ event }) => {
      if (event.type === "session.created") {
        const info = event.properties?.info as Record<string, unknown> | undefined
        if (info?.parentID) {
          subagentSessions.add(info.id as string)
        }
      }
    },

    /**
     * Before a tool executes:
     *   - task tool  → log subagent delegation (enhanced with `source`)
     *   - skill tool → log skill loading (new)
     */
    "tool.execute.before": async (input, output) => {
      const tool = String(input?.tool ?? "").toLowerCase()
      const cwd = process.cwd()

      // ── SKILL TRACKING ──────────────────────────────────────────
      if (tool === "skill") {
        const args = output?.args
        if (!args || typeof args !== "object") return

        const skillName = (args as Record<string, unknown>).name as
          | string
          | undefined
        if (!skillName) return

        const caller = agentMap.get(input.sessionID) || "unknown"

        // Store for end-event duration calculation
        skillStartMap.set(input.callID, {
          startTime: Date.now(),
          skill: skillName,
          caller,
          sessionID: input.sessionID,
        })

        logEntry(cwd, {
          event: "skill_start",
          timestamp: new Date().toISOString(),
          sessionID: input.sessionID,
          callID: input.callID,
          caller,
          skill: skillName,
        })
        return
      }

      // ── SUBAGENT TRACKING ───────────────────────────────────────
      if (tool !== "task") return

      const args = output?.args
      if (!args || typeof args !== "object") return

      const subagentType = (args as Record<string, unknown>).subagent_type as
        | string
        | undefined
      if (!subagentType) return

      const description = (args as Record<string, unknown>).description ?? ""
      const caller = agentMap.get(input.sessionID) || "unknown"

      // Detect source: was this a user @mention or a programmatic orchestrator call?
      // - @mention: creates a subagent session (tracked via session.created + parentID)
      //   where the caller agent is not yet set (unknown)
      // - Programmatic: called from an existing agent session (caller is known)
      const isSubagentSession = subagentSessions.has(input.sessionID)
      const source =
        isSubagentSession && caller === "unknown"
          ? "user_mention"
          : caller !== "unknown"
            ? "orchestrator"
            : "unknown"

      // Store for end-event duration calculation
      subagentStartMap.set(input.callID, {
        startTime: Date.now(),
        subagent_type: subagentType,
        caller,
        sessionID: input.sessionID,
      })

      logEntry(cwd, {
        event: "start",
        timestamp: new Date().toISOString(),
        sessionID: input.sessionID,
        callID: input.callID,
        caller,
        subagent_type: subagentType,
        description: String(description),
        source,
      })
    },

    /**
     * After a tool executes:
     *   - task tool  → log subagent end with duration
     *   - skill tool → log skill end with duration
     */
    "tool.execute.after": async (input) => {
      const tool = String(input?.tool ?? "").toLowerCase()
      const cwd = process.cwd()

      // ── SUBAGENT END ────────────────────────────────────────────
      if (tool === "task") {
        const startInfo = subagentStartMap.get(input.callID)
        if (!startInfo) return

        const duration = Date.now() - startInfo.startTime

        logEntry(cwd, {
          event: "end",
          timestamp: new Date().toISOString(),
          sessionID: startInfo.sessionID,
          callID: input.callID,
          caller: startInfo.caller,
          subagent_type: startInfo.subagent_type,
          duration_ms: duration,
        })

        subagentStartMap.delete(input.callID)
        return
      }

      // ── SKILL END ───────────────────────────────────────────────
      if (tool === "skill") {
        const startInfo = skillStartMap.get(input.callID)
        if (!startInfo) return

        const duration = Date.now() - startInfo.startTime

        logEntry(cwd, {
          event: "skill_end",
          timestamp: new Date().toISOString(),
          sessionID: startInfo.sessionID,
          callID: input.callID,
          caller: startInfo.caller,
          skill: startInfo.skill,
          duration_ms: duration,
        })

        skillStartMap.delete(input.callID)
      }
    },
  }
}
