#!/usr/bin/env node
/**
 * Run the eval + improve loop until all pass or max iterations reached.
 *
 * Combines run_eval.js and improve_description.js in a loop, tracking history
 * and returning the best description found. Supports train/test split to prevent
 * overfitting.
 *
 * Usage:
 *   node run_loop.js --eval-set <eval-set.json> --skill-path <path> [options]
 */

const fs = require("fs");
const path = require("path");
const { runEval, findProjectRoot } = require("./run_eval.js");
const { improveDescription } = require("./improve_description.js");
const { parseSkillMd } = require("./utils.js");
const { generateHtml } = require("./generate_report.js");

/**
 * Split eval set into train and test sets, stratified by should_trigger.
 */
function splitEvalSet(evalSet, holdout, seed = 42) {
  // Simple seeded random
  const seededRandom = (s) => {
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  };
  const rand = seededRandom(seed);

  const trigger = evalSet.filter((e) => e.should_trigger);
  const noTrigger = evalSet.filter((e) => !e.should_trigger);

  // Shuffle with Fisher-Yates
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  shuffle(trigger);
  shuffle(noTrigger);

  const nTriggerTest = Math.max(1, Math.round(trigger.length * holdout));
  const nNoTriggerTest = Math.max(1, Math.round(noTrigger.length * holdout));

  const testSet = [...trigger.slice(0, nTriggerTest), ...noTrigger.slice(0, nNoTriggerTest)];
  const trainSet = [...trigger.slice(nTriggerTest), ...noTrigger.slice(nNoTriggerTest)];

  return { trainSet, testSet };
}

/**
 * Run the eval + improvement loop.
 */
async function runLoop({
  evalSet,
  skillPath,
  descriptionOverride,
  numWorkers = 10,
  timeout = 30,
  maxIterations = 5,
  runsPerQuery = 3,
  triggerThreshold = 0.5,
  holdout = 0.4,
  model = null,
  verbose = false,
  liveReportPath = null,
  logDir = null,
}) {
  const projectRoot = findProjectRoot();
  const { name, description: desc, fullContent } = parseSkillMd(skillPath);
  let currentDescription = descriptionOverride || desc;

  // Split into train/test if holdout > 0
  let trainSet, testSet;
  if (holdout > 0) {
    const split = splitEvalSet(evalSet, holdout);
    trainSet = split.trainSet;
    testSet = split.testSet;
    if (verbose) {
      console.error(`Split: ${trainSet.length} train, ${testSet.length} test (holdout=${holdout})`);
    }
  } else {
    trainSet = evalSet;
    testSet = [];
  }

  const history = [];
  let exitReason = "unknown";

  for (let iteration = 1; iteration <= maxIterations; iteration++) {
    if (verbose) {
      console.error("\n" + "=".repeat(60));
      console.error(`Iteration ${iteration}/${maxIterations}`);
      console.error(`Description: ${currentDescription}`);
      console.error("=".repeat(60));
    }

    // Evaluate all queries together for parallelism
    const allQueries = [...trainSet, ...testSet];
    const t0 = Date.now();

    let allResults;
    try {
      allResults = await runEval({
        evalSet: allQueries,
        skillName: name,
        description: currentDescription,
        numWorkers,
        timeout,
        projectRoot,
        runsPerQuery,
        triggerThreshold,
        model,
      });
    } catch (err) {
      console.error(`Error in runEval: ${err.message}`);
      exitReason = `eval_error (iteration ${iteration})`;
      break;
    }

    const evalElapsed = (Date.now() - t0) / 1000;

    // Split results back into train/test by matching queries
    const trainQueriesSet = new Set(trainSet.map((q) => q.query));
    const trainResultList = allResults.results.filter((r) => trainQueriesSet.has(r.query));
    const testResultList = allResults.results.filter((r) => !trainQueriesSet.has(r.query));

    const trainPassed = trainResultList.filter((r) => r.pass).length;
    const trainTotal = trainResultList.length;
    const trainSummary = { passed: trainPassed, failed: trainTotal - trainPassed, total: trainTotal };
    const trainResults = { results: trainResultList, summary: trainSummary };

    let testResults = null;
    let testSummary = null;
    if (testSet.length > 0) {
      const testPassed = testResultList.filter((r) => r.pass).length;
      const testTotal = testResultList.length;
      testSummary = { passed: testPassed, failed: testTotal - testPassed, total: testTotal };
      testResults = { results: testResultList, summary: testSummary };
    }

    const historyEntry = {
      iteration,
      description: currentDescription,
      train_passed: trainSummary.passed,
      train_failed: trainSummary.failed,
      train_total: trainSummary.total,
      train_results: trainResults.results,
      test_passed: testSummary ? testSummary.passed : null,
      test_failed: testSummary ? testSummary.failed : null,
      test_total: testSummary ? testSummary.total : null,
      test_results: testResults ? testResults.results : null,
      // Backward compat
      passed: trainSummary.passed,
      failed: trainSummary.failed,
      total: trainSummary.total,
      results: trainResults.results,
    };
    history.push(historyEntry);

    // Write live report if path provided
    if (liveReportPath) {
      const partialOutput = {
        original_description: desc,
        best_description: currentDescription,
        best_score: "in progress",
        iterations_run: history.length,
        holdout,
        train_size: trainSet.length,
        test_size: testSet.length,
        history,
      };
      fs.writeFileSync(liveReportPath, generateHtml(partialOutput, true, name));
    }

    if (verbose) {
      console.error(`Train: ${trainSummary.passed}/${trainSummary.total} correct (${evalElapsed.toFixed(1)}s)`);
      for (const r of trainResultList) {
        const status = r.pass ? "PASS" : "FAIL";
        console.error(`  [${status}] rate=${r.triggers}/${r.runs} expected=${r.should_trigger}: ${r.query.slice(0, 60)}`);
      }
      if (testSummary) {
        console.error(`Test: ${testSummary.passed}/${testSummary.total} correct`);
        for (const r of testResultList) {
          const status = r.pass ? "PASS" : "FAIL";
          console.error(`  [${status}] rate=${r.triggers}/${r.runs} expected=${r.should_trigger}: ${r.query.slice(0, 60)}`);
        }
      }
    }

    // Check if all passed
    if (trainSummary.failed === 0) {
      exitReason = `all_passed (iteration ${iteration})`;
      if (verbose) console.error(`\nAll train queries passed on iteration ${iteration}!`);
      break;
    }

    if (iteration === maxIterations) {
      exitReason = `max_iterations (${maxIterations})`;
      if (verbose) console.error(`\nMax iterations reached (${maxIterations}).`);
      break;
    }

    // Improve the description based on train results
    if (verbose) console.error(`\nImproving description...`);
    const t1 = Date.now();

    // Strip test scores from history so improvement model can't see them
    const blindedHistory = history.map((h) => {
      const hCopy = { ...h };
      delete hCopy.test_passed;
      delete hCopy.test_failed;
      delete hCopy.test_total;
      delete hCopy.test_results;
      return hCopy;
    });

    try {
      currentDescription = improveDescription({
        skillName: name,
        skillContent: fullContent,
        currentDescription,
        evalResults: trainResults,
        history: blindedHistory,
        model,
        logDir,
        iteration,
      });
    } catch (err) {
      console.error(`Error in improveDescription: ${err.message}`);
      exitReason = `improve_error (iteration ${iteration})`;
      break;
    }

    const improveElapsed = (Date.now() - t1) / 1000;
    if (verbose) console.error(`Proposed (${improveElapsed.toFixed(1)}s): ${currentDescription}`);
  }

  // Find the best iteration by TEST score (or train if no test set)
  let best;
  let bestScore;
  if (testSet.length > 0) {
    best = history.reduce((a, b) => ((a.test_passed || 0) > (b.test_passed || 0) ? a : b));
    bestScore = `${best.test_passed}/${best.test_total}`;
  } else {
    best = history.reduce((a, b) => (a.train_passed > b.train_passed ? a : b));
    bestScore = `${best.train_passed}/${best.train_total}`;
  }

  if (verbose) {
    console.error(`\nExit reason: ${exitReason}`);
    console.error(`Best score: ${bestScore} (iteration ${best.iteration})`);
  }

  return {
    exit_reason: exitReason,
    original_description: desc,
    best_description: best.description,
    best_score: bestScore,
    best_train_score: `${best.train_passed}/${best.train_total}`,
    best_test_score: testSet.length > 0 ? `${best.test_passed}/${best.test_total}` : null,
    final_description: currentDescription,
    iterations_run: history.length,
    holdout,
    train_size: trainSet.length,
    test_size: testSet.length,
    history,
  };
}

async function main() {
  const args = process.argv.slice(2);
  let evalSetPath = "";
  let skillPath = "";
  let descriptionOverride = null;
  let numWorkers = 10;
  let timeout = 30;
  let maxIterations = 5;
  let runsPerQuery = 3;
  let triggerThreshold = 0.5;
  let holdout = 0.4;
  let model = "";
  let verbose = false;
  let report = "auto";
  let resultsDir = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--eval-set" && i + 1 < args.length) evalSetPath = args[++i];
    else if (args[i] === "--skill-path" && i + 1 < args.length) skillPath = args[++i];
    else if (args[i] === "--description" && i + 1 < args.length) descriptionOverride = args[++i];
    else if (args[i] === "--num-workers" && i + 1 < args.length) numWorkers = parseInt(args[++i], 10);
    else if (args[i] === "--timeout" && i + 1 < args.length) timeout = parseInt(args[++i], 10);
    else if (args[i] === "--max-iterations" && i + 1 < args.length) maxIterations = parseInt(args[++i], 10);
    else if (args[i] === "--runs-per-query" && i + 1 < args.length) runsPerQuery = parseInt(args[++i], 10);
    else if (args[i] === "--trigger-threshold" && i + 1 < args.length) triggerThreshold = parseFloat(args[++i]);
    else if (args[i] === "--holdout" && i + 1 < args.length) holdout = parseFloat(args[++i]);
    else if (args[i] === "--model" && i + 1 < args.length) model = args[++i];
    else if (args[i] === "--verbose") verbose = true;
    else if (args[i] === "--report" && i + 1 < args.length) report = args[++i];
    else if (args[i] === "--results-dir" && i + 1 < args.length) resultsDir = args[++i];
  }

  if (!evalSetPath || !skillPath) {
    console.error("Usage: node run_loop.js --eval-set <path> --skill-path <path> [options]");
    console.error("  --eval-set           Path to eval set JSON file");
    console.error("  --skill-path         Path to skill directory");
    console.error("  --description        Override starting description");
    console.error("  --num-workers        Number of parallel workers (default: 10)");
    console.error("  --timeout            Timeout per query in seconds (default: 30)");
    console.error("  --max-iterations     Max improvement iterations (default: 5)");
    console.error("  --runs-per-query     Number of runs per query (default: 3)");
    console.error("  --trigger-threshold  Trigger rate threshold (default: 0.5)");
    console.error("  --holdout            Fraction to hold out for testing (default: 0.4)");
    console.error("  --model              Model for improvement (required)");
    console.error("  --verbose            Print progress to stderr");
    console.error("  --report             HTML report path (default: auto temp file)");
    console.error("  --results-dir        Save all outputs to timestamped subdirectory");
    process.exit(1);
  }

  if (!model) {
    console.error("Error: --model is required");
    process.exit(1);
  }

  const evalSet = JSON.parse(fs.readFileSync(evalSetPath, "utf-8"));
  const skillDir = path.resolve(skillPath);

  if (!fs.existsSync(path.join(skillDir, "SKILL.md"))) {
    console.error(`Error: No SKILL.md found at ${skillDir}`);
    process.exit(1);
  }

  const { name } = parseSkillMd(skillDir);

  // Set up live report path
  let liveReportPath = null;
  if (report !== "none") {
    if (report === "auto") {
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      liveReportPath = path.join(
        require("os").tmpdir(),
        `skill_description_report_${path.basename(skillDir)}_${timestamp}.html`
      );
    } else {
      liveReportPath = path.resolve(report);
    }
    // Write initial placeholder
    fs.writeFileSync(liveReportPath,
      "<html><body><h1>Starting optimization loop...</h1><meta http-equiv='refresh' content='5'></body></html>"
    );
    // Try to open in browser
    try {
      require("child_process").execSync(`start "" "${liveReportPath}"`, { timeout: 3000 });
    } catch {}
  }

  // Determine output directory
  let outDir = null;
  if (resultsDir) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    outDir = path.resolve(resultsDir, timestamp);
    fs.mkdirSync(outDir, { recursive: true });
  }

  const logDir = outDir ? path.join(outDir, "logs") : null;

  const output = await runLoop({
    evalSet,
    skillPath: skillDir,
    descriptionOverride: descriptionOverride || undefined,
    numWorkers,
    timeout,
    maxIterations,
    runsPerQuery,
    triggerThreshold,
    holdout,
    model,
    verbose,
    liveReportPath,
    logDir,
  });

  // Output JSON
  const jsonOutput = JSON.stringify(output, null, 2);
  console.log(jsonOutput);

  if (outDir) {
    fs.writeFileSync(path.join(outDir, "results.json"), jsonOutput);
  }

  // Write final HTML report
  if (liveReportPath) {
    fs.writeFileSync(liveReportPath, generateHtml(output, false, name));
    console.error(`\nReport: ${liveReportPath}`);
  }

  if (outDir && liveReportPath) {
    fs.writeFileSync(path.join(outDir, "report.html"), generateHtml(output, false, name));
  }

  if (outDir) {
    console.error(`Results saved to: ${outDir}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = { runLoop, splitEvalSet };
