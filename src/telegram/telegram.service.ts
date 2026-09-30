import { Bot, Context } from 'grammy';
import { ConversationService } from '../conversation/conversation.service';
import { ChatService } from '../chat/chat.service';
import { AIService } from '../ai/ai.service';
import { PromptService } from '../prompts/prompt.service';
import { FormatterService, formatterService as defaultFormatterService } from '../formatter';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { TelegramMessageContext } from './telegram.types';

export class TelegramService {
  private bot: Bot;
  private conversationService: ConversationService;
  private chatService: ChatService;
  private promptService: PromptService;
  private aiService: AIService;
  private formatterService: FormatterService;

  constructor(
    conversationService: ConversationService,
    chatService: ChatService,
    promptService: PromptService,
    aiService: AIService,
    formatterService: FormatterService = defaultFormatterService
  ) {
    this.bot = new Bot(env.TELEGRAM_BOT_TOKEN!);
    this.conversationService = conversationService;
    this.chatService = chatService;
    this.promptService = promptService;
    this.aiService = aiService;
    this.formatterService = formatterService;

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // Handle commands
    this.bot.command('start', this.handleStart.bind(this));
    this.bot.command('help', this.handleHelp.bind(this));
    this.bot.command('reset', this.handleReset.bind(this));
    this.bot.command('context', this.handleContext.bind(this));
    this.bot.command('limits', this.handleLimits.bind(this));
    this.bot.command('history', this.handleHistory.bind(this));

    // Handle text messages
    this.bot.on('message:text', async (ctx, next) => {
    logger.info(`Telegram message received from chat: ${ctx.chat.id}`
      // chatId: ctx.chat.id,
      // chatType: ctx.chat.type,
      // text: ctx.message.text,
      // username: ctx.from?.username,
      // entities: ctx.message.entities,
    );

    await next();
  });
    this.bot.on('message:text', this.handleTextMessage.bind(this));
  }

  public extractMessageContext(ctx: Context): TelegramMessageContext | null {
    const message = ctx.message;
    if (!message || !message.text) return null;

    const chatId = message.chat.id;
    const userId = message.from?.id || 0;
    const username = message.from?.username;
    const isPrivate = message.chat.type === 'private';
    const text = message.text;
    const replyToMessageId = message.reply_to_message?.message_id;

    const botInfo = ctx.me || this.bot.botInfo;

    // Check if bot is mentioned using Telegram entities (for groups)
    let mentionedBot = false;
    if (!isPrivate && message.entities && botInfo) {
      const botUsername = botInfo.username;
      mentionedBot = message.entities.some(entity => {
        if (entity.type === 'mention') {
          const mention = text.slice(entity.offset, entity.offset + entity.length);
          return mention === `@${botUsername}`;
        }
        return false;
      });
    }

    // Check if message is a reply specifically to the bot's message
    const isReplyToBot = Boolean(
      message.reply_to_message &&
      botInfo &&
      message.reply_to_message.from?.id === botInfo.id
    );

    return {
      chatId,
      userId,
      username,
      isPrivate,
      text,
      replyToMessageId,
      isReplyToBot,
      mentionedBot,
    };
  }

  public shouldRespond(context: TelegramMessageContext): boolean {
    // Always respond in private chats
    if (context.isPrivate) return true;

    // In groups, only respond if mentioned or replying specifically to the bot
    if (context.mentionedBot) return true;
    if (context.isReplyToBot) return true;

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

  private async sendLongMessage(ctx: Context, text: string): Promise<void> {
    const formattedText = this.formatterService.format(text, 'telegram');
    const MAX_LENGTH = 4096; // Telegram message limit

    const sendChunk = async (chunk: string) => {
      try {
        await ctx.reply(chunk, { parse_mode: 'HTML' });
      } catch (err) {
        logger.warn(`Failed to send HTML message chunk, falling back to plain text: ${err instanceof Error ? err.message : String(err)}`);
        const plainText = this.formatterService.format(chunk, 'plaintext');
        await ctx.reply(plainText);
      }
    };

    if (formattedText.length <= MAX_LENGTH) {
      await sendChunk(formattedText);
      return;
    }

    // Split message into chunks
    const chunks: string[] = [];
    let currentChunk = '';

    for (const line of formattedText.split('\n')) {
      if ((currentChunk + line + '\n').length > MAX_LENGTH) {
        if (currentChunk) {
          chunks.push(currentChunk.trimEnd());
          currentChunk = '';
        }
        if (line.length > MAX_LENGTH) {
          for (let i = 0; i < line.length; i += MAX_LENGTH) {
            chunks.push(line.slice(i, i + MAX_LENGTH));
          }
        } else {
          currentChunk = line + '\n';
        }
      } else {
        currentChunk += line + '\n';
      }
    }

    if (currentChunk.trimEnd()) {
      chunks.push(currentChunk.trimEnd());
    }

    // Send chunks
    for (const chunk of chunks) {
      await sendChunk(chunk);
    }
  }

  private async handleStart(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const chatType = ctx.chat?.type;
    if (!chatId) return;

    logger.info(`Telegram /start command from chat: ${chatId} (type: ${chatType})`);

    let message = '👋 Привет! Я AI-ассистент.\n\n';
    
    if (chatType === 'private') {
      message += 'Просто отправь мне сообщение, и я отвечу.';
    } else {
      message += 'В групповых чатах я отвечаю:\n• При упоминании @' + this.bot.botInfo?.username + '\n• При ответе на моё сообщение';
    }

    await ctx.reply(message);
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
    const chatType = ctx.chat?.type || 'unknown';

    const message = `
📊 Информация о диалоге:
• ID: ${info.id}
• Тип чата: ${chatType}
• Сообщений: ${info.messageCount}
• Лимит истории: ${info.historyLimit}
• Provider: ${env.AI_DEFAULT_PROVIDER}
• Model: ${env.GROQ_MODEL}
• Max tokens: ${env.AI_MAX_TOKENS}
    `.trim();

    await ctx.reply(message);
  }

  private async handleHelp(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    logger.info(`Telegram /help command from chat: ${chatId}`);

    const message = `
📚 Доступные команды:

/start - Начать работу и узнать как взаимодействовать
/help - Показать список команд
/reset - Очистить историю диалога
/context - Показать информацию о текущем диалоге
/limits - Показать информацию о лимитах AI
    `.trim();

    await ctx.reply(message);
  }

  private async handleLimits(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    logger.info(`Telegram /limits command from chat: ${chatId}`);

    try {
      const runtimeInfo = this.aiService.getRuntimeInfo();
      const rateLimit = runtimeInfo.rateLimit;

      let message = `
📈 Информация о лимитах:
• Provider: ${runtimeInfo.provider}
• Model: ${runtimeInfo.model}
      `.trim();

      if (rateLimit) {
        message += `

📊 Rate Limit:
• Remaining requests: ${rateLimit.remainingRequests || 'недоступно'}
• Remaining tokens: ${rateLimit.remainingTokens || 'недоступно'}
• Reset requests: ${rateLimit.resetRequests || 'недоступно'}
• Reset tokens: ${rateLimit.resetTokens || 'недоступно'}
        `.trim();
      } else {
        message += `\n\n⚠️ Информация о лимитах пока недоступна. Сделайте хотя бы один запрос к AI.`;
      }

      await ctx.reply(message);
    } catch (error) {
      logger.error(`Error getting runtime info: ${error instanceof Error ? error.message : String(error)}`);
      await ctx.reply('❌ Не удалось получить информацию о лимитах.');
    }
  }

  private async handleHistory(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    logger.info(`Telegram /history command from chat: ${chatId}`);
    const conversationId = this.getConversationId(chatId);
    const messages = this.conversationService.getMessages(conversationId);

    if (messages.length === 0) {
      await ctx.reply('📭 История диалога пуста.');
      return;
    }

    let message = '📜 История диалога:\n\n';
    
    messages.forEach((msg, index) => {
      let role;
      if (msg.role === 'user') {
        role = msg.author ? `👤 ${msg.author}` : '👤 User';
      } else {
        role = '🤖 Assistant';
      }
      message += `${index + 1}. ${role}:\n${msg.content}\n\n`;
    });

    await this.sendLongMessage(ctx, message.trim());
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
        author: context.username || context.userId.toString(),
      });

      // Get conversation history
      const history = this.conversationService.getMessages(conversationId);

      // Build messages using new prompt architecture
      const globalPrompt = this.promptService.getGlobalPrompt();
      const aiMessages = this.promptService.buildMessages({
        globalPrompt,
        projectPrompt: undefined, // No project context for Telegram yet
        history,
        userMessage: cleanedText,
        projectId: undefined,
      });

      // Get AI response with conversation history
      const response = await this.chatService.chat({
        message: cleanedText,
        messages: aiMessages,
      });

      // Add assistant message to conversation
      this.conversationService.addMessage(conversationId, {
        role: 'assistant',
        content: response.content,
      });

      // Send response to Telegram (split if too long)
      await this.sendLongMessage(ctx, response.content);

      logger.info(`Telegram response sent to chat: ${context.chatId}`);
    } catch (error) {
      logger.error(`Telegram error for chat ${context.chatId}: ${error instanceof Error ? error.message : String(error)}`);
      
      // Provide user-friendly error messages based on error type
      let errorMessage = '❌ Не удалось получить ответ от AI. Попробуйте позже.';
      
      if (error instanceof Error) {
        if (error.message.includes('rate limit') || error.message.includes('429')) {
          errorMessage = '⚠️ Достигнут лимит запросов к AI. Попробуйте позже.';
        } else if (error.message.includes('timeout') || error.message.includes('network')) {
          errorMessage = '⚠️ Проблема с соединением. Попробуйте позже.';
        } else if (error.message.includes('invalid model')) {
          errorMessage = '⚠️ Неверная модель AI.';
        }
      }
      
      await ctx.reply(errorMessage);
    }
  }

  async start(): Promise<void> {
    logger.info('Starting Telegram bot...');
    
    // Set bot commands
    await this.bot.api.setMyCommands([
      { command: 'start', description: 'Начать работу' },
      { command: 'help', description: 'Список команд' },
      { command: 'reset', description: 'Очистить историю' },
      { command: 'context', description: 'Информация о диалоге' },
      { command: 'limits', description: 'Лимиты AI' },
      { command: 'history', description: 'Показать историю' },
    ]);
    
    await this.bot.start();
    logger.info('Telegram bot started');
  }

  async stop(): Promise<void> {
    logger.info('Stopping Telegram bot...');
    await this.bot.stop();
    logger.info('Telegram bot stopped');
  }
}
