import type { Plugin } from "@opencode-ai/plugin"
import { execFile } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { delimiter, join } from "node:path"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

type Project = {
  name?: string
  description?: string
  repos?: Record<string, string>
}

type Catalog = {
  projects?: Record<string, Project>
}

function catalogPath(root: string): string {
  return join(root, ".opencode", "config", "project-mapping.local.json")
}

function pythonCandidates(root: string): string[] {
  const candidates: string[] = []
  if (process.env.WB_PYTHON) candidates.push(process.env.WB_PYTHON)
  if (process.platform === "win32") {
    candidates.push(join(root, ".venv", "Scripts", "python.exe"))
  } else {
    candidates.push(join(root, ".venv", "bin", "python"))
  }
  candidates.push("python3", "python")
  return candidates
}

async function syncCatalog(root: string): Promise<void> {
  const pythonPath = [join(root, "src"), process.env.PYTHONPATH]
    .filter((item): item is string => Boolean(item))
    .join(delimiter)

  for (const python of pythonCandidates(root)) {
    if (python.includes("/") || python.includes("\\")) {
      if (!existsSync(python)) continue
    }
    try {
      await execFileAsync(
        python,
        ["-m", "workbench", "projects", "sync", "--quiet", "--root", root],
        {
          cwd: root,
          env: { ...process.env, WB_ROOT: root, PYTHONPATH: pythonPath },
          timeout: 15000,
          windowsHide: true,
        },
      )
      return
    } catch {
      continue
    }
  }

  try {
    await execFileAsync(
      "uv",
      ["run", "--frozen", "python", "-m", "workbench", "projects", "sync", "--quiet", "--root", root],
      {
        cwd: root,
        env: { ...process.env, WB_ROOT: root, PYTHONPATH: pythonPath },
        timeout: 30000,
        windowsHide: true,
      },
    )
  } catch {
    return
  }
}

function readCatalog(root: string): Catalog {
  const path = catalogPath(root)
  if (!existsSync(path)) return {}
  try {
    const payload: unknown = JSON.parse(readFileSync(path, "utf-8"))
    return typeof payload === "object" && payload !== null ? (payload as Catalog) : {}
  } catch {
    return {}
  }
}

function addReferences(config: unknown, catalog: Catalog): void {
  if (typeof config !== "object" || config === null) return
  const target = config as { reference?: Record<string, unknown> }
  if (!target.reference || typeof target.reference !== "object") {
    target.reference = {}
  }
  const reference = target.reference
  const projects = catalog.projects
  if (!projects || typeof projects !== "object") return

  for (const project of Object.values(projects)) {
    if (!project || typeof project !== "object") continue
    const repos = project.repos
    if (!repos || typeof repos !== "object") continue
    for (const repoPath of Object.values(repos)) {
      if (typeof repoPath !== "string" || !repoPath) continue
      if (repoPath.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(repoPath)) continue
      const alias = repoPath.replace(/\\/g, "/").split("/").filter(Boolean).pop()
      if (!alias || !/^[A-Za-z0-9._-]+$/.test(alias) || alias in reference) continue
      const name = project.name || alias
      const description = project.description
        ? `${name} — ${project.description}`
        : name
      reference[alias] = { path: repoPath, description }
    }
  }
}

export const ProjectsPlugin: Plugin = async ({ worktree, directory }) => {
  const root = worktree || directory || process.cwd()
  return {
    config: async (config) => {
      if (process.env.WB_NO_DISCOVERY === "1") return
      try {
        await syncCatalog(root)
        addReferences(config, readCatalog(root))
      } catch {
        return
      }
    },
  }
}
