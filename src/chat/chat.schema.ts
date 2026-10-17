import { z } from 'zod';

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

  projectId: z
    .string()
    .trim()
    .optional(),

  userId: z
    .string()
    .trim()
    .optional(),

  messages: z.array(z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
  })).optional(),
});

export const chatResponseSchema = z.object({
  content: z.string(),
  model: z.string(),
  files: z.array(z.object({
    path: z.string(),
    filename: z.string().optional(),
    caption: z.string().optional(),
  })).optional(),
  actions: z.array(z.string()).optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;