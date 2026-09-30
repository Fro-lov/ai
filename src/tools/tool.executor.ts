import { ToolRegistry } from './tool.registry';
import { ParsedToolResponse, ToolCall, ToolContext, ToolResult } from './tool.types';
import { logger } from '../utils/logger';

export class ToolExecutor {
  constructor(private registry: ToolRegistry) {}

  /**
   * Parses LLM response text or native tool calls into a unified structure.
   */
  parseResponse(rawContent?: string, nativeToolCalls?: any[]): ParsedToolResponse {
    const calls: ToolCall[] = [];

    // 1. Native Tool Calls from API (Groq/OpenAI)
    if (nativeToolCalls && Array.isArray(nativeToolCalls) && nativeToolCalls.length > 0) {
      for (const call of nativeToolCalls) {
        try {
          const args = typeof call.function.arguments === 'string'
            ? JSON.parse(call.function.arguments)
            : call.function.arguments;
          calls.push({
            id: call.id || `native_${Math.random().toString(36).substring(2, 9)}`,
            name: call.function.name,
            args: args || {},
          });
        } catch (err) {
          logger.error(`Failed to parse native tool call arguments for ${call.function?.name}: ${err}`);
        }
      }
    }

    // 2. Structured Prompt JSON / Markdown code blocks fallback parsing
    if (calls.length === 0 && rawContent) {
      const parsedFromPrompt = this.extractToolCallsFromPrompt(rawContent);
      if (parsedFromPrompt.length > 0) {
        calls.push(...parsedFromPrompt);
      }
    }

    return {
      hasToolCalls: calls.length > 0,
      content: rawContent,
      toolCalls: calls,
    };
  }

  /**
   * Extracts tool calls embedded in plain text response (fallback mode).
   */
  private extractToolCallsFromPrompt(content: string): ToolCall[] {
    const calls: ToolCall[] = [];

    // Look for JSON markdown block or raw JSON object
    const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/g;
    let match: RegExpExecArray | null;

    while ((match = jsonBlockRegex.exec(content)) !== null) {
      const jsonStr = match[1].trim();
      const call = this.tryParseToolJson(jsonStr);
      if (call) calls.push(call);
    }

    if (calls.length === 0) {
      // Try direct JSON object if whole response is JSON
      const call = this.tryParseToolJson(content.trim());
      if (call) calls.push(call);
    }

    return calls;
  }

  private tryParseToolJson(jsonStr: string): ToolCall | null {
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed === 'object') {
        // Format: { "tool_call": { "name": "...", "args": {...} } }
        if (parsed.tool_call && typeof parsed.tool_call.name === 'string') {
          return {
            id: `prompt_${Math.random().toString(36).substring(2, 9)}`,
            name: parsed.tool_call.name,
            args: parsed.tool_call.args || {},
          };
        }
        // Format: { "name": "...", "args": {...} }
        if (typeof parsed.name === 'string' && parsed.args && typeof parsed.args === 'object') {
          return {
            id: `prompt_${Math.random().toString(36).substring(2, 9)}`,
            name: parsed.name,
            args: parsed.args,
          };
        }
      }
    } catch {
      // Not a valid JSON tool call block
    }
    return null;
  }

  /**
   * Executes all tool calls in a response and returns results.
   */
  async executeToolCalls(calls: ToolCall[], context?: ToolContext): Promise<ToolResult[]> {
    const results: ToolResult[] = [];
    for (const call of calls) {
      const result = await this.registry.executeToolCall(call, context);
      results.push(result);
    }
    return results;
  }
}
