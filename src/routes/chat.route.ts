import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';

import { chatRequestSchema } from '../chat/chat.schema';
import { ChatService } from '../chat/chat.service';
import { GroqProvider } from '../ai';

export async function chatRoute(fastify: FastifyInstance) {
  const aiProvider = new GroqProvider();
  const chatService = new ChatService(aiProvider);

  fastify
    .withTypeProvider<ZodTypeProvider>()
    .post(
      '/api/chat',
      {
        schema: {
          body: chatRequestSchema,
        },
      },
      async (request) => {
        return chatService.chat(request.body);
      },
    );
}