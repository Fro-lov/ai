import { z } from 'zod';

export const chatRequestSchema = z.object({
  message: z.string().min(1, 'Message is required').max(20000, 'Message is too long'),
  systemPrompt: z.string().max(5000, 'System prompt is too long').optional(),
});

export type ChatRequestSchema = z.infer<typeof chatRequestSchema>;
