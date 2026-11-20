import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { TrueForgeClient } from '../client/TrueForgeClient';
import { DiffManager } from '../diff/DiffManager';
import { ContextEngine } from '../context/ContextEngine';

export class InlineController {
  private client: TrueForgeClient;
  private diffManager: DiffManager;
  private contextEngine: ContextEngine;

  constructor(client: TrueForgeClient, diffManager: DiffManager, contextEngine: ContextEngine) {
    this.client = client;
    this.diffManager = diffManager;
    this.contextEngine = contextEngine;
  }

  public async triggerInlineEdit(isTaskC = false) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('Please open a file to use Inline Edit.');
      return;
    }

    const document = editor.document;
    const selection = editor.selection;
    const selectedText = document.getText(selection);

    const prompt = await vscode.window.showInputBox({
      title: 'TrueForge Inline Edit',
      prompt: 'Enter instructions for the selected code (e.g. Treat values "off" and "n" as false)',
      placeHolder: 'Treat the values \'off\' and \'n\' as false as well, case-insensitively...'
    });

    if (!prompt) return;

    // Assemble context
    const contextResult = await this.contextEngine.assembleContext(prompt);

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'TrueForge: Generating diff...',
        cancellable: true
      },
      async (progress, token) => {
        token.onCancellationRequested(() => {
          this.client.cancelCurrentRun();
          vscode.window.showInformationMessage('TrueForge run cancelled. Workspace unchanged.');
        });

        for await (const event of this.client.sendTurn(prompt, contextResult.summary, isTaskC)) {
          if (event.type === 'fallback_triggered') {
            vscode.window.showWarningMessage(`[TrueForge Resilience] ${event.error} Switched to fallback: ${event.modelUsed}`);
          } else if (event.type === 'token') {
            progress.report({ message: event.token?.slice(0, 40) });
          } else if (event.type === 'approval_request') {
            const hunks = event.args?.hunks || [];
            if (hunks.length > 0) {
              const hunk = hunks[0];
              const choice = await vscode.window.showInformationMessage(
                `Proposed Diff for ${path.basename(event.args.filePath)}:\n${hunk.lines.slice(0, 4).join('\n')}...`,
                { modal: true },
                'Accept Hunk',
                'Reject Hunk'
              );

              if (choice === 'Accept Hunk') {
                await this.diffManager.acceptHunk(hunk.id, event.args.content);
                vscode.window.showInformationMessage(`[TrueForge] Hunk accepted and applied to ${path.basename(event.args.filePath)}.`);
              } else {
                this.diffManager.rejectHunk(hunk.id);
                vscode.window.showInformationMessage(`[TrueForge] Hunk rejected.`);
              }
            }
          } else if (event.type === 'error') {
            vscode.window.showErrorMessage(`[TrueForge Error] ${event.error}`);
          }
        }
      }
    );
  }
}
