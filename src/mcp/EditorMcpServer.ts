import { EditorTools } from './tools';

export interface McpToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export class EditorMcpServer {
  private tools: EditorTools;

  constructor(tools: EditorTools) {
    this.tools = tools;
  }

  public getToolDefinitions(): McpToolDefinition[] {
    return [
      {
        name: 'read_file',
        description: 'Read the contents of a file in the workspace, optionally within a line range.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path to the file in the workspace.' },
            startLine: { type: 'number', description: 'Optional 1-based start line.' },
            endLine: { type: 'number', description: 'Optional 1-based end line.' }
          },
          required: ['path']
        }
      },
      {
        name: 'search_workspace',
        description: 'Search workspace files for keywords, symbol names, or text patterns.',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Keyword or symbol query to search for.' },
            type: { type: 'string', enum: ['text', 'symbol'], description: 'Type of search.' },
            maxResults: { type: 'number', description: 'Max results to return.' }
          },
          required: ['query']
        }
      },
      {
        name: 'propose_write',
        description: 'Propose changes to a file. Generates a diff for hunk-by-hunk human approval. Does not write silently to disk.',
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative path of file to modify.' },
            content: { type: 'string', description: 'Complete proposed new content for the file.' },
            explanation: { type: 'string', description: 'Why this modification is being made.' }
          },
          required: ['path', 'content']
        }
      },
      {
        name: 'run_terminal',
        description: 'Execute a command in the terminal workspace (e.g. pytest or python verification).',
        parameters: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Shell command line to execute.' },
            cwd: { type: 'string', description: 'Subdirectory to run command in.' }
          },
          required: ['command']
        }
      }
    ];
  }

  public async executeTool(name: string, args: any): Promise<any> {
    switch (name) {
      case 'read_file':
        return this.tools.readFile(args);
      case 'search_workspace':
        return this.tools.searchWorkspace(args);
      case 'propose_write':
        return this.tools.proposeWrite(args);
      case 'run_terminal':
        return await this.tools.runTerminal(args);
      default:
        throw new Error(`Unknown MCP tool: ${name}`);
    }
  }
}
