import { Conversation, ConversationStore } from './conversation.types';
import { AIMessage } from '../ai';
import { logger } from '../utils/logger';

export class ConversationService {
  constructor(
    private store: ConversationStore,
    private historyLimit: number
  ) {}

  getOrCreate(id: string): Conversation {
    let conversation = this.store.get(id);
    
    if (!conversation) {
      conversation = {
        id,
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.store.set(id, conversation);
      logger.info(`Created new conversation: ${id}`);
    }
    
    return conversation;
  }

  addMessage(id: string, message: AIMessage): Conversation {
    const conversation = this.getOrCreate(id);
    
    // Only add user and assistant messages to history (not system prompts)
    if (message.role === 'user' || message.role === 'assistant') {
      conversation.messages.push(message);
      conversation.updatedAt = new Date();

      // Enforce history limit (only for user/assistant messages)
      if (conversation.messages.length > this.historyLimit) {
        const removed = conversation.messages.length - this.historyLimit;
        conversation.messages = conversation.messages.slice(-this.historyLimit);
        logger.info(`Trimmed ${removed} old messages from conversation: ${id}`);
      }
    }

    this.store.set(id, conversation);
    return conversation;
  }

  getMessages(id: string): AIMessage[] {
    const conversation = this.store.get(id);
    return conversation?.messages || [];
  }

  reset(id: string): void {
    this.store.delete(id);
    logger.info(`Reset conversation: ${id}`);
  }

  getConversationInfo(id: string): { id: string; messageCount: number; historyLimit: number } {
    const conversation = this.store.get(id);
    return {
      id,
      messageCount: conversation?.messages.length || 0,
      historyLimit: this.historyLimit,
    };
  }

  buildAIContext(id: string, systemPrompt: string, userMessage: string): AIMessage[] {
    const messages: AIMessage[] = [];
    
    // Add system prompt
    messages.push({
      role: 'system',
      content: systemPrompt,
    });

    // Add conversation history (only user and assistant messages)
    const history = this.getMessages(id);
    messages.push(...history);

    // Add current user message
    messages.push({
      role: 'user',
      content: userMessage,
    });

    logger.info(`Conversation context messages: ${messages.length} (system: 1, history: ${history.length}, current: 1)`);

    return messages;
  }
}
