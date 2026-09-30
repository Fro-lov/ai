import Groq from 'groq-sdk';
import { AIProvider, AIChatInput, AIChatResponse, AIProviderRuntimeInfo, RateLimitInfo } from '../types';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';

export class GroqProvider implements AIProvider {
  readonly name = 'groq';
  private client: Groq;
  private lastRateLimitInfo: RateLimitInfo = {};
  private lastModel: string = env.GROQ_MODEL;

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
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content || '';
      const model = response.model;

      // Extract rate limit info from response
      // Note: Groq SDK may not expose headers directly, so we'll store basic info
      this.lastModel = model;

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

  getRuntimeInfo(): AIProviderRuntimeInfo {
    return {
      provider: this.name,
      model: this.lastModel,
      rateLimit: this.lastRateLimitInfo,
    };
  }
}
