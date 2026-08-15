import { AIMessage } from '../ai';
import { AIService } from '../ai/ai.service';
import { ChatRequest, ChatResponse } from './chat.types';
import { logger } from '../utils/logger';

export class ChatService {
  constructor(private aiService: AIService) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    logger.info('Chat request started');

    let messages: AIMessage[] = [];

    // Use provided messages if available (for conversation history)
    if (request.messages && request.messages.length > 0) {
      messages = request.messages;
    } else {
      // Build messages from single message format
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
    }

    const response = await this.aiService.chat(
      {
        messages,
        model: request.model,
        maxTokens: request.maxTokens,
      },
      request.provider
    );

    logger.info('Chat request completed');

    return {
      content: response.content,
      model: response.model,
    };
  }
}
