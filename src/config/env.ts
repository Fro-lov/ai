import { config } from 'dotenv';
import { z } from 'zod';

config();

const envSchema = z.object({
  PORT: z.string().default('3001'),
  HOST: z.string().default('0.0.0.0'),
  GROQ_API_KEY: z.string().min(1, 'GROQ_API_KEY is required'),
  GROQ_MODEL: z.string().default('llama-3.1-8b-instant'),
  AI_DEFAULT_PROVIDER: z.string().default('groq'),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_ENABLED: z.string().default('false'),
  TELEGRAM_SYSTEM_PROMPT: z.string().default('You are a helpful AI assistant. Answer briefly and to the point, unless the user asks for a detailed explanation. Use the provided conversation history as real context for the current conversation. Do not claim you don\'t remember previous messages if they are present in the provided context. Do not invent information about your architecture, training, creators, internal technologies, or model unless explicitly asked. If model information is provided in the runtime context, you may use it; otherwise, honestly state that it is unavailable. When the user asks about a previous message, answer specifically about the message BEFORE the current question. Do not assert that you use BERT, Python, or other technologies unless explicitly provided in the context.'),
  CONVERSATION_HISTORY_LIMIT: z.string().default('10'),
  AI_MAX_TOKENS: z.string().default('800'),
  AI_SYSTEM_PROMPT: z.string().min(1, 'AI_SYSTEM_PROMPT is required'),
  AI_PROJECT_PROMPT_ONTER_AI: z.string().optional(),
  AI_PROJECT_PROMPT_MINECRAFT: z.string().optional(),
  AI_PROJECT_PROMPT_SCRAP_EVOLUTION: z.string().optional(),
  ADMIN_TELEGRAM_IDS: z.string().default(''),
  ARGON_ENGINE_URL: z.string().default('http://127.0.0.1:8085'),
  ARGON_SECRET_TOKEN: z.string().default('onter_argon_secret_2026'),
  ANTIGRAVITY_BIN_PATH: z.string().default(process.platform === 'win32' ? 'agy' : '/home/opc/.local/bin/agy'),
  ANTIGRAVITY_WORKSPACE: z.string().default(process.platform === 'win32' ? './workspace' : '/workspace'),
  POSTGRES_HOST: z.string().default('127.0.0.1'),
  POSTGRES_PORT: z.string().default('5432'),
  POSTGRES_USER: z.string().default('onter_ai'),
  POSTGRES_PASSWORD: z.string().default('onter_pg_pass_2026'),
  POSTGRES_DB: z.string().default('onter_ai'),
});

type Env = z.infer<typeof envSchema>;

function validateEnv(): Env {
  try {
    // eslint-disable-next-line no-undef
    return envSchema.parse(process.env || {});
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVar = error.errors[0]?.path.join('.') || 'unknown';
      throw new Error(`Missing or invalid environment variable: ${missingVar}`);
    }
    throw new Error('Failed to validate environment variables');
  }
}

export const env = validateEnv();
