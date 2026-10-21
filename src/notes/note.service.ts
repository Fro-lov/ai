import { AIService } from '../ai/ai.service';
import { logger } from '../utils/logger';
import { NoteSession, NoteQuestionResponse, NoteClarificationStep } from './note.types';
import { IdeaRepository } from './idea.repository';

export function detectProjectId(text: string): string {
  const t = text.toLowerCase();
  if (t.includes('gta') || t.includes('fivem') || t.includes('lua') || t.includes('гта')) {
    return 'fivem';
  }
  if (
    t.includes('minecraft') ||
    t.includes('майн') ||
    t.includes('скайблок') ||
    t.includes('мод') ||
    t.includes('atm10') ||
    t.includes('kubejs')
  ) {
    return 'minecraft';
  }
  if (t.includes('scrap') || t.includes('скрап')) {
    return 'scrap_evolution';
  }
  return 'general';
}

export class NoteService {
  private sessions: Map<number, NoteSession> = new Map();
  private readonly SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour TTL
  private readonly DEFAULT_MAX_STEPS = 3;
  private ideaRepo: IdeaRepository;

  constructor(private aiService: AIService, ideaRepo?: IdeaRepository) {
    this.ideaRepo = ideaRepo || new IdeaRepository();
    this.ideaRepo.init().catch(err => {
      logger.warn(`IdeaRepository async init error: ${err instanceof Error ? err.message : String(err)}`);
    });

    // Periodic cleanup of stale sessions every 10 minutes
    setInterval(() => this.cleanupExpiredSessions(), 10 * 60 * 1000).unref();
  }

  public getIdeaRepository(): IdeaRepository {
    return this.ideaRepo;
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();
    for (const [userId, session] of this.sessions.entries()) {
      if (now - session.lastActivityAt > this.SESSION_TTL_MS) {
        this.sessions.delete(userId);
        logger.info(`Cleaned up expired note session for user ${userId}`);
      }
    }
  }

  public hasActiveSession(userId?: number): boolean {
    if (!userId) return false;
    const session = this.sessions.get(userId);
    if (!session) return false;
    if (Date.now() - session.lastActivityAt > this.SESSION_TTL_MS) {
      this.sessions.delete(userId);
      return false;
    }
    return true;
  }

  public getSession(userId?: number): NoteSession | undefined {
    if (!userId) return undefined;
    return this.sessions.get(userId);
  }

  public cancelSession(userId?: number): boolean {
    if (!userId) return false;
    const exists = this.sessions.has(userId);
    this.sessions.delete(userId);
    return exists;
  }

  public async startSession(
    userId: number,
    chatId: number,
    rawIdea: string,
    providerName?: string
  ): Promise<NoteQuestionResponse> {
    const session: NoteSession = {
      userId,
      chatId,
      rawIdea: rawIdea.trim(),
      steps: [],
      stepNumber: 1,
      maxSteps: this.DEFAULT_MAX_STEPS,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    this.sessions.set(userId, session);

    const questionData = await this.generateNextQuestion(session, providerName);
    session.currentQuestion = questionData.question;
    session.currentOptions = questionData.options;
    session.lastActivityAt = Date.now();

    return questionData;
  }

  public async answerCurrentQuestion(
    userId: number,
    answerInput: string | number,
    providerName?: string
  ): Promise<{
    isFinished: boolean;
    nextQuestion?: NoteQuestionResponse;
    agentPrompt?: string;
    ideaId?: number;
  }> {
    const session = this.sessions.get(userId);
    if (!session) {
      throw new Error('Активная сессия заметок не найдена.');
    }

    session.lastActivityAt = Date.now();

    // Resolve answer text
    let answerText = '';
    if (typeof answerInput === 'number' || /^[1-3]$/.test(String(answerInput).trim())) {
      const idx = Number(answerInput) - 1;
      if (session.currentOptions && session.currentOptions[idx]) {
        answerText = session.currentOptions[idx];
      } else {
        answerText = `Вариант ${answerInput}`;
      }
    } else {
      answerText = String(answerInput).trim();
    }

    // Save step
    const step: NoteClarificationStep = {
      question: session.currentQuestion || 'Вопрос',
      options: session.currentOptions || [],
      answer: answerText,
    };
    session.steps.push(step);
    session.stepNumber++;

    // Check if we reached max steps
    if (session.stepNumber > session.maxSteps) {
      const { title, content } = await this.generateFinalAgentPrompt(session, providerName);
      const projectId = detectProjectId(`${session.rawIdea} ${content}`);
      const ideaId = await this.ideaRepo.saveIdea({
        userId,
        chatId: session.chatId,
        projectId,
        title,
        rawIdea: session.rawIdea,
        clarificationSteps: session.steps,
        specification: content,
      });

      this.sessions.delete(userId);
      return { isFinished: true, agentPrompt: content, ideaId: ideaId || undefined };
    }

    // Generate next question
    const nextQuestionData = await this.generateNextQuestion(session, providerName);

    if (nextQuestionData.isReadyToFinalize) {
      const { title, content } = await this.generateFinalAgentPrompt(session, providerName);
      const projectId = detectProjectId(`${session.rawIdea} ${content}`);
      const ideaId = await this.ideaRepo.saveIdea({
        userId,
        chatId: session.chatId,
        projectId,
        title,
        rawIdea: session.rawIdea,
        clarificationSteps: session.steps,
        specification: content,
      });

      this.sessions.delete(userId);
      return { isFinished: true, agentPrompt: content, ideaId: ideaId || undefined };
    }

    session.currentQuestion = nextQuestionData.question;
    session.currentOptions = nextQuestionData.options;

    return {
      isFinished: false,
      nextQuestion: nextQuestionData,
    };
  }

  public async finalizeSession(
    userId: number,
    providerName?: string
  ): Promise<{ agentPrompt: string; ideaId?: number }> {
    const session = this.sessions.get(userId);
    if (!session) {
      throw new Error('Активная сессия заметок не найдена.');
    }
    const { title, content } = await this.generateFinalAgentPrompt(session, providerName);
    const projectId = detectProjectId(`${session.rawIdea} ${content}`);
    const ideaId = await this.ideaRepo.saveIdea({
      userId,
      chatId: session.chatId,
      projectId,
      title,
      rawIdea: session.rawIdea,
      clarificationSteps: session.steps,
      specification: content,
    });

    this.sessions.delete(userId);
    return { agentPrompt: content, ideaId: ideaId || undefined };
  }

  public async amendIdea(
    ideaId: number,
    amendmentText: string,
    providerName?: string
  ): Promise<{ updatedContent: string; updatedTitle?: string }> {
    const idea = await this.ideaRepo.getIdeaById(ideaId);
    if (!idea) {
      throw new Error(`Идея с ID #${ideaId} не найдена в базе данных.`);
    }

    const promptMessages = [
      {
        role: 'system' as const,
        content: `Ты — персональный ассистент по ведению технической документации и идей.
Пользователь хочет внести правки или дополнения в ранее зафиксированную идею.
Твоя задача — обновить текст идеи и готовый промпт для агента, аккуратно внедрив правку пользователя.

КАТЕГОРИЧЕСКИЕ ПРАВИЛА:
1. Сохраняй исходную структуру, стиль и разметку Markdown.
2. Не придумывай лишних технологий, библиотек, файлов или координат, если пользователь прямо об этом не просил.
3. Внедри изменения так, чтобы они органично вписались в контекст идеи.
4. В самой первой строке укажи заголовок: TITLE: <Краткое название идеи (3-6 слов)>.
5. В конце обнови блок задания для автономного агента в кодовых кавычках \`\`\`markdown ... \`\`\`.`,
      },
      {
        role: 'user' as const,
        content: `Исходный текст идеи:
${idea.specification}

Запрос пользователя на изменение/дополнение:
"${amendmentText}"

Сформируй полностью обновленный текст идеи с учетом правок.`,
      },
    ];

    try {
      const response = await this.aiService.chat(
        {
          messages: promptMessages,
          temperature: 0.2,
        },
        providerName
      );

      let cleanContent = response.content.trim();
      let updatedTitle: string | undefined = undefined;

      const titleMatch = cleanContent.match(/^TITLE:\s*(.+)$/m);
      if (titleMatch) {
        updatedTitle = titleMatch[1].trim();
        cleanContent = cleanContent.replace(/^TITLE:\s*.+\r?\n+/m, '').trim();
      }

      await this.ideaRepo.updateSpecification(ideaId, cleanContent, updatedTitle);

      return {
        updatedContent: cleanContent,
        updatedTitle: updatedTitle || idea.title,
      };
    } catch (err) {
      logger.error(`Error amending idea #${ideaId}: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
  }

  private async generateNextQuestion(
    session: NoteSession,
    providerName?: string
  ): Promise<NoteQuestionResponse> {
    const historyText = session.steps
      .map(
        (s, i) =>
          `Шаг ${i + 1}:
Вопрос: ${s.question}
Выбранный ответ: ${s.answer}`
      )
      .join('\n\n');

    const promptMessages = [
      {
        role: 'system' as const,
        content: `Ты — Senior Systems Analyst и Technical Product Architect.
Твоя задача — помочь автору распаковать его сырую идею в структурированное техническое задание.
Каждый шаг ты задаешь РОВНО ОДИН четкий вопрос, который проясняет самое критичное белое пятно в реализации (механики, логика взаимодействия, ключевые правила).

ТРЕБОВАНИЯ К ВОПРОСУ И ВАРИАНТАМ:
1. Вопрос должен быть конкретным и направленным на суть фичи (без лишней абстрактной "воды").
2. Предложи РОВНО ТРИ взаимоисключающих и реалистичных варианта ответа (цифры 1, 2, 3).
3. Варианты ответов должны быть емкими и понятными (3-8 слов каждый).
4. Если данных уже абсолютно достаточно для детального ТЗ (или это последний шаг), выставь "isReadyToFinalize": true.
5. Отвечай СТРОГО в формате валидного JSON без разметки markdown вокруг него:
{
  "question": "Текст вопроса?",
  "options": [
    "Краткий вариант 1",
    "Краткий вариант 2",
    "Краткий вариант 3"
  ],
  "isReadyToFinalize": false
}`,
      },
      {
        role: 'user' as const,
        content: `Сырая идея автора:
"${session.rawIdea}"

${historyText ? `Уже уточненные детали:\n${historyText}\n\n` : ''}Текущий шаг: ${session.stepNumber} из ${session.maxSteps}. Сформируй следующий вопрос и 3 варианта ответа в JSON.`,
      },
    ];

    try {
      const response = await this.aiService.chat(
        {
          messages: promptMessages,
          temperature: 0.2,
          responseFormat: { type: 'json_object' },
        },
        providerName
      );

      const parsed = this.parseQuestionResponse(response.content);
      return parsed;
    } catch (err) {
      logger.error(`Error generating next note question: ${err instanceof Error ? err.message : String(err)}`);
      return {
        question: 'Уточните ключевой стек и формат интеграции фичи:',
        options: [
          'Автономный модуль / плагин с конфигурацией',
          'Интеграция в существующее ядро сервиса',
          'Быстрый рабочий прототип (MVP скрипт)',
        ],
        isReadyToFinalize: false,
      };
    }
  }

  private parseQuestionResponse(content: string): NoteQuestionResponse {
    let clean = content.trim();
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    }

    try {
      const json = JSON.parse(clean);
      const question = typeof json.question === 'string' ? json.question : 'Уточните детали реализации:';
      let options: string[] = Array.isArray(json.options) ? json.options.map(String) : [];

      if (options.length === 0) {
        options = ['Вариант A', 'Вариант B', 'Вариант C'];
      } else if (options.length < 3) {
        while (options.length < 3) {
          options.push(`Дополнительный вариант ${options.length + 1}`);
        }
      } else if (options.length > 3) {
        options = options.slice(0, 3);
      }

      return {
        question,
        options,
        isReadyToFinalize: Boolean(json.isReadyToFinalize),
      };
    } catch (parseErr) {
      logger.warn(`Failed to parse question JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}, raw: ${content}`);
      return {
        question: 'Какое ключевое поведение требуется реализовать в первую очередь?',
        options: [
          'Базовая механика и обработка событий',
          'Пользовательский интерфейс и подсчет статистики',
          'Система сохранения и конфигурации',
        ],
        isReadyToFinalize: false,
      };
    }
  }

  private async generateFinalAgentPrompt(
    session: NoteSession,
    providerName?: string
  ): Promise<{ title: string; content: string }> {
    const summaryClarifications = session.steps
      .map(
        (s, i) =>
          `${i + 1}. Вопрос: ${s.question}\n   Решение/Выбор: ${s.answer}`
      )
      .join('\n\n');

    const promptMessages = [
      {
        role: 'system' as const,
        content: `Ты — персональный ассистент по кристаллизации идей и постановке задач для ИИ-агентов.
Твоя задача — зафиксировать суть идеи автора и зафиксированные в диалоге решения так, чтобы:
1. Через месяц автор перечитал заметку и мгновенно вспомнил, что именно и зачем он задумал.
2. Промпт в конце можно было сразу скопировать и отдать разработчику или автономному агенту как четкий бриф функционала.

КАТЕГОРИЧЕСКИЕ ЗАПРЕТЫ (АНТИ-ГАЛЛЮЦИНАЦИЯ):
1. ЗАПРЕЩЕНО выдумывать стек, языки программирования, фреймворки, библиотеки (C++, Script Hook V, React и т.д.), если автор явно их не назвал! Агент сам определит стек по кодовой базе проекта.
2. ЗАПРЕЩЕНО выдумывать архитектуру файлов (Main.cpp, Spawner.h), игровые координаты, горячие клавиши, формулы и конкретные ID моделей, если они не были согласованы с автором.
3. Опирайся ИСКЛЮЧИТЕЛЬНО на два источника: исходную идею и конкретные ответы автора из опроса.

СТРОГИЙ ФОРМАТ ВЫВОДА:
В самой первой строке ОБЯЗАТЕЛЬНО укажи заголовок:
TITLE: <Краткое название идеи (3-6 слов)>

Затем структурированный текст:
💡 **Суть идеи** (2-3 емких предложения: ключевая цель и назначение фичи).
🎯 **Согласованные детали** (список принятых решений из вопросов автора: механика, правила, логика).
❓ **Открытые развилки** (то, что намеренно оставлено на усмотрение реализации/агента).
📋 **Задание для автономного агента** (внутри блока \`\`\`markdown ... \`\`\`):
  - Контекст и задача (User Story).
  - Требования к поведению (Functional Requirements).
  - Критерии готовности (Acceptance Criteria).`,
      },
      {
        role: 'user' as const,
        content: `Исходная идея:
"${session.rawIdea}"

Уточненные детали и выбор автора:
${summaryClarifications || 'Детали согласованы автором по умолчанию.'}

Сформируй структурированную заметку и готовый к копированию промпт для агента.`,
      },
    ];

    try {
      const response = await this.aiService.chat(
        {
          messages: promptMessages,
          temperature: 0.2,
        },
        providerName
      );

      let cleanContent = response.content.trim();
      let title = session.rawIdea.slice(0, 40);

      const titleMatch = cleanContent.match(/^TITLE:\s*(.+)$/m);
      if (titleMatch) {
        title = titleMatch[1].trim();
        cleanContent = cleanContent.replace(/^TITLE:\s*.+\r?\n+/m, '').trim();
      }

      return { title, content: cleanContent };
    } catch (err) {
      logger.error(`Error generating final agent prompt: ${err instanceof Error ? err.message : String(err)}`);
      return {
        title: session.rawIdea.slice(0, 40),
        content: `❌ Не удалось сгенерировать итоговое ТЗ: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
