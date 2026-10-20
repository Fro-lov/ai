import { AIService } from '../ai/ai.service';
import { logger } from '../utils/logger';
import { NoteSession, NoteQuestionResponse, NoteClarificationStep } from './note.types';

export class NoteService {
  private sessions: Map<number, NoteSession> = new Map();
  private readonly SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour TTL
  private readonly DEFAULT_MAX_STEPS = 3;

  constructor(private aiService: AIService) {
    // Periodic cleanup of stale sessions every 10 minutes
    setInterval(() => this.cleanupExpiredSessions(), 10 * 60 * 1000).unref();
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
      const finalPrompt = await this.generateFinalAgentPrompt(session, providerName);
      this.sessions.delete(userId);
      return { isFinished: true, agentPrompt: finalPrompt };
    }

    // Generate next question
    const nextQuestionData = await this.generateNextQuestion(session, providerName);

    if (nextQuestionData.isReadyToFinalize) {
      const finalPrompt = await this.generateFinalAgentPrompt(session, providerName);
      this.sessions.delete(userId);
      return { isFinished: true, agentPrompt: finalPrompt };
    }

    session.currentQuestion = nextQuestionData.question;
    session.currentOptions = nextQuestionData.options;

    return {
      isFinished: false,
      nextQuestion: nextQuestionData,
    };
  }

  public async finalizeSession(userId: number, providerName?: string): Promise<string> {
    const session = this.sessions.get(userId);
    if (!session) {
      throw new Error('Активная сессия заметок не найдена.');
    }
    const finalPrompt = await this.generateFinalAgentPrompt(session, providerName);
    this.sessions.delete(userId);
    return finalPrompt;
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
Каждый шаг ты задаешь РОВНО ОДИН четкий вопрос, который проясняет самое критичное белое пятно в реализации (архитектура, стек, механики, логика взаимодействия, обработка пограничных условий).

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
      // Fallback in case of parsing/generation issue
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
    // Strip markdown json fences if present
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
  ): Promise<string> {
    const summaryClarifications = session.steps
      .map(
        (s, i) =>
          `${i + 1}. Вопрос: ${s.question}\n   Решение/Выбор: ${s.answer}`
      )
      .join('\n\n');

    const promptMessages = [
      {
        role: 'system' as const,
        content: `Ты — ведущий инженер по разработке промптов (Prompt Engineer) и системный архитектор.
Твоя задача — взять сырую идею автора и результаты интерактивного интервью и сформировать ИДЕАЛЬНОЕ, ГОТОВОЕ К ВЫПОЛНЕНИЮ ТЕХНИЧЕСКОЕ ЗАДАНИЕ (ПРОМПТ) ДЛЯ АВТОНОМНОГО ИИ-АГЕНТА (такого как Antigravity, Claude Sonnet 3.7, Cursor или ReAct агент).

СТРОГИЕ ПРАВИЛА:
1. Пиши на русском языке.
2. Никаких выдумок, предположений вне контекста или пустых абстракций ("реализуйте по вкусу"). Все должно опираться строго на идею и ответы автора.
3. Стиль: строгий, технический, структурированный, с профессиональной разметкой Markdown.
4. В конце ОБЯЗАТЕЛЬНО должен быть блок в кодовых кавычках \`\`\`markdown ... \`\`\`, который автор сможет скопировать в один клик и отправить агенту для мгновенного выполнения.

СТРУКТУРА ОТВЕТА:
- 📌 **Резюме идеи и концепция** (краткая выжимка того, что создается)
- ⚙️ **Архитектурные требования и стек** (конкретные технологии, фреймворки, методы)
- 📋 **Спецификация логики и механик** (пошагово: структуры данных, функции, события, расчеты, UI/эффекты)
- 🛡 **Пограничные сценарии и обработка ошибок (Edge Cases)**
- 🚀 **Готовый промпт для автономного агента** (в блоке \`\`\`markdown ... \`\`\`)`,
      },
      {
        role: 'user' as const,
        content: `Исходная идея:
"${session.rawIdea}"

Уточненные детали и выбор автора:
${summaryClarifications || 'Детали согласованы автором по умолчанию.'}

Сформируй полное техническое задание и готовый к копированию промпт для агента.`,
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

      return response.content;
    } catch (err) {
      logger.error(`Error generating final agent prompt: ${err instanceof Error ? err.message : String(err)}`);
      return `❌ Не удалось сгенерировать итоговое ТЗ: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}
