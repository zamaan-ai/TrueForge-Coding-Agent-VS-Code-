import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { DiffManager } from '../diff/DiffManager';
import { DiffHunk } from '../types';

export class EditorTools {
  private workspaceRoot: string;
  private diffManager: DiffManager;

  constructor(workspaceRoot: string, diffManager: DiffManager) {
    this.workspaceRoot = workspaceRoot;
    this.diffManager = diffManager;
  }

  public readFile(args: { path: string; startLine?: number; endLine?: number }): { content: string; totalLines: number } {
    const fullPath = path.isAbsolute(args.path) ? args.path : path.join(this.workspaceRoot, args.path);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${args.path}`);
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const start = args.startLine ? Math.max(0, args.startLine - 1) : 0;
    const end = args.endLine ? Math.min(lines.length, args.endLine) : lines.length;

    return {
      content: lines.slice(start, end).join('\n'),
      totalLines: lines.length
    };
  }

  public searchWorkspace(args: { query: string; type?: 'text' | 'symbol'; maxResults?: number }): Array<{ path: string; line: number; match: string }> {
    const query = args.query.toLowerCase();
    const maxResults = args.maxResults || 20;
    const results: Array<{ path: string; line: number; match: string }> = [];

    const walk = (dir: string) => {
      if (results.length >= maxResults) return;
      const ignore = new Set(['.git', 'node_modules', '__pycache__', '.pytest_cache', '.venv', 'dist', 'build']);
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            if (!ignore.has(entry.name)) walk(path.join(dir, entry.name));
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (['.py', '.rst', '.md', '.json', '.yaml', '.toml', '.ts', '.js'].includes(ext)) {
              const fullPath = path.join(dir, entry.name);
              const rel = path.relative(this.workspaceRoot, fullPath).replace(/\\/g, '/');
              const lines = fs.readFileSync(fullPath, 'utf8').split(/\r?\n/);
              for (let i = 0; i < lines.length; i++) {
                if (lines[i].toLowerCase().includes(query)) {
                  results.push({ path: rel, line: i + 1, match: lines[i].trim() });
                  if (results.length >= maxResults) return;
                }
              }
            }
          }
        }
      } catch {}
    };

    walk(this.workspaceRoot);
    return results;
  }

  public proposeWrite(args: { path: string; content: string; explanation?: string }): {
    filePath: string;
    content: string;
    hunks: DiffHunk[];
    requiresApproval: boolean;
    explanation: string;
  } {
    const fullPath = path.isAbsolute(args.path) ? args.path : path.join(this.workspaceRoot, args.path);
    const originalContent = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf8') : '';

    const hunks = this.diffManager.createHunksFromReplacement(fullPath, originalContent, args.content);

    return {
      filePath: args.path,
      content: args.content,
      hunks,
      requiresApproval: true,
      explanation: args.explanation || 'Proposed file change for user inspection'
    };
  }

  public async runTerminal(args: { command: string; cwd?: string }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const workingDir = args.cwd ? path.resolve(this.workspaceRoot, args.cwd) : this.workspaceRoot;
    return new Promise((resolve) => {
      exec(args.command, { cwd: workingDir }, (error, stdout, stderr) => {
        resolve({
          stdout: stdout.toString(),
          stderr: stderr.toString(),
          exitCode: error ? error.code || 1 : 0
        });
      });
    });
  }
}
