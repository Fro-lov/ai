import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { chatRequestSchema } from '../chat/chat.schema';
import { ChatService } from '../chat/chat.service';
import { GroqProvider } from '../ai';
import { logger } from '../utils/logger';

export async function chatRoute(fastify: FastifyInstance) {
  const aiProvider = new GroqProvider();
  const chatService = new ChatService(aiProvider);

  fastify.withTypeProvider<ZodTypeProvider>().post(
    '/api/chat',
    {
      schema: {
        body: chatRequestSchema,
      },
    },
    async (request, reply) => {
      logger.info(`${request.method} ${request.url}`);

      const result = await chatService.chat(request.body);

      return result;
    }
  );
}
