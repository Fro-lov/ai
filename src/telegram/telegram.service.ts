import { Bot, Context } from 'grammy';
import { ConversationService } from '../conversation/conversation.service';
import { ChatService } from '../chat/chat.service';
import { AIService } from '../ai/ai.service';
import { PromptService } from '../prompts/prompt.service';
import { FormatterService, formatterService as defaultFormatterService } from '../formatter';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { TelegramMessageContext } from './telegram.types';
import { ArgonProvider } from '../ai';

export class TelegramService {
  private bot: Bot;
  private conversationService: ConversationService;
  private chatService: ChatService;
  private promptService: PromptService;
  private aiService: AIService;
  private formatterService: FormatterService;
  private argonProvider?: ArgonProvider;
  private userSelectedProvider: Map<number, string> = new Map();

  constructor(
    conversationService: ConversationService,
    chatService: ChatService,
    promptService: PromptService,
    aiService: AIService,
    formatterService: FormatterService = defaultFormatterService,
    argonProvider?: ArgonProvider
  ) {
    this.bot = new Bot(env.TELEGRAM_BOT_TOKEN!);
    this.conversationService = conversationService;
    this.chatService = chatService;
    this.promptService = promptService;
    this.aiService = aiService;
    this.formatterService = formatterService;
    this.argonProvider = argonProvider;

    this.setupHandlers();
  }

  public isAdmin(userId?: number): boolean {
    if (!userId) return false;
    const adminList = (env.ADMIN_TELEGRAM_IDS || '')
      .split(',')
      .map(id => id.trim())
      .filter(Boolean);
    return adminList.includes(userId.toString());
  }

  private setupHandlers(): void {
    // Handle commands
    this.bot.command('start', this.handleStart.bind(this));
    this.bot.command('help', this.handleHelp.bind(this));
    this.bot.command('reset', this.handleReset.bind(this));
    this.bot.command('context', this.handleContext.bind(this));
    this.bot.command('limits', this.handleLimits.bind(this));
    this.bot.command('history', this.handleHistory.bind(this));
    this.bot.command('status', this.handleStatus.bind(this));
    this.bot.command('argon', this.handleArgon.bind(this));
    this.bot.command('cookies', this.handleCookies.bind(this));
    this.bot.command('model', this.handleModel.bind(this));

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
    const userId = ctx.from?.id;
    if (!chatId) return;

    logger.info(`Telegram /reset command from chat: ${chatId}`);
    const conversationId = this.getConversationId(chatId);
    this.conversationService.reset(conversationId);

    if (this.isAdmin(userId) && this.argonProvider) {
      try {
        await this.argonProvider.resetSession();
      } catch (err) {
        logger.warn(`Could not reset Argon Engine session: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    await ctx.reply('🔄 История диалога очищена.');
  }

  private async handleContext(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId) return;

    logger.info(`Telegram /context command from chat: ${chatId}`);
    const conversationId = this.getConversationId(chatId);
    const info = this.conversationService.getConversationInfo(conversationId);
    const chatType = ctx.chat?.type || 'unknown';
    const activeProvider = (userId && this.isAdmin(userId) && this.userSelectedProvider.get(userId)) || env.AI_DEFAULT_PROVIDER;

    const message = `
📊 Информация о диалоге:
• ID: ${info.id}
• Тип чата: ${chatType}
• Сообщений: ${info.messageCount}
• Лимит истории: ${info.historyLimit}
• Активный Provider: ${activeProvider}
• Модель по умолчанию: ${env.GROQ_MODEL}
• Max tokens: ${env.AI_MAX_TOKENS}
    `.trim();

    await ctx.reply(message);
  }

  private async handleHelp(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    if (!chatId) return;

    logger.info(`Telegram /help command from chat: ${chatId}`);

    let message = `
📚 <b>Доступные команды:</b>

/start - Начать работу и узнать как взаимодействовать
/help - Показать список команд
/reset - Очистить историю диалога
/context - Показать информацию о текущем диалоге
/limits - Показать информацию о лимитах AI
/history - Показать недавнюю историю
    `.trim();

    if (this.isAdmin(userId)) {
      message += `\n\n⚡ <b>Команды Администратора (Argon Hub):</b>
/argon &lt;задача&gt; - Запуск автономного агента в /workspace
/status - Проверка состояния сервера и сессии Gemini 4
/model &lt;groq|argon&gt; - Переключение модели диалога
/cookies &lt;1PSID&gt; &lt;1PSIDTS&gt; - Горячее обновление кук веб-сессии`;
    }

    await ctx.reply(message, { parse_mode: 'HTML' });
  }

  private async handleArgon(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!this.isAdmin(userId)) {
      await ctx.reply('⛔ Доступ ограничен. Модель Gemini 4 Argon и автономный агент доступны исключительно администраторам.');
      return;
    }

    const messageText = ctx.message?.text || '';
    const task = messageText.replace(/^\/argon(@\w+)?/i, '').trim();

    if (!task) {
      await ctx.reply('ℹ️ Использование: `/argon <описание задачи>`\n\nПример:\n`/argon создай в директории скрипт healthcheck.sh и проверь его запуск`');
      return;
    }

    if (!this.argonProvider) {
      await ctx.reply('⚠️ Сервис Argon Engine не инициализирован или недоступен.');
      return;
    }

    const statusMsg = await ctx.reply('⚙️ <b>[Argon Bridge]</b> Запуск автономного ReAct-агента...', { parse_mode: 'HTML' });

    try {
      await ctx.api.sendChatAction(ctx.chat!.id, 'typing');
      const result = await this.argonProvider.runAutonomousTask(task);

      if (result.success) {
        const report = `✅ <b>Задача выполнена успешно!</b>\n\n<b>Отчет агента:</b>\n${result.report}`;
        await this.sendLongMessage(ctx, report);
      } else {
        await ctx.reply(`❌ <b>Ошибка выполнения:</b>\n${result.error || 'Неизвестная ошибка'}`, { parse_mode: 'HTML' });
      }
    } catch (err) {
      logger.error(`Error in /argon command: ${err instanceof Error ? err.message : String(err)}`);
      await ctx.reply(`❌ Сбой связи с Argon Engine: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      try {
        await ctx.api.deleteMessage(ctx.chat!.id, statusMsg.message_id);
      } catch {
        // ignore delete failure
      }
    }
  }

  private async handleCookies(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!this.isAdmin(userId)) {
      await ctx.reply('⛔ Доступ ограничен администраторами.');
      return;
    }

    const text = ctx.message?.text || '';
    const parts = text.replace(/^\/cookies(@\w+)?/i, '').trim().split(/\s+/);

    if (parts.length < 2 || !parts[0] || !parts[1]) {
      await ctx.reply('ℹ️ Использование: `/cookies <__Secure-1PSID> <__Secure-1PSIDTS>`');
      return;
    }

    if (!this.argonProvider) {
      await ctx.reply('⚠️ Сервис Argon Engine не инициализирован.');
      return;
    }

    try {
      const res = await this.argonProvider.updateCookies(parts[0], parts[1]);
      await ctx.reply(`✅ <b>Сессия обновлена:</b> ${res.message}`, { parse_mode: 'HTML' });
    } catch (err) {
      await ctx.reply(`❌ Ошибка обновления куки: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async handleStatus(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    const isAdminUser = this.isAdmin(userId);

    let message = `📊 <b>Статус платформы Onter AI:</b>\n• Бот: Онлайн\n• Базовый провайдер: ${env.AI_DEFAULT_PROVIDER} (${env.GROQ_MODEL})\n`;

    if (isAdminUser && this.argonProvider) {
      try {
        const status = await this.argonProvider.getEngineStatus();
        message += `\n⚡ <b>Argon Hub (Сервер Oracle):</b>\n`;
        message += `• Сессия Gemini 4: ${status.sessionActive ? '🟢 Активна' : '🔴 Не авторизована'}\n`;
        message += `• Очередь задач: ${status.busy ? '⏳ Занята' : '🟢 Свободна'}\n`;
        message += `• Свободное место на диске: ${status.freeDiskGb} GB\n`;
        message += `• Аптайм: ${Math.round(status.uptimeSeconds / 60)} мин.\n`;
      } catch (err) {
        message += `\n⚠️ <i>Argon Engine локально недоступен (${err instanceof Error ? err.message : String(err)})</i>\n`;
      }
    } else {
      message += `• Доступный режим: Пользовательский диалог`;
    }

    await ctx.reply(message, { parse_mode: 'HTML' });
  }

  private async handleModel(ctx: Context): Promise<void> {
    const userId = ctx.from?.id;
    if (!this.isAdmin(userId) || !userId) {
      await ctx.reply('ℹ️ Для пользователей по умолчанию установлена быстрая модель Groq (Llama-3.1). Переключение моделей доступно только администраторам.');
      return;
    }

    const text = ctx.message?.text || '';
    const arg = text.replace(/^\/model(@\w+)?/i, '').trim().toLowerCase();

    if (!arg) {
      const current = this.userSelectedProvider.get(userId) || env.AI_DEFAULT_PROVIDER;
      await ctx.reply(`ℹ️ Текущий провайдер: <b>${current}</b>\n\nИспользование: <code>/model groq</code> или <code>/model argon</code>`, { parse_mode: 'HTML' });
      return;
    }

    if (arg === 'argon' || arg === 'groq') {
      this.userSelectedProvider.set(userId, arg);
      await ctx.reply(`✅ Модель переключена на: <b>${arg === 'argon' ? 'Gemini 4 Argon' : 'Groq Llama-3.1'}</b>`, { parse_mode: 'HTML' });
    } else {
      await ctx.reply('⚠️ Недопустимый провайдер. Допустимые значения: `groq`, `argon`');
    }
  }

  private async handleLimits(ctx: Context): Promise<void> {
    const chatId = ctx.chat?.id;
    if (!chatId) return;

    logger.info(`Telegram /limits command from chat: ${chatId}`);

    try {
      const runtimeInfo = this.aiService.getRuntimeInfo();
      const rateLimit = runtimeInfo.rateLimit;

      let message = `
📈 <b>Информация о лимитах:</b>
• Provider: ${runtimeInfo.provider}
• Model: ${runtimeInfo.model}
      `.trim();

      if (rateLimit) {
        message += `\n\n📊 <b>Rate Limit (Groq):</b>
• Remaining requests: ${rateLimit.remainingRequests || 'недоступно'}
• Remaining tokens: ${rateLimit.remainingTokens || 'недоступно'}
• Reset requests: ${rateLimit.resetRequests || 'недоступно'}
• Reset tokens: ${rateLimit.resetTokens || 'недоступно'}`;
      }

      const userId = ctx.from?.id;
      if (this.isAdmin(userId) && this.argonProvider) {
        try {
          const argonLimits = await this.argonProvider.getLimits();
          if (argonLimits && argonLimits.quotas && Object.keys(argonLimits.quotas).length > 0) {
            message += `\n\n⚡ <b>Квоты Gemini 4 Argon (Web Session):</b>\n`;
            for (const [key, q] of Object.entries(argonLimits.quotas)) {
              if (typeof q === 'object' && q !== null) {
                const label = q.label || key;
                if (label === 'default') continue;
                const remaining = q.remaining !== undefined ? q.remaining : '∞';
                const total = q.total !== undefined ? q.total : '∞';
                const usage = q.usage_percentage !== undefined ? `${q.usage_percentage}%` : '0%';
                let resetStr = '';
                if (q.reset_time) {
                  const date = new Date(q.reset_time * 1000);
                  resetStr = ` | Сброс: ${date.toLocaleTimeString('ru-RU')}`;
                }
                message += `• <b>${label}</b>: ${remaining}/${total} кредитов (исп: ${usage})${resetStr}\n`;
              }
            }
          }
        } catch (err) {
          logger.warn(`Could not fetch Argon limits: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      await ctx.reply(message, { parse_mode: 'HTML' });
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

      // Determine provider: admin can use argon if selected, otherwise fallback/regular users always groq
      const isUserAdmin = this.isAdmin(context.userId);
      const selectedProvider = isUserAdmin
        ? (this.userSelectedProvider.get(context.userId) || env.AI_DEFAULT_PROVIDER)
        : env.AI_DEFAULT_PROVIDER;

      // Get AI response with conversation history
      const response = await this.chatService.chat({
        message: cleanedText,
        messages: aiMessages,
        provider: selectedProvider,
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
      { command: 'status', description: 'Состояние хаба и сессий' },
      { command: 'model', description: 'Переключить модель (groq/argon)' },
      { command: 'argon', description: 'Запустить агента в /workspace' },
      { command: 'cookies', description: 'Обновить куки Gemini 4' },
      { command: 'reset', description: 'Очистить историю диалога' },
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
