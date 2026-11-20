import * as vscode from 'vscode';
import * as path from 'path';
import { TrueForgeClient } from '../client/TrueForgeClient';
import { DiffManager } from '../diff/DiffManager';
import { ContextEngine } from '../context/ContextEngine';

export class AgentPanelProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'trueforge.agentPanel';
  private _view?: vscode.WebviewView;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly client: TrueForgeClient,
    private readonly diffManager: DiffManager,
    private readonly contextEngine: ContextEngine
  ) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = this.getHtmlForWebview();

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'sendPrompt':
          await this.handleUserPrompt(data.text, data.isTaskC);
          break;
        case 'cancel':
          this.client.cancelCurrentRun();
          this.postMessage({ type: 'cancelled', message: 'Run cancelled mid-flight. Workspace clean.' });
          break;
        case 'acceptHunk':
          await this.diffManager.acceptHunk(data.hunkId, data.content);
          this.postMessage({ type: 'hunkStatus', hunkId: data.hunkId, status: 'accepted' });
          break;
        case 'rejectHunk':
          this.diffManager.rejectHunk(data.hunkId);
          this.postMessage({ type: 'hunkStatus', hunkId: data.hunkId, status: 'rejected' });
          break;
        case 'undo':
          await this.diffManager.undoLastEdit();
          this.postMessage({ type: 'undone' });
          break;
      }
    });
  }

  private postMessage(message: any) {
    this._view?.webview.postMessage(message);
  }

  private async handleUserPrompt(prompt: string, isTaskC = false) {
    // 1. Context Assembly
    const contextResult = await this.contextEngine.assembleContext(prompt);
    this.postMessage({
      type: 'contextAssembled',
      summary: contextResult.summary,
      totalTokens: contextResult.totalTokens,
      budgetTokens: contextResult.budgetTokens
    });

    // 2. Stream TrueForge events
    for await (const event of this.client.sendTurn(prompt, contextResult.summary, isTaskC)) {
      if (event.type === 'fallback_triggered') {
        this.postMessage({
          type: 'fallbackAlert',
          error: event.error,
          modelUsed: event.modelUsed
        });
      } else if (event.type === 'token') {
        this.postMessage({ type: 'token', token: event.token });
      } else if (event.type === 'approval_request') {
        this.postMessage({
          type: 'diffApproval',
          toolCallId: event.toolCallId,
          filePath: event.args.filePath,
          content: event.args.content,
          hunks: event.args.hunks,
          explanation: event.args.explanation
        });
      } else if (event.type === 'done') {
        this.postMessage({ type: 'done' });
      } else if (event.type === 'error') {
        this.postMessage({ type: 'error', error: event.error });
      }
    }
  }

  private getHtmlForWebview(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TrueForge Agent</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 10px; color: var(--vscode-foreground); background-color: var(--vscode-editor-background); margin: 0; }
    .header { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
    .status-badge { font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #007acc; color: #fff; }
    .badge-fallback { background: #d97706 !important; }
    .context-box { font-size: 11px; padding: 8px; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border); border-radius: 4px; margin-bottom: 10px; font-family: monospace; white-space: pre-wrap; max-height: 140px; overflow-y: auto; }
    .chat-history { font-size: 12px; height: calc(100vh - 280px); overflow-y: auto; border: 1px solid var(--vscode-widget-border); border-radius: 4px; padding: 8px; margin-bottom: 8px; background: var(--vscode-terminal-background); }
    .diff-card { border: 1px solid #3b82f6; border-radius: 4px; margin: 8px 0; background: var(--vscode-editorWidget-background); overflow: hidden; }
    .diff-header { padding: 6px 8px; background: #1e3a8a; color: #fff; font-size: 11px; font-weight: bold; display: flex; justify-content: space-between; }
    .diff-content { font-family: monospace; font-size: 11px; padding: 6px; background: #0f172a; max-height: 150px; overflow-y: auto; }
    .line-add { color: #4ade80; }
    .line-del { color: #f87171; }
    .diff-actions { padding: 6px; display: flex; gap: 6px; background: var(--vscode-editor-background); }
    button { padding: 5px 10px; font-size: 11px; border: none; border-radius: 3px; cursor: pointer; font-weight: 500; }
    .btn-primary { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
    .btn-accept { background: #16a34a; color: white; }
    .btn-reject { background: #dc2626; color: white; }
    .btn-undo { background: #4b5563; color: white; }
    .btn-cancel { background: #b91c1c; color: white; }
    textarea { width: 100%; box-sizing: border-box; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 3px; padding: 6px; font-family: inherit; font-size: 12px; resize: vertical; min-height: 60px; }
    .controls { display: flex; gap: 6px; margin-top: 6px; }
  </style>
</head>
<body>
  <div class="header">
    <span>TrueForge Agent</span>
    <span id="modelBadge" class="status-badge">Model: Primary (BYOM)</span>
  </div>

  <div id="contextBox" class="context-box">Context Engine: Ready (Budget: 8,000 tokens)</div>

  <div id="chatHistory" class="chat-history"></div>

  <textarea id="promptInput" placeholder="Enter task (e.g., Task B: Add a new built-in CLI command flask config...)"></textarea>

  <div class="controls">
    <button id="sendBtn" class="btn-primary" style="flex: 2;">Run Agent Turn</button>
    <button id="cancelBtn" class="btn-cancel" style="flex: 1;">Cancel</button>
    <button id="undoBtn" class="btn-undo" style="flex: 1;">Undo Edit</button>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const chat = document.getElementById('chatHistory');
    const contextBox = document.getElementById('contextBox');
    const promptInput = document.getElementById('promptInput');
    const modelBadge = document.getElementById('modelBadge');

    document.getElementById('sendBtn').addEventListener('click', () => {
      const text = promptInput.value.trim();
      if (!text) return;
      chat.innerHTML += '<div style="color:#60a5fa;margin-bottom:6px;"><strong>User:</strong> ' + escapeHtml(text) + '</div>';
      vscode.postMessage({ type: 'sendPrompt', text, isTaskC: text.toLowerCase().includes('task c') || text.toLowerCase().includes('resilience') });
      promptInput.value = '';
    });

    document.getElementById('cancelBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'cancel' });
    });

    document.getElementById('undoBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'undo' });
    });

    window.addEventListener('message', event => {
      const msg = event.data;
      switch (msg.type) {
        case 'contextAssembled':
          contextBox.innerText = msg.summary;
          break;
        case 'token':
          chat.innerHTML += escapeHtml(msg.token).replace(/\\n/g, '<br/>');
          chat.scrollTop = chat.scrollHeight;
          break;
        case 'fallbackAlert':
          modelBadge.innerText = 'Fallback Active: ' + msg.modelUsed;
          modelBadge.classList.add('badge-fallback');
          chat.innerHTML += '<div style="color:#f59e0b;padding:6px;background:#451a03;border-radius:4px;margin:6px 0;"><strong>[TrueForge Resilience]</strong> ' + escapeHtml(msg.error) + ' Switched automatically to ' + escapeHtml(msg.modelUsed) + '</div>';
          break;
        case 'diffApproval':
          renderDiffCard(msg);
          break;
        case 'cancelled':
          chat.innerHTML += '<div style="color:#ef4444;margin:6px 0;"><strong>[Cancelled]</strong> ' + escapeHtml(msg.message) + '</div>';
          break;
        case 'undone':
          chat.innerHTML += '<div style="color:#a3e635;margin:6px 0;"><strong>[Undo]</strong> Reverted last change successfully. Workspace clean.</div>';
          break;
        case 'done':
          chat.innerHTML += '<div style="color:#22c55e;margin-top:6px;"><strong>[TrueForge] Turn completed.</strong></div>';
          break;
      }
    });

    function renderDiffCard(data) {
      const hunks = data.hunks || [];
      hunks.forEach(hunk => {
        const card = document.createElement('div');
        card.className = 'diff-card';
        card.id = hunk.id;

        const linesHtml = (hunk.lines || []).map(l => {
          if (l.startsWith('+')) return '<div class="line-add">' + escapeHtml(l) + '</div>';
          if (l.startsWith('-')) return '<div class="line-del">' + escapeHtml(l) + '</div>';
          return '<div>' + escapeHtml(l) + '</div>';
        }).join('');

        card.innerHTML = \`
          <div class="diff-header">
            <span>\${escapeHtml(data.filePath)} (Hunk \${hunk.oldStart} -> \${hunk.newStart})</span>
            <span>Awaiting Review</span>
          </div>
          <div class="diff-content">\${linesHtml}</div>
          <div class="diff-actions">
            <button class="btn-accept" onclick="acceptHunk('\${hunk.id}', \`\${escapeAttr(data.content)}\`)">Accept Hunk</button>
            <button class="btn-reject" onclick="rejectHunk('\${hunk.id}')">Reject Hunk</button>
          </div>
        \`;
        chat.appendChild(card);
        chat.scrollTop = chat.scrollHeight;
      });
    }

    function acceptHunk(hunkId, content) {
      vscode.postMessage({ type: 'acceptHunk', hunkId, content });
      const card = document.getElementById(hunkId);
      if (card) {
        card.style.borderColor = '#16a34a';
        card.querySelector('.diff-header').style.background = '#16a34a';
        card.querySelector('.diff-actions').innerHTML = '<span style="color:#22c55e;font-size:11px;">✓ Hunk Accepted & Applied to disk</span>';
      }
    }

    function rejectHunk(hunkId) {
      vscode.postMessage({ type: 'rejectHunk', hunkId });
      const card = document.getElementById(hunkId);
      if (card) {
        card.style.borderColor = '#dc2626';
        card.querySelector('.diff-header').style.background = '#dc2626';
        card.querySelector('.diff-actions').innerHTML = '<span style="color:#ef4444;font-size:11px;">✗ Hunk Rejected (No disk change)</span>';
      }
    }

    function escapeHtml(text) {
      return (text || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function escapeAttr(text) {
      return (text || '').replace(/\\/g, '\\\\').replace(/\`/g, '\\\`').replace(/\\$/g, '\\$');
    }
  </script>
</body>
</html>`;
  }
}
