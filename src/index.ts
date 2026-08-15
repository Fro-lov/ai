import Fastify from 'fastify';
import cors from '@fastify/cors';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { env } from './config/env';
import { logger } from './utils/logger';
import { healthRoute } from './routes/health.route';
import { chatRoute } from './routes/chat.route';

async function buildServer() {
  const fastify = Fastify({
    logger: false,
  }).withTypeProvider<ZodTypeProvider>();

  await fastify.register(cors);

  await fastify.register(healthRoute);
  await fastify.register(chatRoute);

  fastify.setErrorHandler((error, request, reply) => {
    logger.error(`Error: ${error.message}`);

    if (error.validation) {
      reply.status(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request',
        },
      });
      return;
    }

    reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    });
  });

  fastify.addHook('onRequest', (request, reply, done) => {
    logger.info(`${request.method} ${request.url}`);
    done();
  });

  return fastify;
}

async function start() {
  const fastify = await buildServer();

  try {
    await fastify.listen({ port: parseInt(env.PORT), host: env.HOST });
    logger.info(`Server started on http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    logger.error('Failed to start server');
    process.exit(1);
  }
}

start();
