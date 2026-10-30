#!/usr/bin/env node
/**
 * Run trigger evaluation for a skill description.
 *
 * Tests whether a skill's description causes Claude to trigger (read the skill)
 * for a set of queries. Outputs results as JSON.
 *
 * Usage:
 *   node run_eval.js --eval-set <eval-set.json> --skill-path <path> [options]
 *
 * The eval set is a JSON array of { query: string, should_trigger: boolean }.
 *
 * Note: This uses `claude -p` subprocess for each query run.
 *       Parallel execution uses Node.js child_process with promise-based pool.
 *       The `claude` CLI must be installed and authenticated.
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { parseSkillMd, parseSimpleYaml } = require("./utils.js");

/**
 * Find the project root by walking up from cwd looking for .claude/ directory.
 */
function findProjectRoot() {
  let current = process.cwd();
  while (current !== path.parse(current).root) {
    if (fs.existsSync(path.join(current, ".claude"))) {
      return current;
    }
    current = path.dirname(current);
  }
  return process.cwd();
}

/**
 * Run a single query and return whether the skill was triggered.
 * Creates a command file in .claude/commands/ so it appears in Claude's
 * available_skills list, then runs `claude -p` with the raw query.
 */
function runSingleQuery(query, skillName, skillDescription, timeout, projectRoot, model) {
  return new Promise((resolve, reject) => {
    const uniqueId = Math.random().toString(36).slice(2, 10);
    const cleanName = `${skillName}-skill-${uniqueId}`;
    const projectCommandsDir = path.join(projectRoot, ".claude", "commands");
    const commandFile = path.join(projectCommandsDir, `${cleanName}.md`);

    let triggered = false;
    const startTime = Date.now();
    let buffer = "";
    let pendingToolName = null;
    let accumulatedJson = "";
    let cleanedUp = false;

    function cleanup() {
      if (!cleanedUp) {
        cleanedUp = true;
        try {
          if (fs.existsSync(commandFile)) fs.unlinkSync(commandFile);
        } catch {}
      }
    }

    try {
      fs.mkdirSync(projectCommandsDir, { recursive: true });
      const indentedDesc = skillDescription.split("\n").join("\n  ");
      const commandContent = `---
description: |
  ${indentedDesc}
---

# ${skillName}

This skill handles: ${skillDescription}
`;
      fs.writeFileSync(commandFile, commandContent);
    } catch (e) {
      cleanup();
      reject(e);
      return;
    }

    const cmd = ["-p", query, "--output-format", "stream-json", "--verbose", "--include-partial-messages"];
    if (model) {
      cmd.push("--model", model);
    }

    // Remove CLAUDECODE env var to allow nesting claude -p inside Claude Code
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const proc = spawn("claude", cmd, {
      cwd: projectRoot,
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdoutClosed = false;
    let stderrData = "";

    proc.stdout.on("data", (chunk) => {
      buffer += chunk.toString("utf-8");

      // Process lines from buffer
      let nlIndex;
      while ((nlIndex = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, nlIndex).trim();
        buffer = buffer.slice(nlIndex + 1);
        if (!line) continue;

        try {
          const event = JSON.parse(line);

          // Early detection via stream events
          if (event.type === "stream_event") {
            const se = event.event || {};
            const seType = se.type || "";

            if (seType === "content_block_start") {
              const cb = se.content_block || {};
              if (cb.type === "tool_use") {
                const toolName = cb.name || "";
                if (toolName === "Skill" || toolName === "Read") {
                  pendingToolName = toolName;
                  accumulatedJson = "";
                } else {
                  cleanup();
                  resolve(false);
                  return;
                }
              }
            } else if (seType === "content_block_delta" && pendingToolName) {
              const delta = se.delta || {};
              if (delta.type === "input_json_delta") {
                accumulatedJson += delta.partial_json || "";
                if (accumulatedJson.includes(cleanName)) {
                  triggered = true;
                  cleanup();
                  resolve(true);
                  return;
                }
              }
            } else if (seType === "content_block_stop" || seType === "message_stop") {
              if (pendingToolName) {
                const result = accumulatedJson.includes(cleanName);
                cleanup();
                resolve(result);
                return;
              }
              if (seType === "message_stop") {
                cleanup();
                resolve(false);
                return;
              }
            }
          } else if (event.type === "assistant") {
            const message = event.message || {};
            for (const contentItem of message.content || []) {
              if (contentItem.type !== "tool_use") continue;
              const toolName = contentItem.name || "";
              const toolInput = contentItem.input || {};
              if (toolName === "Skill" && (toolInput.skill || "").includes(cleanName)) {
                triggered = true;
              } else if (toolName === "Read" && (toolInput.file_path || "").includes(cleanName)) {
                triggered = true;
              }
              cleanup();
              resolve(triggered);
              return;
            }
          } else if (event.type === "result") {
            cleanup();
            resolve(triggered);
            return;
          }
        } catch (e) {
          // JSON parse error, skip this line
        }
      }
    });

    proc.stderr.on("data", (chunk) => {
      stderrData += chunk.toString("utf-8");
    });

    proc.stdout.on("end", () => {
      stdoutClosed = true;
    });

    proc.on("close", (code) => {
      cleanup();
      resolve(triggered);
    });

    proc.on("error", (err) => {
      cleanup();
      reject(err);
    });

    // Timeout handling
    setTimeout(() => {
      if (!cleanedUp) {
        proc.kill();
        cleanup();
        resolve(triggered);
      }
    }, timeout * 1000);
  });
}

/**
 * Run the full eval set with configurable concurrency.
 */
async function runEval({
  evalSet,
  skillName,
  description,
  numWorkers = 10,
  timeout = 30,
  projectRoot,
  runsPerQuery = 1,
  triggerThreshold = 0.5,
  model = null,
}) {
  // Build all tasks
  const tasks = [];
  for (const item of evalSet) {
    for (let runIdx = 0; runIdx < runsPerQuery; runIdx++) {
      tasks.push({ query: item.query, should_trigger: item.should_trigger, runIdx });
    }
  }

  // Process with concurrency control
  const results = [];
  const running = [];
  let nextTask = 0;

  async function processTask() {
    while (nextTask < tasks.length) {
      const task = tasks[nextTask++];
      try {
        const triggered = await runSingleQuery(
          task.query, skillName, description, timeout, projectRoot, model
        );
        results.push({ ...task, triggered });
      } catch (err) {
        console.error(`Warning: query failed: ${err.message}`);
        results.push({ ...task, triggered: false });
      }
    }
  }

  // Launch workers
  const workers = [];
  for (let i = 0; i < Math.min(numWorkers, tasks.length); i++) {
    workers.push(processTask());
  }
  await Promise.all(workers);

  // Aggregate by query
  const queryTriggers = {};
  const queryItems = {};
  for (const r of results) {
    if (!queryTriggers[r.query]) queryTriggers[r.query] = [];
    queryTriggers[r.query].push(r.triggered);
    queryItems[r.query] = { should_trigger: r.should_trigger };
  }

  const outputResults = [];
  for (const [query, triggers] of Object.entries(queryTriggers)) {
    const item = queryItems[query];
    const triggerRate = triggers.filter(Boolean).length / triggers.length;
    const shouldTrigger = item.should_trigger;
    const didPass = shouldTrigger
      ? triggerRate >= triggerThreshold
      : triggerRate < triggerThreshold;

    outputResults.push({
      query,
      should_trigger: shouldTrigger,
      trigger_rate: triggerRate,
      triggers: triggers.filter(Boolean).length,
      runs: triggers.length,
      pass: didPass,
    });
  }

  const passed = outputResults.filter((r) => r.pass).length;
  const total = outputResults.length;

  return {
    skill_name: skillName,
    description,
    results: outputResults,
    summary: {
      total,
      passed,
      failed: total - passed,
    },
  };
}

async function main() {
  const args = process.argv.slice(2);
  let evalSetPath = "";
  let skillPath = "";
  let descriptionOverride = null;
  let numWorkers = 10;
  let timeout = 30;
  let runsPerQuery = 3;
  let triggerThreshold = 0.5;
  let model = null;
  let verbose = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--eval-set" && i + 1 < args.length) evalSetPath = args[++i];
    else if (args[i] === "--skill-path" && i + 1 < args.length) skillPath = args[++i];
    else if (args[i] === "--description" && i + 1 < args.length) descriptionOverride = args[++i];
    else if (args[i] === "--num-workers" && i + 1 < args.length) numWorkers = parseInt(args[++i], 10);
    else if (args[i] === "--timeout" && i + 1 < args.length) timeout = parseInt(args[++i], 10);
    else if (args[i] === "--runs-per-query" && i + 1 < args.length) runsPerQuery = parseInt(args[++i], 10);
    else if (args[i] === "--trigger-threshold" && i + 1 < args.length) triggerThreshold = parseFloat(args[++i]);
    else if (args[i] === "--model" && i + 1 < args.length) model = args[++i];
    else if (args[i] === "--verbose") verbose = true;
  }

  if (!evalSetPath || !skillPath) {
    console.error("Usage: node run_eval.js --eval-set <path> --skill-path <path> [options]");
    console.error("  --eval-set           Path to eval set JSON file");
    console.error("  --skill-path         Path to skill directory");
    console.error("  --description        Override description to test");
    console.error("  --num-workers        Number of parallel workers (default: 10)");
    console.error("  --timeout            Timeout per query in seconds (default: 30)");
    console.error("  --runs-per-query     Number of runs per query (default: 3)");
    console.error("  --trigger-threshold  Trigger rate threshold (default: 0.5)");
    console.error("  --model              Model to use for claude -p");
    console.error("  --verbose            Print progress to stderr");
    process.exit(1);
  }

  const evalSet = JSON.parse(fs.readFileSync(evalSetPath, "utf-8"));
  const skillDir = path.resolve(skillPath);

  const skillMdPath = path.join(skillDir, "SKILL.md");
  if (!fs.existsSync(skillMdPath)) {
    console.error(`Error: No SKILL.md found at ${skillDir}`);
    process.exit(1);
  }

  const { name, description } = parseSkillMd(skillDir);
  const activeDescription = descriptionOverride || description;
  const projectRoot = findProjectRoot();

  if (verbose) {
    console.error(`Evaluating: ${activeDescription}`);
  }

  const output = await runEval({
    evalSet,
    skillName: name,
    description: activeDescription,
    numWorkers,
    timeout,
    projectRoot,
    runsPerQuery,
    triggerThreshold,
    model,
  });

  if (verbose && output.summary) {
    console.error(`Results: ${output.summary.passed}/${output.summary.total} passed`);
    for (const r of output.results) {
      const status = r.pass ? "PASS" : "FAIL";
      const rateStr = `${r.triggers}/${r.runs}`;
      console.error(`  [${status}] rate=${rateStr} expected=${r.should_trigger}: ${r.query.slice(0, 70)}`);
    }
  }

  console.log(JSON.stringify(output, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { runEval, findProjectRoot, runSingleQuery };
