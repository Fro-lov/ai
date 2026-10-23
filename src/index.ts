import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { env } from './config/env';
import { logger } from './utils/logger';
import { AppError } from './utils/errors';
import { healthRoute } from './routes/health.route';
import { chatRoute } from './routes/chat.route';
import { adminRoute } from './routes/admin.route';
import { MemoryConversationStore } from './conversation/memory.store';
import { ConversationService } from './conversation/conversation.service';
import { ChatSessionRepository } from './conversation/chat-session.repository';
import { AIService } from './ai/ai.service';
import { GroqProvider, ArgonProvider, AntigravityProvider } from './ai';
import { ChatService } from './chat/chat.service';
import { TelegramService } from './telegram/telegram.service';
import { PromptService } from './prompts/prompt.service';
import { RAGService } from './vector/rag.service';

async function buildServer() {
  const fastify = Fastify({
    logger: false,
  }).withTypeProvider<ZodTypeProvider>();

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  await fastify.register(cors);

  // Initialize RAG Service & vector store
  const ragService = new RAGService();
  await ragService.init();

  // Initialize AI services
  const argonProvider = new ArgonProvider();
  const antigravityProvider = new AntigravityProvider();
  const aiService = new AIService([new GroqProvider(), argonProvider, antigravityProvider], env.AI_DEFAULT_PROVIDER);
  const promptService = new PromptService();
  const chatService = new ChatService(aiService, promptService, ragService);

  // Initialize conversation services
  const conversationStore = new MemoryConversationStore();
  const conversationService = new ConversationService(
    conversationStore,
    parseInt(env.CONVERSATION_HISTORY_LIMIT)
  );
  const chatSessionRepo = new ChatSessionRepository();
  await chatSessionRepo.init();

  // Initialize Telegram bot if enabled
  let telegramService: TelegramService | null = null;
  if (env.TELEGRAM_ENABLED === 'true' && env.TELEGRAM_BOT_TOKEN) {
    telegramService = new TelegramService(
      conversationService,
      chatService,
      promptService,
      aiService,
      undefined,
      argonProvider,
      undefined,
      antigravityProvider,
      chatSessionRepo
    );
  }

  await fastify.register(healthRoute);
  await fastify.register(chatRoute, chatService);
  await fastify.register(adminRoute, { argonProvider, aiService, ragService });

  fastify.setErrorHandler((error, request, reply) => {
    logger.error(`Error: ${error.message}`);

    if (error.validation) {
      return reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request',
        },
      });
    }

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    });
  });

  fastify.addHook('onRequest', (request, _reply, done) => {
    logger.info(`${request.method} ${request.url}`);
    done();
  });

  return { fastify, telegramService };
}

async function start() {
  const { fastify, telegramService } = await buildServer();

  try {
    await fastify.listen({
      port: Number(env.PORT),
      host: env.HOST,
    });

    logger.info(
      `Server started on http://${env.HOST}:${env.PORT}`,
    );

    // Start Telegram bot if enabled
    if (telegramService) {
      await telegramService.start();
    }
  } catch (error) {
    logger.error(
      `Failed to start server: ${error instanceof Error ? error.message : String(error)}`,
    );

    // eslint-disable-next-line no-undef
    process.exit(1);
  }
}

start();