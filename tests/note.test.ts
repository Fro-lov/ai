import { test, describe } from 'node:test';
import assert from 'node:assert';
import { NoteService } from '../src/notes/note.service';
import { AIService } from '../src/ai/ai.service';
import { AIProvider, AIChatInput, AIChatResponse, AIProviderRuntimeInfo } from '../src/ai/types';

class MockAIProvider extends AIProvider {
  readonly name = 'mock';

  async chat(input: AIChatInput): Promise<AIChatResponse> {
    const isFinalPrompt = input.messages.some(m =>
      m.content.includes('ГОТОВОЕ К ВЫПОЛНЕНИЮ ТЕХНИЧЕСКОЕ ЗАДАНИЕ')
    );

    if (isFinalPrompt) {
      return {
        content: `### 🎯 ТЗ для агента\n\n\`\`\`markdown\n# Задача: Тир GTA 5\n- Спавн манекенов\n- Подсчет очков\n\`\`\``,
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
    const noteService = new NoteService(aiService);
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
    const noteService = new NoteService(aiService);
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

  test('answerCurrentQuestion with custom text records custom answer', async () => {
    const noteService = new NoteService(aiService);
    const userId = 333;
    const chatId = 444;

    await noteService.startSession(userId, chatId, 'Идея тира');
    await noteService.answerCurrentQuestion(userId, 'Хочу только зомби на крышах и людей внизу');

    const session = noteService.getSession(userId);
    assert.ok(session);
    assert.strictEqual(session.steps[0].answer, 'Хочу только зомби на крышах и людей внизу');
  });

  test('finalizeSession generates final task prompt and clears session', async () => {
    const noteService = new NoteService(aiService);
    const userId = 555;
    const chatId = 666;

    await noteService.startSession(userId, chatId, 'Идея тира');
    const prompt = await noteService.finalizeSession(userId);

    assert.ok(prompt.includes('ТЗ для агента'));
    assert.strictEqual(noteService.hasActiveSession(userId), false);
  });

  test('cancelSession removes active session', async () => {
    const noteService = new NoteService(aiService);
    const userId = 777;
    const chatId = 888;

    await noteService.startSession(userId, chatId, 'Идея');
    assert.ok(noteService.hasActiveSession(userId));

    const cancelled = noteService.cancelSession(userId);
    assert.strictEqual(cancelled, true);
    assert.strictEqual(noteService.hasActiveSession(userId), false);
  });
});
