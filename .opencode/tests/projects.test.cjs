const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

const pluginPath = path.join(__dirname, "..", ".plugin-test", "projects.js")
delete require.cache[require.resolve(pluginPath)]
const { ProjectsPlugin } = require(pluginPath)

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "workbench-plugin-"))
}

function writeCatalog(root, projects) {
  const file = path.join(root, ".opencode", "config", "project-mapping.local.json")
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    JSON.stringify({ generated_at: new Date().toISOString(), projects, roots: ["."], version: 1, warnings: [] }),
    "utf-8",
  )
  return file
}

async function runConfig(root, config, env = {}) {
  const previous = { ...process.env }
  Object.assign(process.env, env)
  try {
    const hooks = await ProjectsPlugin({ worktree: root, directory: root })
    await hooks.config(config)
  } finally {
    for (const key of ["WB_NO_DISCOVERY", "WB_PROJECTS_SYNC_TTL_MS", ...Object.keys(env)]) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  }
}

test("injects project repositories as local references", async () => {
  const root = makeRoot()
  writeCatalog(root, {
    alpha: { name: "Alpha", repos: { root: "alpha" } },
    nested: { name: "Nested", repos: { api: "nested/api" } },
    absolute: { name: "Absolute", repos: { root: "C:/repos/absolute" } },
    posix: { name: "Posix", repos: { root: "/repos/posix" } },
  })

  const config = { reference: { existing: { path: "." } } }
  await runConfig(root, config, { WB_PROJECTS_SYNC_TTL_MS: "600000" })

  assert.deepEqual(config.reference.existing, { path: "." })
  assert.equal(config.reference.alpha, "./alpha")
  assert.equal(config.reference.api, "./nested/api")
  assert.equal(config.reference.absolute, undefined)
  assert.equal(config.reference.posix, undefined)
})

test("uses string shorthand for bare local repository paths", async () => {
  const root = makeRoot()
  writeCatalog(root, {
    JARVIS: { repos: { root: "JARVIS" } },
    nested: { repos: { api: "nested\\api" } },
  })

  const config = { reference: {} }
  await runConfig(root, config, { WB_PROJECTS_SYNC_TTL_MS: "600000" })

  assert.equal(config.reference.JARVIS, "./JARVIS")
  assert.equal(config.reference.api, "./nested/api")
})

test("creates the reference map when it does not exist", async () => {
  const root = makeRoot()
  writeCatalog(root, { alpha: { repos: { root: "alpha" } } })

  const config = {}
  await runConfig(root, config, { WB_PROJECTS_SYNC_TTL_MS: "600000" })

  assert.deepEqual(config.reference, { alpha: "./alpha" })
})

test("does not overwrite an existing alias", async () => {
  const root = makeRoot()
  writeCatalog(root, { alpha: { repos: { root: "alpha" } } })

  const config = { reference: { alpha: { path: "custom" } } }
  await runConfig(root, config, { WB_PROJECTS_SYNC_TTL_MS: "600000" })

  assert.deepEqual(config.reference.alpha, { path: "custom" })
})

test("respects WB_NO_DISCOVERY", async () => {
  const root = makeRoot()
  writeCatalog(root, { alpha: { repos: { root: "alpha" } } })

  const config = { reference: {} }
  await runConfig(root, config, { WB_NO_DISCOVERY: "1" })

  assert.deepEqual(config.reference, {})
})
