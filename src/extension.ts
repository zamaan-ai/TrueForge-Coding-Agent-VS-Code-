import * as vscode from 'vscode';
import { DiffManager } from './diff/DiffManager';
import { EditorTools } from './mcp/tools';
import { EditorMcpServer } from './mcp/EditorMcpServer';
import { ContextEngine } from './context/ContextEngine';
import { TrueForgeClient } from './client/TrueForgeClient';
import { InlineController } from './inline/InlineController';
import { AgentPanelProvider } from './panel/AgentPanelProvider';

export function activate(context: vscode.ExtensionContext) {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();

  // 1. Initialize Core Subsystems
  const diffManager = new DiffManager();
  const editorTools = new EditorTools(workspaceRoot, diffManager);
  const mcpServer = new EditorMcpServer(editorTools);
  const contextEngine = new ContextEngine(workspaceRoot, 8000); // 8,000 token budget
  const trueForgeClient = new TrueForgeClient(mcpServer, 8790);

  // 2. Register Inline Controller
  const inlineController = new InlineController(trueForgeClient, diffManager, contextEngine);

  context.subscriptions.push(
    vscode.commands.registerCommand('trueforge.inlineEdit', async () => {
      await inlineController.triggerInlineEdit();
    })
  );

  // 3. Register Sidebar Webview Provider
  const panelProvider = new AgentPanelProvider(
    context.extensionUri,
    trueForgeClient,
    diffManager,
    contextEngine
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(AgentPanelProvider.viewType, panelProvider)
  );

  // 4. Register Working Undo & Safety Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('trueforge.undoLastEdit', async () => {
      await diffManager.undoLastEdit();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('trueforge.cancelRun', () => {
      trueForgeClient.cancelCurrentRun();
      vscode.window.showInformationMessage('[TrueForge] Active generation cancelled. Workspace clean.');
    })
  );

  console.log('[TrueForge] VS Code Extension initialized with MCP tools, Diff Manager, and Context Engine.');
}

export function deactivate() {}
