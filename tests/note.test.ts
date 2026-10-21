import { test, describe } from 'node:test';
import assert from 'node:assert';
import { NoteService, detectProjectId } from '../src/notes/note.service';
import { IdeaRepository, IdeaRecord } from '../src/notes/idea.repository';
import { AIService } from '../src/ai/ai.service';
import { AIProvider, AIChatInput, AIChatResponse, AIProviderRuntimeInfo } from '../src/ai/types';

class MockIdeaRepository extends IdeaRepository {
  private memoryStore: Map<number, IdeaRecord> = new Map();
  private nextId = 1;

  async init(): Promise<void> {}

  async saveIdea(data: any): Promise<number> {
    const id = this.nextId++;
    const record: IdeaRecord = {
      id,
      userId: data.userId,
      chatId: data.chatId,
      telegramMessageId: data.telegramMessageId,
      projectId: data.projectId || 'general',
      title: data.title,
      rawIdea: data.rawIdea,
      clarificationSteps: data.clarificationSteps || [],
      specification: data.specification,
      status: data.status || 'new',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.memoryStore.set(id, record);
    return id;
  }

  async getIdeaById(id: number): Promise<IdeaRecord | null> {
    return this.memoryStore.get(id) || null;
  }

  async getIdeaByMessageId(_chatId: number, messageId: number): Promise<IdeaRecord | null> {
    for (const item of this.memoryStore.values()) {
      if (item.telegramMessageId === messageId) return item;
    }
    return null;
  }

  async linkTelegramMessage(ideaId: number, messageId: number, chatId?: number): Promise<void> {
    const item = this.memoryStore.get(ideaId);
    if (item) {
      item.telegramMessageId = messageId;
      if (chatId) item.chatId = chatId;
    }
  }

  async getUserIdeas(userId: number, _limit: number = 10): Promise<IdeaRecord[]> {
    return Array.from(this.memoryStore.values()).filter(i => i.userId === userId);
  }

  async updateSpecification(id: number, newSpecification: string, newTitle?: string): Promise<boolean> {
    const item = this.memoryStore.get(id);
    if (!item) return false;
    item.specification = newSpecification;
    if (newTitle) item.title = newTitle;
    item.updatedAt = new Date();
    return true;
  }
}

class MockAIProvider extends AIProvider {
  readonly name = 'mock';

  async chat(input: AIChatInput): Promise<AIChatResponse> {
    const isFinalPrompt = input.messages.some(m =>
      m.content.includes('КАТЕГОРИЧЕСКИЕ ЗАПРЕТЫ (АНТИ-ГАЛЛЮЦИНАЦИЯ)')
    );

    if (isFinalPrompt) {
      return {
        content: `TITLE: Тир в GTA 5 с зомби\n\n💡 **Суть идеи**\nРежим тира с волнами.\n\n\`\`\`markdown\n# Задача: Тир GTA 5\n\`\`\``,
        model: 'mock-model',
      };
    }

    const isAmendment = input.messages.some(m =>
      m.content.includes('Запрос пользователя на изменение/дополнение')
    );

    if (isAmendment) {
      return {
        content: `TITLE: Тир в GTA 5 с зомби (Обновленный)\n\n💡 **Суть идеи**\nРежим тира с локальным сохранением.\n\n\`\`\`markdown\n# Задача: Тир GTA 5\n- Локальное сохранение\n\`\`\``,
        model: 'mock-model',
      };
    }

    return {
      content: JSON.stringify({
        question: 'Какой тип спавна мишеней предпочтителен?',
        options: [
          'Статический спавн в заданных точках',
          'Динамический рандомный спавн по таймеру',
          'Волновой спавн с увеличением сложности',
        ],
        isReadyToFinalize: false,
      }),
      model: 'mock-model',
    };
  }

  getRuntimeInfo(): AIProviderRuntimeInfo {
    return { provider: 'mock', model: 'mock-model' };
  }
}

describe('NoteService Tests', () => {
  const mockProvider = new MockAIProvider();
  const aiService = new AIService([mockProvider], 'mock');

  test('startSession creates a session and returns initial question with 3 options', async () => {
    const mockRepo = new MockIdeaRepository();
    const noteService = new NoteService(aiService, mockRepo);
    const userId = 12345;
    const chatId = 67890;

    const res = await noteService.startSession(
      userId,
      chatId,
      'сделать в гта 5 тир с нпс в виде зомби и здоровых людей'
    );

    assert.ok(noteService.hasActiveSession(userId));
    assert.strictEqual(res.question, 'Какой тип спавна мишеней предпочтителен?');
    assert.strictEqual(res.options.length, 3);
    assert.strictEqual(res.options[0], 'Статический спавн в заданных точках');
  });

  test('answerCurrentQuestion with numeric choice records option and advances step', async () => {
    const mockRepo = new MockIdeaRepository();
    const noteService = new NoteService(aiService, mockRepo);
    const userId = 111;
    const chatId = 222;

    await noteService.startSession(userId, chatId, 'Идея тира');
    const step1 = await noteService.answerCurrentQuestion(userId, 2);

    assert.strictEqual(step1.isFinished, false);
    assert.ok(step1.nextQuestion);
    assert.strictEqual(step1.nextQuestion.options.length, 3);

    const session = noteService.getSession(userId);
    assert.ok(session);
    assert.strictEqual(session.steps.length, 1);
    assert.strictEqual(session.steps[0].answer, 'Динамический рандомный спавн по таймеру');
  });

  test('finalizeSession generates final task prompt, saves idea to repository, and clears session', async () => {
    const mockRepo = new MockIdeaRepository();
    const noteService = new NoteService(aiService, mockRepo);
    const userId = 555;
    const chatId = 666;

    await noteService.startSession(userId, chatId, 'гта 5 тир с манекенами');
    const res = await noteService.finalizeSession(userId);

    assert.ok(res.agentPrompt.includes('Суть идеи'));
    assert.ok(res.ideaId);
    assert.strictEqual(noteService.hasActiveSession(userId), false);

    const saved = await mockRepo.getIdeaById(res.ideaId);
    assert.ok(saved);
    assert.strictEqual(saved.projectId, 'fivem');
    assert.strictEqual(saved.title, 'Тир в GTA 5 с зомби');
  });

  test('amendIdea successfully updates idea specification and title', async () => {
    const mockRepo = new MockIdeaRepository();
    const noteService = new NoteService(aiService, mockRepo);

    const ideaId = await mockRepo.saveIdea({
      userId: 888,
      chatId: 999,
      projectId: 'fivem',
      title: 'Тир в GTA 5',
      rawIdea: 'тир в гта 5',
      clarificationSteps: [],
      specification: 'Исходное ТЗ',
    });

    const { updatedContent, updatedTitle } = await noteService.amendIdea(
      ideaId,
      'добавь пункт что данные хранятся локально'
    );

    assert.ok(updatedContent.includes('Локальное сохранение'));
    assert.strictEqual(updatedTitle, 'Тир в GTA 5 с зомби (Обновленный)');

    const updated = await mockRepo.getIdeaById(ideaId);
    assert.strictEqual(updated?.title, 'Тир в GTA 5 с зомби (Обновленный)');
  });

  test('detectProjectId correctly detects platforms', () => {
    assert.strictEqual(detectProjectId('сделать мод для майнкрафт atm10'), 'minecraft');
    assert.strictEqual(detectProjectId('скрипт для гта 5 fivem lua'), 'fivem');
    assert.strictEqual(detectProjectId('механика скрап для сервера'), 'scrap_evolution');
    assert.strictEqual(detectProjectId('сервис анализа резюме'), 'general');
  });
});
