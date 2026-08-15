import { config } from 'dotenv';
import { z } from 'zod';
import { logger } from '../utils/logger';

config();

const envSchema = z.object({
  PORT: z.string().default('3001'),
  HOST: z.string().default('0.0.0.0'),
  GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY is required'),
  GROQ_MODEL: z.string().default('llama-3.1-8b-instant'),
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
