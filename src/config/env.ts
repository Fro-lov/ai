import { config } from 'dotenv';
import { z } from 'zod';
import { logger } from '../utils/logger';

config();

const envSchema = z.object({
  PORT: z.string().default('3001'),
  HOST: z.string().default('0.0.0.0'),
  GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY is required'),
  GROQ_MODEL: z.string().default('llama-3.1-8b-instant'),
  AI_DEFAULT_PROVIDER: z.string().default('groq'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ENABLED: z.string().default('false'),
  TELEGRAM_SYSTEM_PROMPT: z.string().default('You are a helpful AI assistant. Answer briefly and to the point. Do not talk about your architecture, model, or internal limitations unless the user explicitly asks about it. Do not claim you don\'t remember previous messages if they are present in the provided context. Use the provided conversation history as context for the current conversation.'),
  CONVERSATION_HISTORY_LIMIT: z.string().default('10'),
  AI_MAX_TOKENS: z.string().default('300'),
});

type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVar = error.errors[0]?.path.join('.') || 'unknown';
      logger.error(`Missing required environment variable: ${missingVar}`);
      throw new Error(`Missing required environment variable: ${missingVar}`);
    }
    throw error;
  }
}

export const env = validateEnv();
