export interface TelegramConfig {
  botToken: string;
  systemPrompt: string;
  historyLimit: number;
}

export interface TelegramMessageContext {
  chatId: number;
  userId: number;
  username?: string;
  isPrivate: boolean;
  text: string;
  replyToMessageId?: number;
  mentionedBot: boolean;
}
