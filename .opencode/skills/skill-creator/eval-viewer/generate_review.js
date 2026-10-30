#!/usr/bin/env node
/**
 * Generate and serve a review page for eval results.
 *
 * Reads the workspace directory, discovers runs (directories with outputs/),
 * embeds all output data into a self-contained HTML page, and serves it via
 * a tiny HTTP server. Feedback auto-saves to feedback.json in the workspace.
 *
 * Usage:
 *   node generate_review.js <workspace-path> [--port PORT] [--skill-name NAME]
 *   node generate_review.js <workspace-path> --static <output.html>
 *
 * No dependencies beyond the Node.js stdlib are required.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");
const { execSync } = require("child_process");

// Files to exclude from output listings
const METADATA_FILES = new Set(["transcript.md", "user_notes.md", "metrics.json"]);

// Extensions we render as inline text
const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".json", ".csv", ".py", ".js", ".ts", ".tsx", ".jsx",
  ".yaml", ".yml", ".xml", ".html", ".css", ".sh", ".rb", ".go", ".rs",
  ".java", ".c", ".cpp", ".h", ".hpp", ".sql", ".r", ".toml",
]);

// Extensions we render as inline images
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]);

// MIME type overrides
const MIME_OVERRIDES = {
  ".svg": "image/svg+xml",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (MIME_OVERRIDES[ext]) return MIME_OVERRIDES[ext];
  const mimeTypes = {
    ".html": "text/html", ".css": "text/css", ".js": "application/javascript",
    ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".gif": "image/gif", ".svg": "image/svg+xml",
    ".webp": "image/webp", ".txt": "text/plain", ".md": "text/markdown",
    ".csv": "text/csv", ".xml": "application/xml", ".pdf": "application/pdf",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

function findRuns(workspace) {
  const runs = [];
  findRunsRecursive(workspace, workspace, runs);
  runs.sort((a, b) => (a.eval_id || Infinity) - (b.eval_id || Infinity) || a.id.localeCompare(b.id));
  return runs;
}

function findRunsRecursive(root, current, runs) {
  if (!fs.statSync(current).isDirectory()) return;

  const outputsDir = path.join(current, "outputs");
  if (fs.existsSync(outputsDir) && fs.statSync(outputsDir).isDirectory()) {
    const run = buildRun(root, current);
    if (run) runs.push(run);
    return;
  }

  const skip = new Set(["node_modules", ".git", "__pycache__", "skill", "inputs"]);
  try {
    for (const child of fs.readdirSync(current)) {
      if (skip.has(child)) continue;
      const childPath = path.join(current, child);
      if (fs.statSync(childPath).isDirectory()) {
        findRunsRecursive(root, childPath, runs);
      }
    }
  } catch {}
}

function buildRun(root, runDir) {
  const outputsDir = path.join(runDir, "outputs");
  if (!fs.existsSync(outputsDir)) return null;

  const relativePath = path.relative(root, runDir);
  const parts = relativePath.split(/[\\/]/);

  let evalId, configName, runName;
  if (parts.length >= 3 && parts[parts.length - 3] !== ".") {
    evalId = parts[parts.length - 3];
    configName = parts[parts.length - 2];
    runName = parts[parts.length - 1];
  } else {
    evalId = "eval";
    configName = "config";
    runName = path.basename(runDir);
  }

  // Determine display name
  const evalName = path.basename(runDir);
  const displayName = path.basename(runDir);

  // Build unique ID
  const id = `${evalId}-${configName}-${runName}`;

  // Read outputs
  const outputFiles = [];
  try {
    for (const file of fs.readdirSync(outputsDir)) {
      if (METADATA_FILES.has(file)) continue;
      const filePath = path.join(outputsDir, file);
      if (!fs.statSync(filePath).isFile()) continue;
      outputFiles.push({
        name: file,
        path: path.relative(root, filePath),
        mime: getMimeType(filePath),
        size: fs.statSync(filePath).size,
      });
    }
  } catch {}

  // Check for grading.json
  let grading = null;
  const gradingFile = path.join(runDir, "grading.json");
  if (fs.existsSync(gradingFile)) {
    try {
      grading = JSON.parse(fs.readFileSync(gradingFile, "utf-8"));
    } catch {}
  }

  // Read eval_metadata
  let evalMetadata = null;
  const evalMetaFile = path.join(path.dirname(runDir), "eval_metadata.json");
  if (fs.existsSync(evalMetaFile)) {
    try {
      evalMetadata = JSON.parse(fs.readFileSync(evalMetaFile, "utf-8"));
    } catch {}
  }

  return {
    id,
    eval_id: evalId,
    config: configName,
    run: runName,
    display_name: displayName,
    path: relativePath,
    output_files: outputFiles,
    grading,
    eval_metadata: evalMetadata,
  };
}

function getFileContent(root, filePath) {
  const fullPath = path.join(root, filePath);
  if (!fs.existsSync(fullPath)) return null;
  const ext = path.extname(fullPath).toLowerCase();

  if (IMAGE_EXTENSIONS.has(ext)) {
    const data = fs.readFileSync(fullPath);
    return { type: "image", data: data.toString("base64"), mime: getMimeType(fullPath) };
  }

  if (TEXT_EXTENSIONS.has(ext)) {
    const data = fs.readFileSync(fullPath, "utf-8");
    return { type: "text", data };
  }

  // Binary file - serve as base64
  const data = fs.readFileSync(fullPath);
  return { type: "binary", data: data.toString("base64"), mime: getMimeType(fullPath) };
}

function generateReviewHtml(workspace, runs, skillName, previousWorkspace) {
  const escapeHtml = (str) =>
    String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const runsJson = escapeHtml(JSON.stringify(runs));
  const previousRunsJson = previousWorkspace
    ? escapeHtml(JSON.stringify(findRuns(previousWorkspace)))
    : "null";

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>${escapeHtml(skillName || "Skill")} — Eval Review</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; color: #333; }
        nav { background: #fff; border-bottom: 1px solid #ddd; padding: 10px 20px; display: flex; gap: 20px; align-items: center; position: sticky; top: 0; z-index: 100; }
        nav h1 { font-size: 16px; font-weight: 600; }
        nav button { padding: 6px 12px; border: 1px solid #ddd; background: #fff; border-radius: 4px; cursor: pointer; }
        nav button:hover { background: #f0f0f0; }
        nav button.active { background: #0066cc; color: #fff; border-color: #0066cc; }
        nav .nav-arrows { margin-left: auto; display: flex; gap: 8px; }
        .tab-content { display: none; padding: 20px; }
        .tab-content.active { display: block; }
        #outputs-tab { max-width: 900px; margin: 0 auto; }
        .eval-selector { margin-bottom: 20px; }
        .eval-selector select { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px; }
        .config-selector { display: flex; gap: 10px; margin-bottom: 16px; }
        .config-selector button { flex: 1; padding: 8px; border: 1px solid #ddd; background: #fff; border-radius: 4px; cursor: pointer; font-weight: 500; }
        .config-selector button.active { background: #0066cc; color: #fff; border-color: #0066cc; }
        .config-selector button:hover:not(.active) { background: #f0f0f0; }
        .prompt-box { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 16px; margin-bottom: 20px; }
        .prompt-box h3 { font-size: 14px; color: #666; margin-bottom: 8px; }
        .prompt-box pre { white-space: pre-wrap; font-size: 13px; line-height: 1.5; }
        .output-files { margin-bottom: 20px; }
        .output-files h3 { font-size: 14px; color: #666; margin-bottom: 8px; }
        .file-card { background: #fff; border: 1px solid #ddd; border-radius: 6px; margin-bottom: 12px; overflow: hidden; }
        .file-header { padding: 10px 16px; background: #fafafa; border-bottom: 1px solid #eee; font-weight: 500; font-size: 13px; cursor: pointer; display: flex; justify-content: space-between; }
        .file-header:hover { background: #f0f0f0; }
        .file-content { padding: 16px; overflow-x: auto; }
        .file-content pre { font-size: 12px; line-height: 1.5; white-space: pre-wrap; max-height: 500px; overflow-y: auto; }
        .file-content img { max-width: 100%; }
        .feedback-box { background: #fff; border: 1px solid #ddd; border-radius: 6px; padding: 16px; margin-top: 20px; }
        .feedback-box h3 { font-size: 14px; color: #666; margin-bottom: 8px; }
        .feedback-box textarea { width: 100%; min-height: 100px; border: 1px solid #ddd; border-radius: 4px; padding: 8px; font-size: 13px; resize: vertical; }
        .feedback-box textarea:focus { outline: none; border-color: #0066cc; }
        .feedback-box .saved { color: #4caf50; font-size: 12px; margin-top: 4px; display: none; }
        .grading-summary { display: flex; gap: 8px; margin-bottom: 12px; }
        .grading-badge { padding: 2px 8px; border-radius: 12px; font-size: 12px; font-weight: 500; }
        .grading-pass { background: #e8f5e9; color: #2e7d32; }
        .grading-fail { background: #fce4ec; color: #c62828; }
        .previous-output { border-left: 3px solid #ff9800; margin-bottom: 12px; }
        .previous-output .file-header { background: #fff8e1; }
        #download-btn { margin-left: auto; background: #4caf50 !important; color: white !important; border-color: #4caf50 !important; }
        .tab-header { display: flex; align-items: center; gap: 12px; }
        .benchmark-summary { margin-bottom: 20px; }
        .benchmark-counts { font-size: 13px; color: #666; margin-bottom: 20px; }
        .benchmark-table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #ddd; border-radius: 6px; overflow: hidden; }
        .benchmark-table th, .benchmark-table td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #eee; font-size: 13px; }
        .benchmark-table th { background: #fafafa; font-weight: 600; color: #666; }
        .benchmark-table tr:hover { background: #fafafa; }
        .benefit { display: flex; gap: 8px; }
        .benefit.better { color: #2e7d32; }
        .benefit.worse { color: #c62828; }
    </style>
</head>
<body>
<nav>
    <h1>${escapeHtml(skillName || "Eval Review")}</h1>
    <button id="outputs-tab-btn" class="active" onclick="switchTab('outputs')">Outputs</button>
    <button id="benchmark-tab-btn" onclick="switchTab('benchmark')">Benchmark</button>
    <div class="tab-header">
        <span id="eval-counter" style="font-size:13px;color:#666;"></span>
    </div>
    <button id="download-btn" onclick="downloadAllFeedback()">⬇ Submit All Reviews</button>
    <div class="nav-arrows">
        <button onclick="prevEval()">←</button>
        <button onclick="nextEval()">→</button>
    </div>
</nav>

<div id="outputs-tab" class="tab-content active">
    <div class="eval-selector">
        <select id="eval-select" onchange="selectEval(this.value)"></select>
    </div>
    <div id="eval-display"></div>
</div>

<div id="benchmark-tab" class="tab-content">
    <div id="benchmark-content">
        <p>Loading benchmark data...</p>
    </div>
</div>

<script>
const RUNS = ${runsJson};
const PREVIOUS_RUNS = ${previousRunsJson};
const WORKSPACE = ${JSON.stringify(workspace)};
const SKILL_NAME = ${JSON.stringify(skillName || "")};

let currentEvalIndex = 0;
let feedback = {};

// Group runs by eval
function groupByEval(runs) {
    const groups = {};
    for (const run of runs) {
        const key = run.eval_id;
        if (!groups[key]) groups[key] = { eval_id: key, configs: {} };
        if (!groups[key].configs[run.config]) groups[key].configs[run.config] = [];
        groups[key].configs[run.config].push(run);
    }
    return Object.values(groups).sort((a, b) => String(a.eval_id).localeCompare(String(b.eval_id)));
}

const evalGroups = groupByEval(RUNS);
const previousEvalGroups = PREVIOUS_RUNS ? groupByEval(PREVIOUS_RUNS) : [];

function populateSelector() {
    const select = document.getElementById('eval-select');
    select.innerHTML = '';
    for (let i = 0; i < evalGroups.length; i++) {
        const g = evalGroups[i];
        const opt = document.createElement('option');
        opt.value = i;
        const configs = Object.keys(g.configs).join('+');
        const runCount = Object.values(g.configs).flat().length;
        opt.textContent = g.eval_id + ' (' + configs + ', ' + runCount + ' runs)';
        select.appendChild(opt);
    }
    updateCounter();
}

function selectEval(index) {
    currentEvalIndex = parseInt(index);
    displayEval(currentEvalIndex);
    updateCounter();
}

function updateCounter() {
    const el = document.getElementById('eval-counter');
    if (evalGroups.length > 0) {
        el.textContent = (currentEvalIndex + 1) + ' / ' + evalGroups.length;
    } else {
        el.textContent = '0 evals';
    }
}

function prevEval() {
    if (currentEvalIndex > 0) {
        currentEvalIndex--;
        document.getElementById('eval-select').value = currentEvalIndex;
        displayEval(currentEvalIndex);
        updateCounter();
    }
}

function nextEval() {
    if (currentEvalIndex < evalGroups.length - 1) {
        currentEvalIndex++;
        document.getElementById('eval-select').value = currentEvalIndex;
        displayEval(currentEvalIndex);
        updateCounter();
    }
}

function displayEval(index) {
    const group = evalGroups[index];
    if (!group) return;

    const configNames = Object.keys(group.configs);
    let html = '';

    // Config selector
    html += '<div class="config-selector">';
    for (const name of configNames) {
        html += '<button class="config-btn" onclick="selectConfig(\\'' + name + '\\')" data-config="' + name + '">' + name.replace(/_/g, ' ') + '</button>';
    }
    html += '</div>';

    // Prompt from eval_metadata
    const firstRun = Object.values(group.configs)[0][0];
    if (firstRun.eval_metadata && firstRun.eval_metadata.prompt) {
        html += '<div class="prompt-box"><h3>Prompt</h3><pre>' + escapeHtml(firstRun.eval_metadata.prompt) + '</pre></div>';
    }

    // Previous output
    if (previousEvalGroups[index]) {
        const prevGroup = previousEvalGroups[index];
        const prevConfigNames = Object.keys(prevGroup.configs);
        for (const name of prevConfigNames) {
            const prevRuns = prevGroup.configs[name];
            for (const prevRun of prevRuns) {
                if (prevRun.output_files.length > 0) {
                    html += '<div class="previous-output">';
                    html += '<div style="padding:8px 16px;background:#fff8e1;font-size:12px;color:#e65100;"><strong>Previous output</strong> (' + name + ')</div>';
                    for (const file of prevRun.output_files) {
                        html += '<div class="file-card">';
                        html += '<div class="file-header">' + escapeHtml(file.name) + ' <span style="color:#999;font-size:11px;">previous run</span></div>';
                        html += '<div class="file-content"><pre class="lazy-load" data-workspace="' + escapeHtml(WORKSPACE) + '" data-path="' + escapeHtml(file.path) + '">Loading...</pre></div>';
                        html += '</div>';
                    }
                    html += '</div>';
                }
            }
        }
    }

    // Output files for each config
    html += '<div id="config-display">';
    const activeConfig = configNames[0];
    html += renderConfigOutputs(group, activeConfig);
    html += '</div>';

    // Feedback box
    const feedbackKey = group.eval_id + '-' + activeConfig;
    const savedFeedback = feedback[feedbackKey] || '';
    html += '<div class="feedback-box">';
    html += '<h3>Your Feedback</h3>';
    html += '<textarea id="feedback-text" oninput="saveFeedback(\\'' + feedbackKey + '\\')" placeholder="What do you think about this output? What works, what doesn\\'t?">' + escapeHtml(savedFeedback) + '</textarea>';
    html += '<div class="saved" id="saved-indicator">✓ Saved</div>';
    html += '</div>';

    document.getElementById('eval-display').innerHTML = html;
}

function renderConfigOutputs(group, configName) {
    const runs = group.configs[configName] || [];
    let html = '';

    for (const run of runs) {
        if (run.output_files.length === 0) {
            html += '<p style="color:#999;font-size:13px;">No output files for this run.</p>';
            continue;
        }

        // Grading summary
        if (run.grading && run.grading.expectations) {
            const passed = run.grading.expectations.filter(e => e.passed).length;
            const total = run.grading.expectations.length;
            html += '<div class="grading-summary">';
            html += '<span class="grading-badge grading-pass">' + passed + ' passed</span>';
            if (total - passed > 0) {
                html += '<span class="grading-badge grading-fail">' + (total - passed) + ' failed</span>';
            }
            html += '<span style="font-size:12px;color:#999;margin-left:8px;">' + total + ' assertions</span>';
            html += '</div>';
        }

        for (const file of run.output_files) {
            html += '<div class="file-card">';
            html += '<div class="file-header">' + escapeHtml(file.name) + ' <span style="color:#999;font-size:11px;">' + formatSize(file.size) + '</span></div>';
            html += '<div class="file-content">';
            if (file.mime.startsWith('image/')) {
                html += '<div class="lazy-load" data-workspace="' + escapeHtml(WORKSPACE) + '" data-path="' + escapeHtml(file.path) + '" data-type="image">Loading image...</div>';
            } else {
                html += '<pre class="lazy-load" data-workspace="' + escapeHtml(WORKSPACE) + '" data-path="' + escapeHtml(file.path) + '">Loading...</pre>';
            }
            html += '</div>';
            html += '</div>';
        }
    }

    return html;
}

function selectConfig(name) {
    document.querySelectorAll('.config-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.config-btn[data-config="' + name + '"]').classList.add('active');

    const index = parseInt(document.getElementById('eval-select').value);
    const group = evalGroups[index];
    document.getElementById('config-display').innerHTML = renderConfigOutputs(group, name);

    const feedbackKey = group.eval_id + '-' + name;
    const savedFeedback = feedback[feedbackKey] || '';
    document.getElementById('feedback-text').value = savedFeedback;
}

function saveFeedback(key) {
    const text = document.getElementById('feedback-text').value;
    feedback[key] = text;
    const indicator = document.getElementById('saved-indicator');
    indicator.style.display = 'block';
    setTimeout(() => { indicator.style.display = 'none'; }, 2000);
    localStorage.setItem('feedback-' + SKILL_NAME, JSON.stringify(feedback));
}

function downloadAllFeedback() {
    const allFeedback = [];
    for (const group of evalGroups) {
        for (const configName of Object.keys(group.configs)) {
            const key = group.eval_id + '-' + configName;
            const fb = feedback[key] || '';
            allFeedback.push({
                run_id: group.eval_id + '-' + configName,
                feedback: fb,
                timestamp: new Date().toISOString(),
            });
        }
    }
    const data = { reviews: allFeedback, status: "complete" };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'feedback.json';
    a.click();
    URL.revokeObjectURL(url);
}

function switchTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('nav button').forEach(el => el.classList.remove('active'));
    document.getElementById(tab + '-tab').classList.add('active');
    document.getElementById(tab + '-tab-btn').classList.add('active');
    if (tab === 'benchmark') generateBenchmark();
}

function generateBenchmark() {
    // Build benchmark stats
    let html = '<div class="benchmark-summary">';
    html += '<h2>Benchmark Summary</h2>';
    html += '<div class="benchmark-counts">' + evalGroups.length + ' evals, ' + RUNS.length + ' total runs</div>';
    html += '</div>';

    // Per-config stats
    const configStats = {};
    for (const run of RUNS) {
        if (!configStats[run.config]) configStats[run.config] = { runs: 0, passed: 0, total: 0, times: [] };
        configStats[run.config].runs++;
        if (run.grading && run.grading.summary) {
            configStats[run.config].passed += run.grading.summary.passed || 0;
            configStats[run.config].total += run.grading.summary.total || 0;
        }
        if (run.grading && run.grading.timing) {
            configStats[run.config].times.push(run.grading.timing.total_duration_seconds || 0);
        }
    }

    html += '<table class="benchmark-table"><thead><tr><th>Config</th><th>Runs</th><th>Pass Rate</th><th>Avg Time</th></tr></thead><tbody>';
    for (const [config, stats] of Object.entries(configStats)) {
        const rate = stats.total > 0 ? ((stats.passed / stats.total) * 100).toFixed(1) : 'N/A';
        const avgTime = stats.times.length > 0 ? (stats.times.reduce((a, b) => a + b, 0) / stats.times.length).toFixed(1) + 's' : 'N/A';
        const label = config.replace(/_/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());
        html += '<tr><td><strong>' + label + '</strong></td><td>' + stats.runs + '</td><td>' + rate + '%</td><td>' + avgTime + '</td></tr>';
    }
    html += '</tbody></table>';

    // Per-eval breakdown
    html += '<h3 style="margin-top:24px;">Per-Eval Breakdown</h3>';
    html += '<table class="benchmark-table"><thead><tr><th>Eval</th>';
    const allConfigs = [...new Set(RUNS.map(r => r.config))];
    for (const config of allConfigs) {
        html += '<th>' + config.replace(/_/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase()) + '</th>';
    }
    html += '</tr></thead><tbody>';

    for (const group of evalGroups) {
        html += '<tr><td><strong>' + group.eval_id + '</strong></td>';
        for (const config of allConfigs) {
            const runs = group.configs[config] || [];
            const passed = runs.reduce((sum, r) => sum + (r.grading?.summary?.passed || 0), 0);
            const total = runs.reduce((sum, r) => sum + (r.grading?.summary?.total || 0), 0);
            const rate = total > 0 ? (passed / total * 100).toFixed(0) + '%' : '-';
            html += '<td>' + rate + '</td>';
        }
        html += '</tr>';
    }
    html += '</tbody></table>';

    document.getElementById('benchmark-content').innerHTML = html;
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
}

function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Restore feedback from localStorage
try {
    const saved = localStorage.getItem('feedback-' + SKILL_NAME);
    if (saved) feedback = JSON.parse(saved);
} catch {}

// Lazy loading of file content
document.addEventListener('click', function(e) {
    const header = e.target.closest('.file-header');
    if (header) {
        const content = header.nextElementSibling;
        const pre = content.querySelector('.lazy-load');
        if (pre && pre.dataset.loaded !== 'true') {
            pre.dataset.loaded = 'true';
            const workspace = pre.dataset.workspace || '.';
            const filePath = pre.dataset.path;
            const dataType = pre.dataset.type || 'text';
            pre.textContent = 'Loading from ' + filePath + '...';

            fetch('/api/file?path=' + encodeURIComponent(filePath))
                .then(r => r.json())
                .then(data => {
                    if (dataType === 'image' && data.type === 'image') {
                        pre.innerHTML = '<img src="data:' + data.mime + ';base64,' + data.data + '" alt="' + escapeHtml(filePath) + '" style="max-width:100%;">';
                    } else if (data.type === 'text') {
                        pre.textContent = data.data;
                    } else {
                        pre.innerHTML = '<a href="/api/raw?path=' + encodeURIComponent(filePath) + '" target="_blank">Download file</a>';
                    }
                })
                .catch(err => {
                    pre.textContent = 'Error loading: ' + err.message;
                });
        }
        const wasVisible = content.style.display !== 'none';
        content.style.display = wasVisible ? 'none' : 'block';
    }
});

// Init
populateSelector();
if (evalGroups.length > 0) displayEval(0);
</script>
</body>
</html>`;
}

function startServer(workspace, port, skillName, staticOutput, previousWorkspace) {
  const runs = findRuns(workspace);

  if (staticOutput) {
    const html = generateReviewHtml(workspace, runs, skillName, previousWorkspace);
    fs.writeFileSync(staticOutput, html);
    console.log(`Static review page written to: ${staticOutput}`);
    return;
  }

  // For static mode with server, serve the HTML + API
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    // API: get file content
    if (url.pathname === "/api/file") {
      const filePath = url.searchParams.get("path");
      if (!filePath) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: "Missing path" }));
        return;
      }
      const content = getFileContent(workspace, filePath);
      if (!content) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: "File not found" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(content));
      return;
    }

    // API: raw file download
    if (url.pathname === "/api/raw") {
      const filePath = url.searchParams.get("path");
      if (!filePath) {
        res.writeHead(400);
        res.end("Missing path");
        return;
      }
      const fullPath = path.join(workspace, filePath);
      if (!fs.existsSync(fullPath)) {
        res.writeHead(404);
        res.end("File not found");
        return;
      }
      const content = fs.readFileSync(fullPath);
      res.writeHead(200, { "Content-Type": getMimeType(fullPath) });
      res.end(content);
      return;
    }

    // API: save feedback
    if (url.pathname === "/api/feedback" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const data = JSON.parse(body);
          const feedbackPath = path.join(workspace, "feedback.json");
          fs.writeFileSync(feedbackPath, JSON.stringify(data, null, 2));
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) {
          res.writeHead(400);
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }

    // Serve the main HTML page
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(generateReviewHtml(workspace, runs, skillName, previousWorkspace));
  });

  server.listen(port, () => {
    console.log(`Eval review server running at http://localhost:${port}`);
    // Try to open browser
    try {
      execSync(`start http://localhost:${port}`, { timeout: 3000 });
    } catch {}
  });

  // Handle shutdown
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    process.exit(0);
  });
}

function main() {
  const args = process.argv.slice(2);
  let workspace = "";
  let port = 8080;
  let skillName = "";
  let staticOutput = null;
  let previousFeedback = null;
  let previousWorkspace = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && i + 1 < args.length) port = parseInt(args[++i], 10);
    else if (args[i] === "--skill-name" && i + 1 < args.length) skillName = args[++i];
    else if (args[i] === "--static" && i + 1 < args.length) staticOutput = args[++i];
    else if (args[i] === "--previous-feedback" && i + 1 < args.length) previousFeedback = args[++i];
    else if (args[i] === "--previous-workspace" && i + 1 < args.length) previousWorkspace = path.resolve(args[++i]);
    else if (!workspace) workspace = args[i];
  }

  if (!workspace) {
    console.error("Usage: node generate_review.js <workspace-path> [--port PORT] [--skill-name NAME] [--static <output.html>]");
    console.error("  --static              Write static HTML instead of starting server");
    console.error("  --previous-workspace  Path to previous iteration workspace for comparison");
    process.exit(1);
  }

  workspace = path.resolve(workspace);

  if (!fs.existsSync(workspace)) {
    console.error(`Workspace not found: ${workspace}`);
    process.exit(1);
  }

  startServer(workspace, port, skillName, staticOutput, previousWorkspace);
}

if (require.main === module) {
  main();
}

module.exports = { findRuns, generateReviewHtml, startServer, getFileContent };
