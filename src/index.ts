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
import { MemoryConversationStore } from './conversation/memory.store';
import { ConversationService } from './conversation/conversation.service';
import { AIService } from './ai/ai.service';
import { GroqProvider } from './ai';
import { ChatService } from './chat/chat.service';
import { TelegramService } from './telegram/telegram.service';

async function buildServer() {
  const fastify = Fastify({
    logger: false,
  }).withTypeProvider<ZodTypeProvider>();

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  await fastify.register(cors);

  // Initialize AI services
  const aiService = new AIService([new GroqProvider()], env.AI_DEFAULT_PROVIDER);
  const chatService = new ChatService(aiService);

  // Initialize conversation services
  const conversationStore = new MemoryConversationStore();
  const conversationService = new ConversationService(
    conversationStore,
    parseInt(env.CONVERSATION_HISTORY_LIMIT)
  );

  // Initialize Telegram bot if enabled
  let telegramService: TelegramService | null = null;
  if (env.TELEGRAM_ENABLED === 'true' && env.TELEGRAM_BOT_TOKEN) {
    telegramService = new TelegramService(conversationService, chatService);
  }

  await fastify.register(healthRoute);
  await fastify.register(chatRoute, chatService);

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

    process.exit(1);
  }
}

start();