import { AIProvider, AIChatInput, AIChatResponse } from './types';
import { logger } from '../utils/logger';
import { ProviderNotFoundError, AIProviderError } from '../utils/errors';

export class AIService {
  private providers: Map<string, AIProvider> = new Map();
  private defaultProvider: string;

  constructor(providers: AIProvider[], defaultProvider: string) {
    this.defaultProvider = defaultProvider;
    
    for (const provider of providers) {
      this.providers.set(provider.name, provider);
    }

    if (!this.providers.has(defaultProvider)) {
      throw new Error(`Default provider '${defaultProvider}' not found in registered providers`);
    }

    logger.info(`AI Service initialized with ${providers.length} provider(s), default: ${defaultProvider}`);
  }

  getProvider(name?: string): AIProvider {
    const providerName = name || this.defaultProvider;
    const provider = this.providers.get(providerName);

    if (!provider) {
      throw new ProviderNotFoundError(providerName);
    }

    return provider;
  }

  async chat(input: AIChatInput, providerName?: string): Promise<AIChatResponse> {
    const provider = this.getProvider(providerName);
    logger.info(`AI chat request using provider: ${provider.name}`);
    
    try {
      return await provider.chat(input);
    } catch (error) {
      logger.error(`AI provider '${provider.name}' request failed: ${error instanceof Error ? error.message : String(error)}`);
      throw new AIProviderError(`Failed to get response from AI provider '${provider.name}'`);
    }
  }
}
