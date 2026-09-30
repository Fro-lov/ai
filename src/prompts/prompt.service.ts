import { env } from '../config/env';
import { logger } from '../utils/logger';
import { PromptContext, AIMessage } from './prompt.types';

export class PromptService {
  private projectPrompts: Map<string, string> = new Map();

  constructor() {
    this.loadProjectPrompts();
  }

  private loadProjectPrompts(): void {
    // Load project-specific prompts from env
    const projectPromptKeys = [
      'AI_PROJECT_PROMPT_ONTER_AI',
      'AI_PROJECT_PROMPT_MINECRAFT',
      'AI_PROJECT_PROMPT_SCRAP_EVOLUTION',
    ];

    for (const key of projectPromptKeys) {
      const value = process.env[key];
      if (value) {
        const projectId = key.replace('AI_PROJECT_PROMPT_', '').toLowerCase();
        this.projectPrompts.set(projectId, value);
        logger.info(`Loaded project prompt for: ${projectId}`);
      }
    }
  }

  getGlobalPrompt(): string {
    const prompt = env.AI_SYSTEM_PROMPT;
    if (!prompt) {
      throw new Error('AI_SYSTEM_PROMPT is required');
    }
    return prompt;
  }

  getProjectPrompt(projectId?: string): string | undefined {
    if (!projectId) {
      return undefined;
    }
    return this.projectPrompts.get(projectId.toLowerCase());
  }

  buildMessages(context: PromptContext): AIMessage[] {
    const messages: AIMessage[] = [];

    // Global Prompt (always first)
    messages.push({
      role: 'system',
      content: context.globalPrompt,
    });

    // Project Prompt (if provided)
    if (context.projectPrompt) {
      messages.push({
        role: 'system',
        content: context.projectPrompt,
      });
    }

    // Conversation History (strip author field for AI compatibility)
    messages.push(...context.history.map(msg => ({
      role: msg.role,
      content: msg.content,
    })));

    // Current User Message
    messages.push({
      role: 'user',
      content: context.userMessage,
    });

    // Log context info (not full prompts)
    logger.info(
      `Built messages: global=1, project=${context.projectPrompt ? 1 : 0}, history=${context.history.length}, current=1, projectId=${context.projectId || 'none'}`
    );

    return messages;
  }
}
