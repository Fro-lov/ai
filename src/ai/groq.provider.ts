import Groq from 'groq-sdk';
import { AIProvider, AIChatInput, AIChatResponse } from './types';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export class GroqProvider implements AIProvider {
  private client: Groq;

  constructor() {
    this.client = new Groq({
      apiKey: env.GROQ_API_KEY,
    });
  }

  async chat(input: AIChatInput): Promise<AIChatResponse> {
    logger.info('AI provider request started');
    
    try {
      logger.info(`AI messages: ${JSON.stringify(input.messages)}`);
      const response = await this.client.chat.completions.create({
        messages: input.messages,
        model: input.model || env.GROQ_MODEL,
      });

      const content = response.choices[0]?.message?.content || '';
      const model = response.model;

      logger.info('AI provider response received');
      logger.info(`AI response: ${JSON.stringify(response)}`);

      return {
        content,
        model,
      };
    } catch (error) {
      logger.error('AI provider request failed');
      throw new Error('Failed to get response from AI provider');
    }
  }
}
