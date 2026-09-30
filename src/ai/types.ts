export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  author?: string; // Optional: author name for group chats
}

export interface AIChatInput {
  messages: AIMessage[];
  model?: string;
  maxTokens?: number;
}

export interface AIChatResponse {
  content: string;
  model: string;
}

export interface RateLimitInfo {
  remainingRequests?: number;
  remainingTokens?: number;
  resetRequests?: number;
  resetTokens?: number;
}

export interface AIProviderRuntimeInfo {
  provider: string;
  model: string;
  rateLimit?: RateLimitInfo;
}

export abstract class AIProvider {
  abstract readonly name: string;
  abstract chat(input: AIChatInput): Promise<AIChatResponse>;
  abstract getRuntimeInfo(): AIProviderRuntimeInfo;
}
