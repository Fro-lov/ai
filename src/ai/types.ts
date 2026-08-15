export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIChatInput {
  messages: AIMessage[];
  model?: string;
}

export interface AIChatResponse {
  content: string;
  model: string;
}

export interface AIProvider {
  chat(input: AIChatInput): Promise<AIChatResponse>;
}
