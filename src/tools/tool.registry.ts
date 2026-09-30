import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolDefinition, ToolContext, ToolResult, ToolCall } from './tool.types';
import { logger } from '../utils/logger';

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  /**
   * Register a new tool definition.
   */
  registerTool(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      logger.warn(`Overwriting tool definition: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    logger.info(`Registered tool: ${tool.name}`);
  }

  /**
   * Retrieve a tool definition by name.
   */
  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * List all registered tools.
   */
  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Execute a tool call by name with validated parameters.
   */
  async executeToolCall(call: ToolCall, context?: ToolContext): Promise<ToolResult> {
    const tool = this.getTool(call.name);
    if (!tool) {
      return {
        toolCallId: call.id,
        name: call.name,
        result: null,
        error: `Tool "${call.name}" is not registered.`,
      };
    }

    try {
      // Validate arguments against Zod schema
      const parseResult = tool.parameters.safeParse(call.args);
      if (!parseResult.success) {
        const errorMsg = parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
        return {
          toolCallId: call.id,
          name: call.name,
          result: null,
          error: `Invalid parameters for tool "${call.name}": ${errorMsg}`,
        };
      }

      logger.info(`Executing tool: ${call.name} (ID: ${call.id})`);
      const result = await tool.execute(parseResult.data, context);
      return {
        toolCallId: call.id,
        name: call.name,
        result,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`Error executing tool "${call.name}": ${errorMsg}`);
      return {
        toolCallId: call.id,
        name: call.name,
        result: null,
        error: errorMsg,
      };
    }
  }

  /**
   * Generates tools schema array compatible with OpenAI/Groq native tools API.
   */
  toNativeToolsSchema(): Array<{ type: 'function'; function: { name: string; description: string; parameters: object } }> {
    return this.getAllTools().map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: zodToJsonSchema(t.parameters as any, { target: 'openApi3' }) as object,
      },
    }));
  }

  /**
   * Generates structured system prompt instructions for fallback (non-native) LLM models.
   */
  toPromptSystemInstructions(): string {
    const tools = this.getAllTools();
    if (tools.length === 0) return '';

    const toolDescriptions = tools.map((t) => {
      const jsonSchema = JSON.stringify(zodToJsonSchema(t.parameters as any, { target: 'openApi3' }));
      return `- **${t.name}**: ${t.description}\n  Parameters Schema: ${jsonSchema}`;
    }).join('\n');

    return `
[ДОСТУПНЫЕ ИНСТРУМЕНТЫ (TOOLS / FUNCTIONS)]
Ты можешь вызывать следующие функции для получения информации перед итоговым ответом:
${toolDescriptions}

[ФОРМАТ ВЫЗОВА ИНСТРУМЕНТА]:
Если тебе нужно вызвать инструмент, верни ответ СТРОГО в следующем JSON формате и больше НИЧЕГО лишнего:
\`\`\`json
{
  "tool_call": {
    "name": "ИМЯ_ИНСТРУМЕНТА",
    "args": { ...аргументы... }
  }
}
\`\`\`
Если информация не требует вызова инструментов, отвечай пользователю обычным текстом.
`.trim();
  }
}
