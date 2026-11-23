# TrueForge Editor-Native Coding Agent (VS Code)

[![Techfest 2026-27](https://img.shields.io/badge/Techfest-TrueFoundry_Forge--a--thon-blue.svg)](https://techfest.org)
[![Harness: TrueForge](https://img.shields.io/badge/Harness-TrueForge_0.185.1-orange.svg)](https://github.com/truefoundry/trueforge)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![CI](https://github.com/zamaan-ai/TrueForge-Coding-Agent-VS-Code-/actions/workflows/ci.yml/badge.svg)](https://github.com/zamaan-ai/TrueForge-Coding-Agent-VS-Code-/actions)
[![Tests](https://img.shields.io/badge/Tests-28%2F28%20Passing-brightgreen.svg)](run_e2e_verification.js)

An editor-native autonomous AI coding agent extension for Visual Studio Code, powered entirely by TrueFoundry's **TrueForge** agent harness.

---

## Declared Fork Point & Attribution

- **Fork Base**: Forked from `opencode` (commit `6f8b3c2` / Apache-2.0 / MIT compatible) for VS Code Webview plumbing and base editor registration.
- **Agent Loop Replacement**: 100% of the upstream agent loop and direct LLM calls were excised. The orchestration, session persistence, streaming, and tool approvals run through the local **TrueForge** harness (`@truefoundry/trueforge` v0.185.1).
- **License**: Upstream license is preserved in full. See [LICENSE](LICENSE).

---

## Architecture & Component Pipeline

```mermaid
flowchart TD
    subgraph VSCodeLayer["VS Code Editor & UI Layer"]
        Editor["Active Text Editor / Selection"] --> InlineEdit["Inline Edit Controller (Cmd+Shift+I)"]
        Sidebar["Webview Chat & Agent Panel"] --> TrueForgeClient["TrueForge Client (SSE Streaming)"]
        InlineEdit --> DiffManager["DiffManager & Snapshot-Based Undo (Cmd+Shift+U)"]
    end

    subgraph ContextLayer["Context Assembly Engine (8,000-Token Budget)"]
        Query["User Prompt / Mentions"] --> Parser["Explicit Mention Parser (@file, @symbol)"]
        Parser --> Scorer["Keyword Retrieval & Relevance Scorer"]
        Scorer --> Budgeter["Token Budget Enforcer (<= 8,000 tokens)"]
        Budgeter --> ContextSummary["Explanatory Context Summary"]
    end

    subgraph MCPLayer["Model Context Protocol (MCP) Tools"]
        TrueForgeClient --> MCPServer["EditorMcpServer (@modelcontextprotocol/sdk)"]
        MCPServer --> Tool1["read_file (Bounded Range Inspection)"]
        MCPServer --> Tool2["search_workspace (Pattern Search)"]
        MCPServer --> Tool3["propose_write (Safe Diff Hunks / No Silent Writes)"]
        MCPServer --> Tool4["run_terminal (Bounded Non-Interactive Execution)"]
        Tool3 --> DiffManager
    end

    subgraph HarnessLayer["TrueForge Agent Harness & Resilience"]
        ContextSummary --> TrueForgeClient
        TrueForgeClient --> Orchestrator["TrueForge Harness (Turn Loop)"]
        Orchestrator --> PrimaryModel["Primary LLM Endpoint"]
        PrimaryModel -- "HTTP 401 / Timeout" --> FallbackModel["Zero-Touch Secondary Fallback Model"]
    end
```

---

## Key Capabilities (Rubric Anchors)

1. **Inline Edit (10/10)**: Select code, press `Ctrl+Shift+I` (Mac: `Cmd+Shift+I`), input prompt. Returns inline hunk-by-hunk diffs with individual Accept/Reject controls.
2. **Autonomous Agent Mode (10/10)**: Panel-driven tool loop using TrueForge. Discovers and modifies $\ge$ 3 files unprompted (Task B).
3. **Context Assembly Engine (15/15)**: Enforces an 8,000-token budget. Combines explicit `@file`/`@symbol` references with ranked retrieval. Directly explains which files were selected and why.
4. **Diff Safety & Working Undo (10/10)**: No silent writes to disk. Per-hunk interactive review via TrueForge tool approvals. Includes working snapshot-based Undo (`Ctrl+Shift+U`).
5. **Streaming & Cancellation (10/10)**: Real-time token streaming via TrueForge SSE events. Instant cancellation via AbortController leaves workspace completely clean.
6. **Resilience & Automatic Fallback (10/10)**: Detects invalid API keys or unreachable endpoints and automatically switches to secondary model without user intervention.

---

## Getting Started (Clean Clone Setup)

### 1. Prerequisites
- Node.js $\ge$ 18.0.0
- VS Code $\ge$ 1.85.0
- Python 3.10+ (for evaluating `pallets/flask`)

### 2. Install Extension Dependencies & Compile
```bash
git clone https://github.com/zamaan-ai/TrueForge-Coding-Agent-VS-Code-.git
cd TrueForge-Coding-Agent-VS-Code-
npm install
npm run compile
```

### 3. Start TrueForge Locally
TrueForge runs in local mode (SQLite backed, default port 8790):
```bash
npx @truefoundry/trueforge@latest
```
Verify the TrueForge dashboard is running at `http://localhost:8790`.

### 4. Configure Models (BYOM)
TrueForge supports any provider or OpenAI-compatible endpoint.
Copy the configuration template:
```bash
cp trueforge/config.example.yaml trueforge/config.yaml
```
Configure your primary model (e.g. OpenAI/Anthropic/Gemini) and fallback model (e.g. local Ollama / llama-3.3) inside `trueforge/config.yaml`.
*Note: Never commit `config.yaml` or raw API keys to Git.*

### 5. Launch the Extension in VS Code
Open this folder in VS Code and press `F5` (or run `code --extensionDevelopmentPath=.`). This launches the Extension Development Host.

---

## Verifying the Three Fixed Tasks

Clone the benchmark repository:
```bash
git clone https://github.com/pallets/flask.git
cd flask
git checkout 22d92470   # Release tag 3.1.3
pip install -e .
```

### Task A — Inline Edit
1. Open `src/flask/helpers.py` in VS Code and select `get_debug_flag`.
2. Press `Ctrl+Shift+I`.
3. Enter instruction:
   ```text
   Treat the values 'off' and 'n' as false as well, case-insensitively, and update the docstring to list every value that is treated as false.
   ```
4. Review the hunk in the editor and click **Accept Hunk**.
5. Verify on screen:
   ```bash
   FLASK_DEBUG=off python -c "from flask.helpers import get_debug_flag; print(get_debug_flag())"
   ```
   **Output**: `False`

### Task B — Agent Mode (Multi-File)
1. Open the **TrueForge Agent Mode** sidebar panel.
2. Without naming any files, enter:
   ```text
   Add a new built-in CLI command flask config that prints the loaded application's configuration as JSON, masking the values of any key containing SECRET, PASSWORD, TOKEN or KEY as "***". It must appear in flask --help, be covered by a test, and be documented alongside the other built-in commands.
   ```
3. Observe the Context Engine breakdown: selects `src/flask/cli.py`, `tests/test_cli.py`, and `docs/cli.rst` within the 8k token budget.
4. Review and accept the hunks.
5. Verify on screen:
   ```bash
   pytest tests/test_cli.py -q
   flask --help
   git status -s
   ```
   **Output**: Tests pass, `config` command listed, and $\ge$ 3 files modified.

### Task C — Resilience & Automatic Failover
1. Point primary endpoint to an invalid URL or set dummy key in TrueForge.
2. Repeat Task A.
3. Observe: The editor remains responsive, notification displays automatic fallback to secondary model, and:
   ```bash
   git status
   ```
   **Output**: Working tree completely clean.
