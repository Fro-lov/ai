import { AIMessage } from '../ai';
import { AIService } from '../ai/ai.service';
import { ChatRequest, ChatResponse } from './chat.types';
import { logger } from '../utils/logger';
import { PromptService } from '../prompts/prompt.service';
import { RAGService } from '../vector/rag.service';

export class ChatService {
  constructor(
    private _aiService: AIService,
    private _promptService: PromptService,
    private _ragService?: RAGService
  ) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    logger.info('Chat request started');

    let messages: AIMessage[] = [];

    // Use provided messages if available (for conversation history)
    if (request.messages && request.messages.length > 0) {
      messages = [...request.messages];
    } else {
      // Build messages using prompt architecture
      const globalPrompt = this._promptService.getGlobalPrompt();
      const projectPrompt = this._promptService.getProjectPrompt(request.projectId);

      messages = this._promptService.buildMessages({
        globalPrompt,
        projectPrompt,
        history: [], // No history in simple request mode
        userMessage: request.message,
        projectId: request.projectId,
      });
    }

    // Retrieve RAG context if RAGService is available
    if (this._ragService && request.message) {
      try {
        const relevantChunks = await this._ragService.findRelevantChunks(request.message, 5, 0.25);
        if (relevantChunks.length > 0) {
          logger.info(`=== [RAG DEBUG LOGS] Found ${relevantChunks.length} relevant chunks for query: "${request.message}" ===`);
          relevantChunks.forEach((c, i) => {
            logger.info(`  [Chunk #${i + 1}] File: ${c.filePath} | Section: ${c.header} | Score: ${(c.score * 100).toFixed(1)}%`);
          });

          const ragContext = relevantChunks
            .map((c, i) => `--- [Чанк #${i + 1} | Файл: ${c.filePath} | Секция: ${c.header} | Релевантность: ${(c.score * 100).toFixed(1)}%] ---\n${c.content}`)
            .join('\n\n');

          const ragSystemMessage: AIMessage = {
            role: 'system',
            content: `[КРИТИЧЕСКИЙ КОНТЕКСТ СБОРКИ (OBSIDIAN / KUBEJS / ATM10)]
Ниже приведены официальные конфигурации и факты о сборке ATM10 Skyblock из базы знаний.

ПРАВИЛА И ПРИОРИТЕТ:
1. Информация в данном контексте обладает 100% ПРИОРИТЕТОМ над твоими базовыми знаниями о Minecraft модах.
2. Если в контексте написано, что предмет или рецепт УДАЛЕН ("Удален предмет/рецепт", "removals", "event.remove"), ты ОБЯЗАН отвечать, что данный предмет/рецепт УДАЛЕН на сервере/в сборке ATM10 Skyblock.
3. Если пользователь спрашивает про общее КОЛИЧЕСТВО или ЧИСЛО модов, квестов или скриптов (например, "сколько всего модов"), используй готовую суммарную цифру из секций статистики (например, "В сборке 243 мода"). НЕ пытайся считать элементы вручную по частичным спискам!
4. Не утверждай, что предмет существует, если в контексте написано, что он в списке удаленных.

ДАННЫЕ ИЗ БАЗЫ ЗНАНИЙ:
${ragContext}`,
          };

          // Insert RAG context right after the global system prompt
          messages.splice(1, 0, ragSystemMessage);
          logger.info(`Injected ${relevantChunks.length} RAG chunks into prompt context.`);
        } else {
          logger.info(`[RAG DEBUG] No relevant chunks found above minScore (0.25) for query: "${request.message}"`);
        }
      } catch (error) {
        logger.warn(`RAG retrieval failed: ${error instanceof Error ? error.message : String(error)}. Proceeding without RAG context.`);
      }
    }

    const response = await this._aiService.chat(
      {
        messages,
        model: request.model,
        maxTokens: request.maxTokens,
      },
      request.provider
    );

    logger.info('Chat request completed');

    return {
      content: response.content,
      model: response.model,
    };
  }
}
