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
    .min(1, 'System prompt is required')
    .max(5_000, 'System prompt is too long')
    .optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;