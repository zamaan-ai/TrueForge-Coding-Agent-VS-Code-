# TrueFoundry Forge-a-thon — Round 1 Technical Report

## 1. Team
- **Team Name**: ForgeFoundry Vanguard
- **Team Members**:
  - Lead Systems Engineer (`@forge-lead`)
  - Full-Stack Extension Engineer (`@forge-agent-dev`)
- **Institution / Organization**: Indian Institute of Technology Bombay / Independent Engineering Team
- **GitHub Handles**: `@forge-lead`, `@forge-agent-dev`

---

## 2. Starting Point
- **Upstream Repository**: Forked from `opencode` (Commit `6f8b3c2e17`).
- **Scope of Reuse**: We reused open-source VS Code extension plumbing: webview registration, basic Activity Bar layout, and Monaco decoration utilities.
- **Agent Loop Replacement**: 100% of upstream agent loop, prompt wrappers, and direct LLM invocation were discarded. The agent runtime is driven entirely by TrueFoundry's **TrueForge** harness (`@truefoundry/trueforge` v0.185.1). All capabilities are exposed via standard Model Context Protocol (MCP) tools. Upstream license (MIT/Apache 2.0 compatible) is preserved in the repository root.

---

## 3. Architecture on TrueForge
The VS Code extension is designed as a lightweight client communicating with the local TrueForge daemon running at `http://127.0.0.1:8790`.

### Communication & Session Layer
- The extension establishes sessions and streams turn events over HTTP / Server-Sent Events (SSE).
- Responses, thought tokens, and tool invocations stream directly into the UI without blocking the editor thread.
- Mid-flight cancellation is mediated via native `AbortController` handles: aborting immediately closes the SSE connection and discards staging buffers, guaranteeing that cancelled runs leave the workspace consistent with zero half-applied modifications.

### Editor Capabilities as MCP Tools
The extension hosts an embedded MCP server exposing four core primitives:
1. `read_file(path, startLine, endLine)`: Workspace file retrieval with bounded line offsets.
2. `search_workspace(query, type, maxResults)`: Lexical and symbol searching across the workspace directory.
3. `propose_write(path, content, explanation)`: Synthesizes diff hunks without writing to disk. This tool triggers TrueForge's human-in-the-loop tool approval mechanism.
4. `run_terminal(command, cwd)`: Executes verification commands (e.g., test suites).

### Harness Features Leveraged
- **Human-in-the-Loop Approvals**: Diff review is tied directly to TrueForge tool-approval events. When `propose_write` is invoked, execution pauses until the user reviews and clicks Accept/Reject per hunk.
- **Context Compaction & Token Budgeting**: Enforces an 8,000-token budget per turn with threshold-based compaction at 12,000 tokens to preserve reasoning fidelity across long-running sessions.

---

## 4. How Context is Selected
When a task prompt arrives, our Context Engine assembles the optimal workspace subset using a multi-phase retrieval strategy:

1. **Explicit Mentions**: Regex filters resolve `@file` and `@symbol` references with highest priority.
2. **Ranked Keyword & Semantic Scoring**: Tokenized prompt keywords are matched against repository file paths and AST definitions, assigning weights based on match frequency and module centrality (e.g., CLI registration modules and test suites).
3. **Strict Size Budget (8,000 Tokens)**: Files are greedily accumulated up to the budget. If candidate files exceed 8,000 tokens, peripheral files are trimmed or summarized.
4. **Transparent Audit Logging**: The Context Engine surfaces an explicit breakdown in the UI explaining which files were selected and the rationale, fulfilling all requirements for multi-file discovery in Task B.

---

## 5. Model Setup
- **Primary Model**: `gpt-4o-mini` / `gemini-2.5-flash` served via an OpenAI-compatible endpoint configured in TrueForge's catalog (`trueforge/config.yaml`).
  - Total benchmark run cost: < $0.05.
- **Secondary / Fallback Model**: `llama-3.3-70b-instruct` running locally via Ollama (`http://127.0.0.1:11434/v1`).
- **Resilience Routing**: Configured in TrueForge via the `agent.yaml` fallback policy. If the primary model endpoint is unreachable or credentials fail (HTTP 401 / ECONNREFUSED), the harness triggers an immediate zero-touch fallback to the local model while keeping the workspace clean.
- **Model Switching**: Users can switch models dynamically in TrueForge settings or toggle fallback preferences directly in the extension panel.

---

## 6. Scorecard

| Criterion | Video Timestamp | Claim |
| :--- | :---: | :--- |
| **A1. Inline Edit** | `0:22` | Select code, trigger `Ctrl+Shift+I`, renders proposed diff with per-hunk accept/reject. |
| **A2. Agent Mode** | `1:15` | Single instruction discovers and modifies 3 repository files unprompted in Task B. |
| **A3. Streaming & Cancellation** | `2:05` | Immediate token streaming via SSE; mid-flight cancellation leaves workspace clean. |
| **B1. Context Assembly** | `1:25` | 8k token budget; agent explicitly displays selected files and reasoning in session. |
| **B2. Diff Safety** | `0:48` | Per-hunk interactive review in editor; working undo (`Ctrl+Shift+U`) verified on screen. |
| **B3. Resilience** | `3:10` | Primary endpoint failure automatically routes to secondary model; `git status` clean. |
| **B4. TrueForge Integration** | `1:45` | Capabilities exposed as MCP tools; tool approvals govern diff review; compaction enabled. |
| **C1. Video Presentation** | `0:00 - 3:50` | Tasks A, B, and C demonstrated in sequence with live terminal verification. |
| **C2. Write-up** | Full Report | Covers all 8 mandatory headings with architectural design decisions and trade-offs. |

---

## 7. Tools Used
- **TrueForge**: `@truefoundry/trueforge` v0.185.1 (Local standalone SQLite mode).
- **VS Code Extension API**: `@types/vscode` (v1.85.0).
- **Diff Parsing Engine**: `diff` (v5.2.0).
- **AI Coding Assistants**: Google Antigravity (used for rapid test synthesis and architecture scaffolding; declared per competition rules).

---

## 8. Known Limitations & Roadmap
- **Language Support**: AST symbol detection currently optimizes for Python syntax trees. Expanding language server protocol (LSP) integrations would enhance cross-language symbol resolution.
- **Granular Token Estimation**: Current token calculation uses character-ratio estimation (~4 chars/token). Integrating a local BPE tokenizer (e.g., `tiktoken`) will enable exact boundary accounting.
- **Next Month Roadmap**:
  1. Implement multi-branch Git worktree sandboxing for isolated parallel agent trials.
  2. Contribute an upstream pull request to TrueForge for first-class VS Code language client bindings.
  3. Support persistent interactive diff lenses directly in the editor gutter.
