export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  author?: string; // Optional: author name for group chats
}

export interface AIChatInput {
  messages: AIMessage[];
  model?: string;
  maxTokens?: number;
  userId?: string;
}

export interface AIChatResponse {
  content: string;
  model: string;
  files?: Array<{ path: string; filename?: string; caption?: string }>;
  actions?: string[];
}

export interface RateLimitInfo {
  remainingRequests?: number | string;
  remainingTokens?: number | string;
  resetRequests?: number | string;
  resetTokens?: number | string;
  limitRequests?: number | string;
  limitTokens?: number | string;
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
  getLimits?(): Promise<any>;
}
