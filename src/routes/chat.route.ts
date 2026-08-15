import { FastifyInstance } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';

import {
  chatRequestSchema,
  chatResponseSchema,
} from '../chat/chat.schema';

import { ChatService } from '../chat/chat.service';

export async function chatRoute(fastify: FastifyInstance, chatService: ChatService) {

  fastify
    .withTypeProvider<ZodTypeProvider>()
    .post(
      '/api/chat',
      {
        schema: {
          body: chatRequestSchema,
          response: {
            200: chatResponseSchema,
          },
        },
      },
      async (request) => {
        return chatService.chat(request.body);
      },
    );
}