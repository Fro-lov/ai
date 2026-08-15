import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';

import { env } from './config/env';
import { logger } from './utils/logger';
import { healthRoute } from './routes/health.route';
import { chatRoute } from './routes/chat.route';

async function buildServer() {
  const fastify = Fastify({
    logger: false,
  }).withTypeProvider<ZodTypeProvider>();

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  await fastify.register(cors);

  await fastify.register(healthRoute);
  await fastify.register(chatRoute);

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

  return fastify;
}

async function start() {
  const fastify = await buildServer();

  try {
    await fastify.listen({
      port: Number(env.PORT),
      host: env.HOST,
    });

    logger.info(
      `Server started on http://${env.HOST}:${env.PORT}`,
    );
  } catch (error) {
    logger.error(
      `Failed to start server: ${error instanceof Error ? error.message : String(error)}`,
    );

    process.exit(1);
  }
}

start();