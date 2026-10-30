#!/usr/bin/env node
/**
 * Aggregate individual run results into benchmark summary statistics.
 *
 * Reads grading.json files from run directories and produces:
 * - run_summary with mean, stddev, min, max for each metric
 * - delta between configurations (e.g. with_skill vs without_skill)
 *
 * Usage:
 *   node aggregate_benchmark.js <benchmark_dir> [--skill-name <name>] [--skill-path <path>] [--output <path>]
 *
 * Supports two directory layouts:
 *   Workspace: <benchmark_dir>/eval-N/{with_skill,without_skill}/run-N/grading.json
 *   Legacy:    <benchmark_dir>/runs/eval-N/{with_skill,without_skill}/run-N/grading.json
 */

const fs = require("fs");
const path = require("path");

function calculateStats(values) {
  if (!values || values.length === 0) {
    return { mean: 0, stddev: 0, min: 0, max: 0 };
  }

  const n = values.length;
  const mean = values.reduce((a, b) => a + b, 0) / n;

  let stddev = 0;
  if (n > 1) {
    const variance = values.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (n - 1);
    stddev = Math.sqrt(variance);
  }

  return {
    mean: Math.round(mean * 10000) / 10000,
    stddev: Math.round(stddev * 10000) / 10000,
    min: Math.round(Math.min(...values) * 10000) / 10000,
    max: Math.round(Math.max(...values) * 10000) / 10000,
  };
}

function loadRunResults(benchmarkDir) {
  const runsDir = path.join(benchmarkDir, "runs");
  let searchDir = fs.existsSync(runsDir) ? runsDir : benchmarkDir;

  const evalDirs = fs.readdirSync(searchDir)
    .filter((name) => name.startsWith("eval-"))
    .sort();

  if (evalDirs.length === 0) {
    console.error(`No eval directories found in ${searchDir}`);
    return {};
  }

  /** @type {Record<string, Array>} */
  const results = {};

  for (const evalName of evalDirs) {
    const evalDir = path.join(searchDir, evalName);

    // Try to get eval_id from metadata
    const metadataPath = path.join(evalDir, "eval_metadata.json");
    let evalId = parseInt(evalName.split("-")[1], 10);
    if (fs.existsSync(metadataPath)) {
      try {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
        if (metadata.eval_id !== undefined) evalId = metadata.eval_id;
      } catch {}
    }

    // Discover config directories
    const configDirs = fs.readdirSync(evalDir)
      .filter((name) => {
        const full = path.join(evalDir, name);
        return fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, "run-1"));
      })
      .sort();

    for (const config of configDirs) {
      if (!results[config]) results[config] = [];
      const configDir = path.join(evalDir, config);

      const runDirs = fs.readdirSync(configDir)
        .filter((name) => name.startsWith("run-"))
        .sort();

      for (const runName of runDirs) {
        const runDir = path.join(configDir, runName);
        const gradingFile = path.join(runDir, "grading.json");

        if (!fs.existsSync(gradingFile)) {
          console.error(`Warning: grading.json not found in ${runDir}`);
          continue;
        }

        let grading;
        try {
          grading = JSON.parse(fs.readFileSync(gradingFile, "utf-8"));
        } catch (e) {
          console.error(`Warning: Invalid JSON in ${gradingFile}: ${e.message}`);
          continue;
        }

        const runNumber = parseInt(runName.split("-")[1], 10);
        const result = {
          eval_id: evalId,
          run_number: runNumber,
          pass_rate: grading.summary?.pass_rate ?? 0,
          passed: grading.summary?.passed ?? 0,
          failed: grading.summary?.failed ?? 0,
          total: grading.summary?.total ?? 0,
          time_seconds: grading.timing?.total_duration_seconds ?? 0,
          tokens: grading.timing?.total_tokens ?? 0,
          tool_calls: grading.execution_metrics?.total_tool_calls ?? 0,
          errors: grading.execution_metrics?.errors_encountered ?? 0,
        };

        // Try timing.json as fallback
        if (!result.time_seconds && !result.tokens) {
          const timingFile = path.join(runDir, "timing.json");
          if (fs.existsSync(timingFile)) {
            try {
              const timing = JSON.parse(fs.readFileSync(timingFile, "utf-8"));
              result.time_seconds = timing.total_duration_seconds ?? 0;
              result.tokens = timing.total_tokens ?? 0;
            } catch {}
          }
        }

        // Extract expectations
        const expectations = grading.expectations || [];
        for (const exp of expectations) {
          if (!exp.text || exp.passed === undefined) {
            console.error(`Warning: expectation in ${gradingFile} missing required fields`);
          }
        }
        result.expectations = expectations;

        // Extract notes
        const notesSummary = grading.user_notes_summary || {};
        result.notes = [
          ...(notesSummary.uncertainties || []),
          ...(notesSummary.needs_review || []),
          ...(notesSummary.workarounds || []),
        ];

        results[config].push(result);
      }
    }
  }

  return results;
}

function aggregateResults(results) {
  const runSummary = {};
  const configs = Object.keys(results);

  for (const config of configs) {
    const runs = results[config] || [];

    if (runs.length === 0) {
      runSummary[config] = {
        pass_rate: { mean: 0, stddev: 0, min: 0, max: 0 },
        time_seconds: { mean: 0, stddev: 0, min: 0, max: 0 },
        tokens: { mean: 0, stddev: 0, min: 0, max: 0 },
      };
      continue;
    }

    runSummary[config] = {
      pass_rate: calculateStats(runs.map((r) => r.pass_rate)),
      time_seconds: calculateStats(runs.map((r) => r.time_seconds)),
      tokens: calculateStats(runs.map((r) => r.tokens)),
    };
  }

  // Calculate delta between first two configs
  if (configs.length >= 2) {
    const primary = runSummary[configs[0]] || {};
    const baseline = runSummary[configs[1]] || {};
    runSummary.delta = {
      pass_rate: ((primary.pass_rate?.mean ?? 0) - (baseline.pass_rate?.mean ?? 0)).toFixed(2),
      time_seconds: ((primary.time_seconds?.mean ?? 0) - (baseline.time_seconds?.mean ?? 0)).toFixed(1),
      tokens: ((primary.tokens?.mean ?? 0) - (baseline.tokens?.mean ?? 0)).toFixed(0),
    };
    // Add + prefix for positive values
    for (const key of ["pass_rate", "time_seconds", "tokens"]) {
      const val = parseFloat(runSummary.delta[key]);
      if (val > 0) runSummary.delta[key] = "+" + runSummary.delta[key];
    }
  } else {
    runSummary.delta = { pass_rate: "—", time_seconds: "—", tokens: "—" };
  }

  return runSummary;
}

function generateBenchmark(benchmarkDir, skillName, skillPath) {
  const results = loadRunResults(benchmarkDir);
  const runSummary = aggregateResults(results);

  // Build runs array
  const runs = [];
  for (const config of Object.keys(results)) {
    for (const result of results[config]) {
      runs.push({
        eval_id: result.eval_id,
        configuration: config,
        run_number: result.run_number,
        result: {
          pass_rate: result.pass_rate,
          passed: result.passed,
          failed: result.failed,
          total: result.total,
          time_seconds: result.time_seconds,
          tokens: result.tokens,
          tool_calls: result.tool_calls,
          errors: result.errors,
        },
        expectations: result.expectations,
        notes: result.notes,
      });
    }
  }

  // Determine eval IDs
  const evalIds = [...new Set(
    Object.values(results).flat().map((r) => r.eval_id)
  )].sort();

  const benchmark = {
    metadata: {
      skill_name: skillName || "<skill-name>",
      skill_path: skillPath || "<path/to/skill>",
      executor_model: "<model-name>",
      analyzer_model: "<model-name>",
      timestamp: new Date().toISOString(),
      evals_run: evalIds,
      runs_per_configuration: 3,
    },
    runs,
    run_summary: runSummary,
    notes: [],
  };

  return benchmark;
}

function generateMarkdown(benchmark) {
  const metadata = benchmark.metadata;
  const runSummary = benchmark.run_summary;
  const configs = Object.keys(runSummary).filter((k) => k !== "delta");
  const configA = configs[0] || "config_a";
  const configB = configs[1] || "config_b";
  const labelA = configA.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const labelB = configB.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  let md = `# Skill Benchmark: ${metadata.skill_name}\n\n`;
  md += `**Model**: ${metadata.executor_model}\n`;
  md += `**Date**: ${metadata.timestamp}\n`;
  md += `**Evals**: ${metadata.evals_run.join(", ")} (${metadata.runs_per_configuration} runs each per configuration)\n\n`;
  md += `## Summary\n\n`;
  md += `| Metric | ${labelA} | ${labelB} | Delta |\n`;
  md += `|--------|------------|---------------|-------|\n`;

  const aSum = runSummary[configA] || {};
  const bSum = runSummary[configB] || {};
  const delta = runSummary.delta || {};

  // Pass rate
  const aPr = aSum.pass_rate || {};
  const bPr = bSum.pass_rate || {};
  md += `| Pass Rate | ${(aPr.mean || 0) * 100}% ± ${(aPr.stddev || 0) * 100}% | ${(bPr.mean || 0) * 100}% ± ${(bPr.stddev || 0) * 100}% | ${delta.pass_rate || "—"} |\n`;

  // Time
  const aTime = aSum.time_seconds || {};
  const bTime = bSum.time_seconds || {};
  md += `| Time | ${(aTime.mean || 0).toFixed(1)}s ± ${(aTime.stddev || 0).toFixed(1)}s | ${(bTime.mean || 0).toFixed(1)}s ± ${(bTime.stddev || 0).toFixed(1)}s | ${delta.time_seconds || "—"}s |\n`;

  // Tokens
  const aTokens = aSum.tokens || {};
  const bTokens = bSum.tokens || {};
  md += `| Tokens | ${(aTokens.mean || 0).toFixed(0)} ± ${(aTokens.stddev || 0).toFixed(0)} | ${(bTokens.mean || 0).toFixed(0)} ± ${(bTokens.stddev || 0).toFixed(0)} | ${delta.tokens || "—"} |\n`;

  if (benchmark.notes && benchmark.notes.length > 0) {
    md += `\n## Notes\n\n`;
    for (const note of benchmark.notes) {
      md += `- ${note}\n`;
    }
  }

  return md;
}

function main() {
  const args = process.argv.slice(2);
  let benchmarkDir = "";
  let skillName = "";
  let skillPath = "";
  let outputPath = "";

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--skill-name" && i + 1 < args.length) {
      skillName = args[++i];
    } else if (args[i] === "--skill-path" && i + 1 < args.length) {
      skillPath = args[++i];
    } else if ((args[i] === "--output" || args[i] === "-o") && i + 1 < args.length) {
      outputPath = args[++i];
    } else if (!benchmarkDir) {
      benchmarkDir = args[i];
    }
  }

  if (!benchmarkDir) {
    console.error("Usage: node aggregate_benchmark.js <benchmark_dir> [--skill-name <name>] [--skill-path <path>] [--output <path>]");
    process.exit(1);
  }

  if (!fs.existsSync(benchmarkDir)) {
    console.error(`Directory not found: ${benchmarkDir}`);
    process.exit(1);
  }

  const benchmark = generateBenchmark(benchmarkDir, skillName, skillPath);

  const outputJson = outputPath || path.join(benchmarkDir, "benchmark.json");
  const outputMd = outputJson.replace(/\.json$/, ".md") || path.join(benchmarkDir, "benchmark.md");

  fs.writeFileSync(outputJson, JSON.stringify(benchmark, null, 2));
  console.log(`Generated: ${outputJson}`);

  const markdown = generateMarkdown(benchmark);
  fs.writeFileSync(outputMd, markdown);
  console.log(`Generated: ${outputMd}`);

  // Print summary
  const runSummary = benchmark.run_summary;
  const configs = Object.keys(runSummary).filter((k) => k !== "delta");
  const delta = runSummary.delta || {};
  console.log("\nSummary:");
  for (const config of configs) {
    const pr = runSummary[config].pass_rate.mean;
    const label = config.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    console.log(`  ${label}: ${(pr * 100).toFixed(1)}% pass rate`);
  }
  console.log(`  Delta:         ${delta.pass_rate}`);
}

if (require.main === module) {
  main();
}

module.exports = { generateBenchmark, generateMarkdown, calculateStats, loadRunResults };
