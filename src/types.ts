export interface DiffHunk {
  id: string;
  filePath: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: string[];
  status: 'pending' | 'accepted' | 'rejected';
}

export interface FileDiff {
  filePath: string;
  originalContent: string;
  proposedContent: string;
  hunks: DiffHunk[];
}

export interface ContextEntry {
  filePath: string;
  snippet: string;
  score: number;
  tokenCount: number;
  reason: string;
}

export interface ContextSelectionResult {
  entries: ContextEntry[];
  totalTokens: number;
  budgetTokens: number;
  summary: string;
}

export interface ToolApprovalRequest {
  toolCallId: string;
  toolName: string;
  args: any;
  hunks?: DiffHunk[];
  status: 'awaiting_user' | 'approved' | 'rejected';
}

export interface TrueForgeEvent {
  type: 'token' | 'tool_start' | 'tool_finish' | 'approval_request' | 'fallback_triggered' | 'done' | 'error';
  token?: string;
  toolName?: string;
  toolCallId?: string;
  args?: any;
  result?: any;
  error?: string;
  modelUsed?: string;
}

export interface TrueForgeModelConfig {
  primaryModel: {
    name: string;
    endpoint: string;
    apiKey: string;
  };
  fallbackModel: {
    name: string;
    endpoint: string;
    apiKey: string;
  };
  currentActive: 'primary' | 'fallback';
}
