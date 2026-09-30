export interface PromptContext {
  globalPrompt: string;
  projectPrompt?: string;
  history: AIMessage[];
  userMessage: string;
  projectId?: string;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
