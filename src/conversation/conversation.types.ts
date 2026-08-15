import { AIMessage } from '../ai';

export interface Conversation {
  id: string;
  messages: AIMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationStore {
  get(id: string): Conversation | undefined;
  set(id: string, conversation: Conversation): void;
  delete(id: string): void;
  has(id: string): boolean;
}
