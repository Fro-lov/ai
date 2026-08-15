export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
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

export interface AIProvider {
  readonly name: string;
  chat(input: AIChatInput): Promise<AIChatResponse>;
}
