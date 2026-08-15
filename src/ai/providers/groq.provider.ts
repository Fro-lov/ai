import Groq from 'groq-sdk';
import { AIProvider, AIChatInput, AIChatResponse } from '../types';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export class GroqProvider implements AIProvider {
  readonly name = 'groq';
  private client: Groq;

  constructor() {
    this.client = new Groq({
      apiKey: env.GROQ_API_KEY,
    });
  }

  async chat(input: AIChatInput): Promise<AIChatResponse> {
    try {
      const response = await this.client.chat.completions.create({
        messages: input.messages,
        model: input.model || env.GROQ_MODEL,
        max_tokens: input.maxTokens || parseInt(env.AI_MAX_TOKENS),
      });

      const content = response.choices[0]?.message?.content || '';
      const model = response.model;

      logger.info(`AI provider response received from model: ${model}`);

      return {
        content,
        model,
      };
    } catch (error) {
      logger.error(`Groq provider request failed: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }
}
