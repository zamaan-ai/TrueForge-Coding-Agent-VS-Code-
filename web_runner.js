const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');

// Mock VS Code environment for headless/web runtime
const mockVscode = {
  workspace: { workspaceFolders: [], textDocuments: [] },
  window: {
    activeTextEditor: null,
    showInformationMessage: async (msg, ...items) => items[0],
    showWarningMessage: async (msg) => msg,
    showErrorMessage: async (msg) => msg,
    showInputBox: async () => 'test prompt',
    withProgress: async (opts, task) => task({ report: () => {} }, { onCancellationRequested: () => {} }),
    registerWebviewViewProvider: () => ({ dispose: () => {} })
  },
  commands: { registerCommand: () => ({ dispose: () => {} }) },
  ProgressLocation: { Notification: 1 },
  Uri: { file: (f) => ({ fsPath: f }) }
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'vscode') return mockVscode;
  return originalRequire.apply(this, arguments);
};

// Import compiled modules
const { ContextEngine } = require('./out/context/ContextEngine');
const { DiffManager } = require('./out/diff/DiffManager');
const { EditorTools } = require('./out/mcp/tools');
const { EditorMcpServer } = require('./out/mcp/EditorMcpServer');
const { TrueForgeClient } = require('./out/client/TrueForgeClient');

// Initialize sandbox workspace
const sandboxDir = path.join(__dirname, 'sandbox_flask');
if (!fs.existsSync(sandboxDir)) {
  fs.mkdirSync(path.join(sandboxDir, 'src', 'flask'), { recursive: true });
  fs.mkdirSync(path.join(sandboxDir, 'tests'), { recursive: true });
  fs.mkdirSync(path.join(sandboxDir, 'docs'), { recursive: true });

  fs.writeFileSync(
    path.join(sandboxDir, 'src', 'flask', 'helpers.py'),
    `import os\n\ndef get_debug_flag() -> bool:\n    \"\"\"Get whether debug mode should be enabled for the app, indicated by the\n    :envvar:\`FLASK_DEBUG\` environment variable. The default is \`\`False\`\`.\n\n    Values treated as false: \`\`0\`\`, \`\`false\`\`, and \`\`no\`\`. Any other\n    non-empty value is treated as true.\n    \"\"\"\n    val = os.environ.get("FLASK_DEBUG")\n\n    if not val:\n        return False\n\n    return val.lower() not in {"0", "false", "no"}\n`
  );

  fs.writeFileSync(
    path.join(sandboxDir, 'src', 'flask', 'cli.py'),
    `import click\n\n@click.group()\ndef cli():\n    \"\"\"Flask CLI root group.\"\"\"\n    pass\n`
  );

  fs.writeFileSync(
    path.join(sandboxDir, 'tests', 'test_cli.py'),
    `import pytest\n\ndef test_cli_base():\n    assert True\n`
  );

  fs.writeFileSync(
    path.join(sandboxDir, 'docs', 'cli.rst'),
    `Command Line Interface\n======================\n\nBuilt-in commands:\n`
  );
}

mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: sandboxDir } }];

const diffManager = new DiffManager();
const editorTools = new EditorTools(sandboxDir, diffManager);
const mcpServer = new EditorMcpServer(editorTools);
const contextEngine = new ContextEngine(sandboxDir, 8000);
const client = new TrueForgeClient(mcpServer, 8790);

const PORT = 3456;

const server = http.createServer(async (req, res) => {
  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>TrueForge Agent — Live Interactive Console</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #0b0f19; color: #e2e8f0; display: flex; height: 100vh; }
    #sidebar { width: 340px; background: #111827; border-right: 1px solid #1f2937; display: flex; flex-direction: column; padding: 20px; }
    #main { flex: 1; display: flex; flex-direction: column; height: 100vh; overflow: hidden; }
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 9999px; font-size: 11px; font-weight: 600; background: #1e3a8a; color: #60a5fa; }
    .badge-fallback { background: #78350f !important; color: #fde68a !important; }
    .card { background: #1f2937; border: 1px solid #374151; border-radius: 8px; padding: 14px; margin-top: 14px; }
    .card h3 { font-size: 13px; text-transform: uppercase; color: #94a3b8; margin-bottom: 8px; letter-spacing: 0.5px; }
    .quick-btn { width: 100%; text-align: left; padding: 10px 12px; margin-top: 8px; background: #374151; border: 1px solid #4b5563; border-radius: 6px; color: #f8fafc; font-size: 12px; cursor: pointer; transition: all 0.2s; }
    .quick-btn:hover { background: #4b5563; border-color: #60a5fa; }
    #terminal { flex: 1; padding: 20px; overflow-y: auto; background: #090d16; font-family: 'JetBrains Mono', Consolas, monospace; font-size: 13px; line-height: 1.6; }
    .log-line { margin-bottom: 6px; white-space: pre-wrap; word-break: break-word; }
    .log-token { color: #38bdf8; }
    .log-alert { color: #f59e0b; background: rgba(245, 158, 11, 0.1); padding: 8px 12px; border-radius: 6px; border-left: 3px solid #f59e0b; }
    .log-success { color: #4ade80; }
    .diff-card { background: #1e293b; border: 1px solid #3b82f6; border-radius: 8px; margin: 12px 0; overflow: hidden; font-family: monospace; font-size: 12px; }
    .diff-header { background: #1e3a8a; padding: 8px 14px; display: flex; justify-content: space-between; align-items: center; color: white; font-weight: 600; }
    .diff-body { padding: 10px; max-height: 220px; overflow-y: auto; background: #0f172a; }
    .diff-add { color: #4ade80; }
    .diff-del { color: #f87171; }
    .diff-actions { padding: 10px 14px; background: #1e293b; display: flex; gap: 8px; }
    .btn { padding: 8px 16px; border-radius: 6px; font-weight: 600; font-size: 12px; cursor: pointer; border: none; transition: 0.2s; }
    .btn-accept { background: #16a34a; color: white; }
    .btn-reject { background: #dc2626; color: white; }
    .btn-undo { background: #475569; color: white; }
    .btn-cancel { background: #991b1b; color: white; }
    .btn-run { background: #2563eb; color: white; }
    #input-box { padding: 16px; background: #111827; border-top: 1px solid #1f2937; display: flex; gap: 10px; }
    textarea { flex: 1; background: #1f2937; border: 1px solid #374151; border-radius: 6px; color: white; padding: 10px; font-size: 13px; resize: none; height: 50px; }
  </style>
</head>
<body>
  <div id="sidebar">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
      <h2 style="font-size: 16px; font-weight: 700; color: #fff;">TrueForge Agent</h2>
      <span id="modelBadge" class="badge"><i class="fa fa-microchip"></i> Primary BYOM</span>
    </div>

    <div class="card">
      <h3>Context Engine Status</h3>
      <div id="contextInfo" style="font-size: 11px; color: #94a3b8;">Budget: 8,000 Tokens<br>Status: Standby & Ranked</div>
    </div>

    <div class="card">
      <h3>Preset Benchmarks (Rubric)</h3>
      <button class="quick-btn" onclick="runPreset('taskA')">
        <strong>Task A — Inline Edit</strong><br>
        <span style="font-size:10px;color:#94a3b8;">Modify get_debug_flag to treat 'off'/'n' as false</span>
      </button>
      <button class="quick-btn" onclick="runPreset('taskB')">
        <strong>Task B — Multi-File Agent Mode</strong><br>
        <span style="font-size:10px;color:#94a3b8;">Discover & edit cli.py, test_cli.py, cli.rst unprompted</span>
      </button>
      <button class="quick-btn" onclick="runPreset('taskC')">
        <strong>Task C — Resilience & Failover</strong><br>
        <span style="font-size:10px;color:#94a3b8;">Failover to secondary local model on endpoint crash</span>
      </button>
    </div>

    <div class="card" style="margin-top: auto;">
      <h3>Safety Controls</h3>
      <div style="display: flex; gap: 8px;">
        <button class="btn btn-undo" style="flex: 1;" onclick="triggerUndo()"><i class="fa fa-rotate-left"></i> Working Undo</button>
        <button class="btn btn-cancel" style="flex: 1;" onclick="triggerCancel()"><i class="fa fa-stop"></i> Cancel</button>
      </div>
    </div>
  </div>

  <div id="main">
    <div id="terminal">
      <div class="log-line" style="color:#64748b;">[TrueForge Harness v0.185.1] Live Interactive Session Connected.</div>
      <div class="log-line" style="color:#64748b;">Select a preset or enter instructions below.</div>
    </div>
    <div id="input-box">
      <textarea id="promptText" placeholder="Enter custom instruction for TrueForge Agent..."></textarea>
      <button class="btn btn-run" onclick="submitCustomPrompt()"><i class="fa fa-play"></i> Run Turn</button>
    </div>
  </div>

  <script>
    const terminal = document.getElementById('terminal');
    const promptText = document.getElementById('promptText');
    const modelBadge = document.getElementById('modelBadge');
    const contextInfo = document.getElementById('contextInfo');

    function log(msg, className = 'log-token') {
      const div = document.createElement('div');
      div.className = 'log-line ' + className;
      div.innerText = msg;
      terminal.appendChild(div);
      terminal.scrollTop = terminal.scrollHeight;
    }

    async function runPreset(type) {
      if (type === 'taskA') {
        runAgent("Treat the values 'off' and 'n' as false as well, case-insensitively, and update the docstring to list every value that is treated as false in get_debug_flag.", false);
      } else if (type === 'taskB') {
        runAgent("Add a new built-in CLI command flask config that prints the loaded application's configuration as JSON, masking the values of any key containing SECRET, PASSWORD, TOKEN or KEY as '***'. It must appear in flask --help, be covered by a test, and be documented alongside the other built-in commands.", false);
      } else if (type === 'taskC') {
        runAgent("Task C Resilience Test: Primary API simulated 401 Unauthorized.", true);
      }
    }

    function submitCustomPrompt() {
      const text = promptText.value.trim();
      if (!text) return;
      promptText.value = '';
      runAgent(text, text.toLowerCase().includes('task c') || text.toLowerCase().includes('resilience'));
    }

    async function runAgent(prompt, isTaskC) {
      log('\\n> [User Instruction] ' + prompt, 'log-success');
      const response = await fetch('/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, isTaskC })
      });
      const data = await response.json();

      contextInfo.innerHTML = '<strong>Selected ' + data.context.entries.length + ' files</strong> (' + data.context.totalTokens + ' / 8,000 tokens)<br>' +
        data.context.entries.map(e => '• ' + e.filePath).join('<br>');

      for (const event of data.events) {
        if (event.type === 'fallback_triggered') {
          modelBadge.className = 'badge badge-fallback';
          modelBadge.innerHTML = '<i class="fa fa-shield"></i> Fallback: ' + event.modelUsed;
          log('[TrueForge Resilience] ' + event.error + ' Switched to ' + event.modelUsed, 'log-alert');
        } else if (event.type === 'token') {
          log(event.token, 'log-token');
        } else if (event.type === 'approval_request') {
          renderDiffCard(event.args);
        } else if (event.type === 'done') {
          log('[TrueForge] Turn completed successfully.', 'log-success');
        }
      }
    }

    function renderDiffCard(data) {
      const hunks = data.hunks || [];
      hunks.forEach(hunk => {
        const card = document.createElement('div');
        card.className = 'diff-card';
        card.id = hunk.id;

        const linesHtml = (hunk.lines || []).map(l => {
          if (l.startsWith('+')) return '<div class="diff-add">' + escapeHtml(l) + '</div>';
          if (l.startsWith('-')) return '<div class="diff-del">' + escapeHtml(l) + '</div>';
          return '<div>' + escapeHtml(l) + '</div>';
        }).join('');

        card.innerHTML = \`
          <div class="diff-header">
            <span>\${escapeHtml(data.filePath)} (Hunk \${hunk.oldStart} -> \${hunk.newStart})</span>
            <span>Awaiting Review</span>
          </div>
          <div class="diff-body">\${linesHtml}</div>
          <div class="diff-actions">
            <button class="btn btn-accept" onclick="acceptHunk('\${hunk.id}', \`\${escapeAttr(data.content)}\`)">Accept Hunk</button>
            <button class="btn btn-reject" onclick="rejectHunk('\${hunk.id}')">Reject Hunk</button>
          </div>
        \`;
        terminal.appendChild(card);
        terminal.scrollTop = terminal.scrollHeight;
      });
    }

    async function acceptHunk(hunkId, content) {
      await fetch('/api/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hunkId, content })
      });
      const card = document.getElementById(hunkId);
      if (card) {
        card.querySelector('.diff-header').style.background = '#16a34a';
        card.querySelector('.diff-actions').innerHTML = '<span style="color:#4ade80;font-weight:600;">✓ Hunk Accepted & Applied to disk</span>';
      }
      log('Hunk accepted and applied to disk.', 'log-success');
    }

    async function rejectHunk(hunkId) {
      await fetch('/api/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hunkId })
      });
      const card = document.getElementById(hunkId);
      if (card) {
        card.querySelector('.diff-header').style.background = '#dc2626';
        card.querySelector('.diff-actions').innerHTML = '<span style="color:#f87171;font-weight:600;">✗ Hunk Rejected (No disk change)</span>';
      }
      log('Hunk rejected by user.', 'log-alert');
    }

    async function triggerUndo() {
      const res = await fetch('/api/undo', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        log('[Undo] Working Undo executed. Reverted to previous snapshot. Workspace restored pristine.', 'log-success');
      } else {
        log('[Undo] No prior changes in snapshot stack to undo.', 'log-alert');
      }
    }

    async function triggerCancel() {
      await fetch('/api/cancel', { method: 'POST' });
      log('[TrueForge] Run cancelled mid-flight. Workspace clean.', 'log-alert');
    }

    function escapeHtml(t) { return (t || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
    function escapeAttr(t) { return (t || '').replace(/\\\\/g, '\\\\\\\\').replace(/\\\`/g, '\\\\\\\\\`').replace(/\\\\$/g, '\\\\\\\\$'); }
  </script>
</body>
</html>`);
    return;
  }

  if (req.url === '/api/run' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      const { prompt, isTaskC } = JSON.parse(body || '{}');
      const context = await contextEngine.assembleContext(prompt);
      const events = [];
      for await (const event of client.sendTurn(prompt, context.summary, isTaskC)) {
        events.push(event);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ context, events }));
    });
    return;
  }

  if (req.url === '/api/accept' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      const { hunkId, content } = JSON.parse(body || '{}');
      const success = await diffManager.acceptHunk(hunkId, content);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success }));
    });
    return;
  }

  if (req.url === '/api/reject' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      const { hunkId } = JSON.parse(body || '{}');
      const success = diffManager.rejectHunk(hunkId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success }));
    });
    return;
  }

  if (req.url === '/api/undo' && req.method === 'POST') {
    const success = await diffManager.undoLastEdit();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success }));
    return;
  }

  if (req.url === '/api/cancel' && req.method === 'POST') {
    client.cancelCurrentRun();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`TrueForge Agent Live Console running at http://localhost:${PORT}`);
});
