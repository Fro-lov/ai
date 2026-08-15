import { Bot, Context } from 'grammy';
import { ConversationService } from '../conversation/conversation.service';
import { ChatService } from '../chat/chat.service';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { TelegramMessageContext } from './telegram.types';

export class TelegramService {
  private bot: Bot;
  private conversationService: ConversationService;
  private chatService: ChatService;

  constructor(
    conversationService: ConversationService,
    chatService: ChatService
  ) {
    this.bot = new Bot(env.TELEGRAM_BOT_TOKEN!);
    this.conversationService = conversationService;
    this.chatService = chatService;

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Handle commands
    this.bot.command('start', this.handleStart.bind(this));
    this.bot.command('reset', this.handleReset.bind(this));
    this.bot.command('context', this.handleContext.bind(this));

    // Handle text messages
    this.bot.on('message:text', this.handleTextMessage.bind(this));
  }

  private extractMessageContext(ctx: Context): TelegramMessageContext | null {
    const message = ctx.message;
    if (!message || !message.text) return null;

    const chatId = message.chat.id;
    const userId = message.from?.id || 0;
    const username = message.from?.username;
    const isPrivate = message.chat.type === 'private';
    const text = message.text;
    const replyToMessageId = message.reply_to_message?.message_id;

    // Check if bot is mentioned (for groups)
    let mentionedBot = false;
    if (!isPrivate && this.bot.botInfo) {
      const botUsername = this.bot.botInfo.username;
      mentionedBot = text.includes(`@${botUsername}`);
    }

    return {
      chatId,
      userId,
      username,
      isPrivate,
      text,
      replyToMessageId,
      mentionedBot,
    };
  }

  private shouldRespond(context: TelegramMessageContext): boolean {
    // Always respond in private chats
    if (context.isPrivate) return true;

    // In groups, only respond if mentioned or replying to bot
    if (context.mentionedBot) return true;
    if (context.replyToMessageId) return true;

    return false;
  }

  private cleanText(context: TelegramMessageContext): string {
    let text = context.text;

    // Remove bot mention from text
    if (context.mentionedBot && this.bot.botInfo) {
      const botUsername = this.bot.botInfo.username;
      text = text.replace(new RegExp(`@${botUsername}`, 'gi'), '').trim();
    }

    return text;
  }

  private getConversationId(chatId: number): string {
    return `telegram:${chatId}`;
  }

  private async handleStart(ctx: Context): Promise<void> {
    logger.info(`Telegram /start command from chat: ${ctx.chat?.id}`);
    await ctx.reply('👋 Привет! Я AI-ассистент. Напиши мне сообщение и я отвечу.');
  }

  private async handleReset(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    logger.info(`Telegram /reset command from chat: ${chatId}`);
    const conversationId = this.getConversationId(chatId);
    this.conversationService.reset(conversationId);
    await ctx.reply('🔄 История диалога очищена.');
  }

  private async handleContext(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    logger.info(`Telegram /context command from chat: ${chatId}`);
    const conversationId = this.getConversationId(chatId);
    const info = this.conversationService.getConversationInfo(conversationId);

    const message = `
📊 Информация о диалоге:
• ID: ${info.id}
• Сообщений: ${info.messageCount}
• Лимит истории: ${info.historyLimit}
• Provider: ${env.AI_DEFAULT_PROVIDER}
• Model: ${env.GROQ_MODEL}
    `.trim();

    await ctx.reply(message);
  }

  private async handleTextMessage(ctx: Context): Promise<void> {
    const context = this.extractMessageContext(ctx);
    if (!context) return;

    logger.info(`Telegram message received from chat: ${context.chatId}`);

    // Check if we should respond
    if (!this.shouldRespond(context)) {
      return;
    }

    // Clean the text (remove mentions)
    const cleanedText = this.cleanText(context);
    if (!cleanedText) {
      return; // Don't send empty messages
    }

    const conversationId = this.getConversationId(context.chatId);

    try {
      // Send typing indicator
      await ctx.api.sendChatAction(context.chatId, 'typing');

      // Add user message to conversation FIRST
      this.conversationService.addMessage(conversationId, {
        role: 'user',
        content: cleanedText,
      });

      // Build AI context with system prompt and conversation history
      const aiMessages = this.conversationService.buildAIContext(
        conversationId,
        env.TELEGRAM_SYSTEM_PROMPT,
        cleanedText
      );

      // Get AI response with conversation history
      const response = await this.chatService.chat({
        message: cleanedText,
        systemPrompt: env.TELEGRAM_SYSTEM_PROMPT,
        messages: aiMessages,
      });

      // Add assistant message to conversation
      this.conversationService.addMessage(conversationId, {
        role: 'assistant',
        content: response.content,
      });

      // Send response to Telegram
      await ctx.reply(response.content);

      logger.info(`Telegram response sent to chat: ${context.chatId}`);
    } catch (error) {
      logger.error(`Telegram error for chat ${context.chatId}: ${error instanceof Error ? error.message : String(error)}`);
      await ctx.reply('❌ Не удалось получить ответ от AI. Попробуйте позже.');
    }
  }

  async start(): Promise<void> {
    logger.info('Starting Telegram bot...');
    await this.bot.start();
    logger.info('Telegram bot started');
  }

  async stop(): Promise<void> {
    logger.info('Stopping Telegram bot...');
    await this.bot.stop();
    logger.info('Telegram bot stopped');
  }
}
