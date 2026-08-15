import { AIProvider, AIMessage } from '../ai';
import { ChatRequest, ChatResponse } from './chat.types';
import { logger } from '../utils/logger';

export class ChatService {
  constructor(private aiProvider: AIProvider) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    logger.info('Chat request started');

    const messages: AIMessage[] = [];

    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt,
      });
    }

    messages.push({
      role: 'user',
      content: request.message,
    });

    const response = await this.aiProvider.chat({
      messages,
    });

    logger.info('Chat request completed');

    return {
      content: response.content,
      model: response.model,
    };
  }
}
