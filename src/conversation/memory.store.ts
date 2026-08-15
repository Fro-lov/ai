import { Conversation, ConversationStore } from './conversation.types';

export class MemoryConversationStore implements ConversationStore {
  private conversations: Map<string, Conversation> = new Map();

  get(id: string): Conversation | undefined {
    return this.conversations.get(id);
  }

  set(id: string, conversation: Conversation): void {
    this.conversations.set(id, conversation);
  }

  delete(id: string): void {
    this.conversations.delete(id);
  }

  has(id: string): boolean {
    return this.conversations.has(id);
  }

  clear(): void {
    this.conversations.clear();
  }

  size(): number {
    return this.conversations.size;
  }
}
