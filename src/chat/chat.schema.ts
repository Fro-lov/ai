import { z } from 'zod';
import { AIMessage } from '../ai';

export const chatRequestSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, 'Message is required')
    .max(20_000, 'Message is too long'),

  systemPrompt: z
    .string()
    .trim()
    .max(5_000, 'System prompt is too long')
    .optional(),

  provider: z
    .string()
    .trim()
    .optional(),

  model: z
    .string()
    .trim()
    .optional(),

  maxTokens: z
    .number()
    .optional(),

  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  })).optional(),
});

export const chatResponseSchema = z.object({
  content: z.string(),
  model: z.string(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;