import dotenv from 'dotenv';
dotenv.config();

import { RAGService } from '../src/vector/rag.service';
import { AIService } from '../src/ai/ai.service';
import { GroqProvider } from '../src/ai';
import { PromptService } from '../src/prompts/prompt.service';
import { ChatService } from '../src/chat/chat.service';
import { env } from '../src/config/env';

async function runDemo() {
  console.log('====================================================');
  console.log('🚀 DEMO: ИСПЫТАНИЕ СИСТЕМЫ RAG + LLM (onter-ai)');
  console.log('====================================================\n');

  // Инициализация сервисов
  const ragService = new RAGService();
  await ragService.init();

  const aiService = new AIService([new GroqProvider()], env.AI_DEFAULT_PROVIDER);
  const promptService = new PromptService();
  const chatService = new ChatService(aiService, promptService, ragService);

  const testQuestions = [
    'На каких серверах развернуты ноды AmneziaWG / WireGuard и какие у них IP адреса?',
    'Какой IP-адрес и домен у сервера Minecraft SkyBlock?',
    'В какой базе данных хранятся пользователи VPN и на каком порту она работает?',
  ];

  const targetModel = 'qwen/qwen3.8-27b';

  for (let i = 0; i < testQuestions.length; i++) {
    const question = testQuestions[i];
    console.log(`\n----------------------------------------------------`);
    console.log(`❓ ТЕСТ #${i + 1}: ${question}`);
    console.log(`----------------------------------------------------`);

    // 1. Показываем, какие чанки нашел RAG
    const chunks = await ragService.findRelevantChunks(question, 3, 0.4);
    console.log(`\n🔍 НАЙДЕННЫЕ ЧАНКИ В OBSIDIAN (RAG):`);
    if (chunks.length === 0) {
      console.log('  (Чанки не найдены)');
    } else {
      chunks.forEach((c, idx) => {
        console.log(`  [${idx + 1}] ${c.filePath} | ${c.header} (Сходство: ${(c.score * 100).toFixed(1)}%)`);
      });
    }

    // 2. Получаем ответ от ИИ с подмешанным контекстом
    const startTime = Date.now();
    const response = await chatService.chat({
      message: question,
      provider: 'groq',
      model: targetModel,
    });
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`\n🤖 ОТВЕТ ИИ (Модель: ${response.model} | Время: ${duration}с):\n`);
    console.log(response.content);
    console.log('\n====================================================');
  }

  process.exit(0);
}

runDemo().catch(err => {
  console.error('Demo error:', err);
  process.exit(1);
});
