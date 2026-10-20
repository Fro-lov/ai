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

  private extractRateLimits(headers: any): void {
    if (!headers) return;
    const getH = (key: string): string | undefined => {
      if (typeof headers.get === 'function') {
        return headers.get(key) || undefined;
      }
      return headers[key] || headers[key.toLowerCase()] || undefined;
    };

    const remReq = getH('x-ratelimit-remaining-requests');
    const remTok = getH('x-ratelimit-remaining-tokens');
    const resReq = getH('x-ratelimit-reset-requests');
    const resTok = getH('x-ratelimit-reset-tokens');
    const limReq = getH('x-ratelimit-limit-requests');
    const limTok = getH('x-ratelimit-limit-tokens');

    this.lastRateLimitInfo = {
      remainingRequests: remReq ? (isNaN(Number(remReq)) ? remReq : Number(remReq)) : this.lastRateLimitInfo.remainingRequests,
      remainingTokens: remTok ? (isNaN(Number(remTok)) ? remTok : Number(remTok)) : this.lastRateLimitInfo.remainingTokens,
      resetRequests: resReq || this.lastRateLimitInfo.resetRequests,
      resetTokens: resTok || this.lastRateLimitInfo.resetTokens,
      limitRequests: limReq ? (isNaN(Number(limReq)) ? limReq : Number(limReq)) : this.lastRateLimitInfo.limitRequests,
      limitTokens: limTok ? (isNaN(Number(limTok)) ? limTok : Number(limTok)) : this.lastRateLimitInfo.limitTokens,
    };
  }

  async chat(input: AIChatInput): Promise<AIChatResponse> {
    try {
      const { data: response, response: rawResponse } = await this.client.chat.completions.create({
        messages: input.messages,
        model: input.model || env.GROQ_MODEL,
        max_tokens: input.maxTokens || parseInt(env.AI_MAX_TOKENS),
        temperature: input.temperature !== undefined ? input.temperature : 0.1,
        ...(input.responseFormat ? { response_format: input.responseFormat } : {}),
      }).withResponse();

      const content = response.choices[0]?.message?.content || '';
      const model = response.model;

      this.lastModel = model;
      this.extractRateLimits(rawResponse?.headers);

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

  async getLimits(): Promise<RateLimitInfo> {
    if (!this.lastRateLimitInfo.remainingRequests) {
      try {
        const { response } = await this.client.chat.completions.create({
          messages: [{ role: 'user', content: 'ping' }],
          model: env.GROQ_MODEL,
          max_tokens: 1,
        }).withResponse();
        this.extractRateLimits(response?.headers);
      } catch (err) {
        logger.warn(`Could not refresh Groq limits: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return this.lastRateLimitInfo;
  }

  getRuntimeInfo(): AIProviderRuntimeInfo {
    return {
      provider: this.name,
      model: this.lastModel,
      rateLimit: this.lastRateLimitInfo,
    };
  }
}
