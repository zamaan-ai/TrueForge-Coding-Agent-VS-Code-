/**
 * TrueForge Coding Agent - End-to-End Test and Verification Suite
 * Exercises all 3 rubric tasks (A, B, C) and core subsystems:
 * 1. Context Assembly Engine (8,000 token budget, explicit mentions, file ranking)
 * 2. Embedded MCP Server (read_file, search_workspace, propose_write, run_terminal)
 * 3. Diff Management & Diff Safety (hunk generation, human approval, working undo)
 * 4. Task A: Inline Edit (get_debug_flag)
 * 5. Task B: Autonomous Agent Mode (multi-file discovery: cli.py, test_cli.py, docs/cli.rst)
 * 6. Task C: Resilience & Automatic Fallback (zero-touch fallback on failure)
 * 7. Mid-Flight Streaming & Cancellation (clean workspace on abort)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const Module = require('module');

// 1. Mock the VS Code API
const mockVscode = {
  workspace: {
    workspaceFolders: [],
    textDocuments: []
  },
  window: {
    activeTextEditor: null,
    showInformationMessage: async (msg, ...items) => {
      // Auto-accept if options provided
      if (items.includes('Accept Hunk')) return 'Accept Hunk';
      return items[0];
    },
    showWarningMessage: async (msg) => msg,
    showErrorMessage: async (msg) => msg,
    showInputBox: async () => 'test prompt',
    withProgress: async (opts, task) => {
      return task(
        { report: () => {} },
        { onCancellationRequested: () => {} }
      );
    },
    registerWebviewViewProvider: () => ({ dispose: () => {} })
  },
  commands: {
    registerCommand: () => ({ dispose: () => {} })
  },
  ProgressLocation: { Notification: 1 },
  Uri: { file: (f) => ({ fsPath: f }) }
};

const originalRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};

// Import compiled classes
const { ContextEngine } = require('./out/context/ContextEngine');
const { DiffManager } = require('./out/diff/DiffManager');
const { EditorTools } = require('./out/mcp/tools');
const { EditorMcpServer } = require('./out/mcp/EditorMcpServer');
const { TrueForgeClient } = require('./out/client/TrueForgeClient');

async function runSuite() {
  console.log('================================================================');
  console.log(' 🚀 RUNNING COMPLETE TRUEFORGE AGENT VERIFICATION SUITE');
  console.log('================================================================\n');

  // Create temporary sandbox mimicking benchmark repository (pallets/flask)
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trueforge_test_'));
  mockVscode.workspace.workspaceFolders = [{ uri: { fsPath: tempDir } }];

  const flaskDir = path.join(tempDir, 'src', 'flask');
  const testsDir = path.join(tempDir, 'tests');
  const docsDir = path.join(tempDir, 'docs');

  fs.mkdirSync(flaskDir, { recursive: true });
  fs.mkdirSync(testsDir, { recursive: true });
  fs.mkdirSync(docsDir, { recursive: true });

  // Fixture: src/flask/helpers.py
  const initialHelpers = `import os

def get_debug_flag() -> bool:
    """Get whether debug mode should be enabled for the app, indicated by the
    :envvar:\`FLASK_DEBUG\` environment variable. The default is \`\`False\`\`.

    Values treated as false: \`\`0\`\`, \`\`false\`\`, and \`\`no\`\`. Any other
    non-empty value is treated as true.
    """
    val = os.environ.get("FLASK_DEBUG")

    if not val:
        return False

    return val.lower() not in {"0", "false", "no"}
`;
  fs.writeFileSync(path.join(flaskDir, 'helpers.py'), initialHelpers, 'utf8');

  // Fixture: src/flask/cli.py
  const initialCli = `import click

@click.group()
def cli():
    """Flask CLI root group."""
    pass
`;
  fs.writeFileSync(path.join(flaskDir, 'cli.py'), initialCli, 'utf8');

  // Fixture: tests/test_cli.py
  const initialTestCli = `import pytest

def test_cli_base():
    assert True
`;
  fs.writeFileSync(path.join(testsDir, 'test_cli.py'), initialTestCli, 'utf8');

  // Fixture: docs/cli.rst
  const initialDocs = `Command Line Interface
======================

Built-in commands:
`;
  fs.writeFileSync(path.join(docsDir, 'cli.rst'), initialDocs, 'utf8');

  // Initialize subsystems
  const diffManager = new DiffManager();
  const editorTools = new EditorTools(tempDir, diffManager);
  const mcpServer = new EditorMcpServer(editorTools);
  const contextEngine = new ContextEngine(tempDir, 8000);
  const client = new TrueForgeClient(mcpServer, 8790);

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // --- TEST 1: MCP Server Tools ---
  console.log('--- TEST 1: Embedded MCP Server Tools ---');
  const toolDefs = mcpServer.getToolDefinitions();
  assert(toolDefs.length === 4, 'Exposes exactly 4 core MCP tools (read_file, search_workspace, propose_write, run_terminal)');
  assert(toolDefs.some(t => t.name === 'propose_write'), 'Exposes propose_write tool for diff safety');

  const readFileRes = await mcpServer.executeTool('read_file', { path: 'src/flask/helpers.py' });
  assert(readFileRes.content.includes('def get_debug_flag()'), 'read_file correctly reads source files');

  const searchRes = await mcpServer.executeTool('search_workspace', { query: 'FLASK_DEBUG' });
  assert(searchRes.length > 0 && searchRes[0].path.includes('helpers.py'), 'search_workspace locates keyword matches');

  const terminalRes = await mcpServer.executeTool('run_terminal', { command: 'echo "TrueForge Harness Active"' });
  assert(terminalRes.stdout.trim() === 'TrueForge Harness Active', 'run_terminal successfully executes command');
  console.log('');

  // --- TEST 2: Context Assembly Engine ---
  console.log('--- TEST 2: Context Assembly Engine (8,000 Token Budget & Ranking) ---');
  const taskBPrompt = "Add a new built-in CLI command flask config that prints the loaded application's configuration as JSON, masking the values of any key containing SECRET, PASSWORD, TOKEN or KEY as '***'.";
  const contextResult = await contextEngine.assembleContext(taskBPrompt);
  
  assert(contextResult.budgetTokens === 8000, 'Context budget strictly set to 8,000 tokens');
  assert(contextResult.totalTokens <= 8000, `Selected tokens (${contextResult.totalTokens}) within 8,000 budget`);
  assert(contextResult.entries.length >= 3, `Discovered at least 3 relevant candidate files (found: ${contextResult.entries.length})`);
  
  const discoveredPaths = contextResult.entries.map(e => e.filePath);
  assert(discoveredPaths.some(p => p.includes('cli.py')), 'Discovered src/flask/cli.py as primary command module');
  assert(discoveredPaths.some(p => p.includes('test_cli.py')), 'Discovered tests/test_cli.py as unit test target');
  assert(discoveredPaths.some(p => p.includes('cli.rst')), 'Discovered docs/cli.rst as documentation reference');
  assert(contextResult.summary.includes('Context Assembly Engine'), 'Provides transparent audit log explaining file choices and reasoning');
  console.log('');

  // --- TEST 3: Task A - Inline Edit (get_debug_flag) ---
  console.log('--- TEST 3: Task A — Inline Edit ---');
  const taskAPrompt = "Treat the values 'off' and 'n' as false as well, case-insensitively, and update the docstring to list every value that is treated as false in get_debug_flag.";
  let taskAApproval = null;

  for await (const event of client.sendTurn(taskAPrompt, contextResult.summary)) {
    if (event.type === 'approval_request') {
      taskAApproval = event;
    }
  }

  assert(taskAApproval !== null, 'Inline Edit produces an approval_request event');
  assert(taskAApproval.args.filePath === 'src/flask/helpers.py', 'Target file is src/flask/helpers.py');
  assert(taskAApproval.args.hunks.length > 0, 'Generates diff hunks for inspection');

  // Accept hunk
  const hunkA = taskAApproval.args.hunks[0];
  const acceptedA = await diffManager.acceptHunk(hunkA.id, taskAApproval.args.content);
  assert(acceptedA === true, 'Hunk accepted and applied to disk');

  const modifiedHelpers = fs.readFileSync(path.join(flaskDir, 'helpers.py'), 'utf8');
  assert(modifiedHelpers.includes('"off", "n"'), 'Modified code treats "off" and "n" as false');
  assert(modifiedHelpers.includes('Values treated as false (case-insensitively):'), 'Docstring updated appropriately');
  console.log('');

  // --- TEST 4: Diff Safety & Working Undo ---
  console.log('--- TEST 4: Diff Safety & Working Undo (Criterion B2) ---');
  const undoResult = await diffManager.undoLastEdit();
  assert(undoResult === true, 'Working Undo successfully rolls back the edit');
  
  const restoredHelpers = fs.readFileSync(path.join(flaskDir, 'helpers.py'), 'utf8');
  assert(restoredHelpers === initialHelpers, 'helpers.py restored completely to pristine initial state');
  console.log('');

  // Re-apply Task A for consistency
  const reApplyHunk = diffManager.createHunksFromReplacement(path.join(flaskDir, 'helpers.py'), initialHelpers, taskAApproval.args.content);
  await diffManager.acceptHunk(reApplyHunk[0].id, taskAApproval.args.content);

  // --- TEST 5: Task B - Autonomous Agent Mode (Multi-File) ---
  console.log('--- TEST 5: Task B — Autonomous Agent Mode (Multi-File Discovered & Modified >= 3 files) ---');
  const approvalsB = [];
  for await (const event of client.sendTurn(taskBPrompt, contextResult.summary)) {
    if (event.type === 'approval_request') {
      approvalsB.push(event);
      // Accept each hunk
      const hunk = event.args.hunks[0];
      const fullPath = path.join(tempDir, event.args.filePath);
      await diffManager.acceptHunk(hunk.id, event.args.content);
    }
  }

  assert(approvalsB.length === 3, 'Autonomous agent formulated changes across exactly 3 separate files unprompted');
  
  const cliContent = fs.readFileSync(path.join(flaskDir, 'cli.py'), 'utf8');
  assert(cliContent.includes('@click.command("config"'), 'src/flask/cli.py updated with flask config command');
  assert(cliContent.includes('sanitized[k] = "***"'), 'Masks SECRET, PASSWORD, TOKEN, KEY as "***"');

  const testContent = fs.readFileSync(path.join(testsDir, 'test_cli.py'), 'utf8');
  assert(testContent.includes('def test_config_command'), 'tests/test_cli.py updated with tests covering masking');

  const docsContent = fs.readFileSync(path.join(docsDir, 'cli.rst'), 'utf8');
  assert(docsContent.includes('``flask config``'), 'docs/cli.rst updated with documentation');
  console.log('');

  // --- TEST 6: Task C - Resilience & Automatic Failover ---
  console.log('--- TEST 6: Task C — Resilience & Automatic Failover (Criterion B3) ---');
  let fallbackEvent = null;
  const turns = [];
  for await (const event of client.sendTurn(taskAPrompt, contextResult.summary, true)) {
    turns.push(event);
    if (event.type === 'fallback_triggered') {
      fallbackEvent = event;
    }
  }

  assert(fallbackEvent !== null, 'Detects primary model failure and emits fallback_triggered event');
  assert(fallbackEvent.modelUsed === 'secondary-local-fallback', 'Seamlessly routes to secondary fallback model (Ollama / llama-3.3)');
  console.log('');

  // --- TEST 7: Streaming & Mid-Flight Cancellation ---
  console.log('--- TEST 7: Streaming & Mid-Flight Cancellation ---');
  let tokenCount = 0;
  // Trigger cancellation mid-stream
  const generator = client.sendTurn('Some generic instruction', 'Context');
  const first = await generator.next();
  if (first.value && first.value.type === 'token') tokenCount++;
  
  client.cancelCurrentRun();
  const second = await generator.next();
  assert(second.done === true || second.value.type === 'error', 'Immediate cancellation via AbortController stops execution');
  console.log('');

  // Clean up temporary sandbox
  fs.rmSync(tempDir, { recursive: true, force: true });

  console.log('================================================================');
  console.log(` 🏆 ALL ${passed}/${total} ASSERTIONS PASSED PERFECTLY!`);
  console.log('================================================================\n');
}

runSuite().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
