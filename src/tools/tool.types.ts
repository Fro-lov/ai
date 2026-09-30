import { z } from 'zod';

export interface ToolContext {
  userId?: string;
  projectId?: string;
  chatId?: string;
  [key: string]: any;
}

export interface ToolDefinition<TParams extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  parameters: TParams;
  execute: (args: z.infer<TParams>, context?: ToolContext) => Promise<any>;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, any>;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  result: any;
  error?: string;
}

export interface ParsedToolResponse {
  hasToolCalls: boolean;
  content?: string;
  toolCalls: ToolCall[];
}
