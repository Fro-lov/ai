import { Pool } from 'pg';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface IdeaRecord {
  id: number;
  userId: number;
  chatId?: number;
  telegramMessageId?: number;
  projectId: string;
  title: string;
  rawIdea: string;
  clarificationSteps: Array<{ question: string; options: string[]; answer: string }>;
  specification: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export class IdeaRepository {
  private pool: Pool | null = null;
  private isConnected: boolean = false;

  constructor() {
    this.initPool();
  }

  private initPool(): void {
    try {
      this.pool = new Pool({
        host: env.POSTGRES_HOST,
        port: Number(env.POSTGRES_PORT) || 5432,
        user: env.POSTGRES_USER,
        password: env.POSTGRES_PASSWORD,
        database: env.POSTGRES_DB,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 3000,
      });

      this.pool.on('error', (err) => {
        logger.error(`PostgreSQL pool error: ${err.message}`);
      });
    } catch (err) {
      logger.error(`Failed to create PostgreSQL pool: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async init(): Promise<void> {
    if (!this.pool) return;

    try {
      const client = await this.pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS ideas (
            id SERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            chat_id BIGINT,
            telegram_message_id BIGINT,
            project_id VARCHAR(50) NOT NULL DEFAULT 'general',
            title VARCHAR(255) NOT NULL,
            raw_idea TEXT NOT NULL,
            clarification_steps JSONB NOT NULL DEFAULT '[]'::jsonb,
            specification TEXT NOT NULL,
            status VARCHAR(30) NOT NULL DEFAULT 'new',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);

        await client.query('CREATE INDEX IF NOT EXISTS idx_ideas_project ON ideas(project_id);');
        await client.query('CREATE INDEX IF NOT EXISTS idx_ideas_user ON ideas(user_id);');
        await client.query('CREATE INDEX IF NOT EXISTS idx_ideas_msg ON ideas(telegram_message_id);');

        // Check if telegram_message_id column exists (for backwards compatibility if table was created without it)
        await client.query(`
          ALTER TABLE ideas ADD COLUMN IF NOT EXISTS telegram_message_id BIGINT;
          ALTER TABLE ideas ADD COLUMN IF NOT EXISTS chat_id BIGINT;
          ALTER TABLE ideas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        `);

        this.isConnected = true;
        logger.info('IdeaRepository: successfully connected to PostgreSQL and verified ideas table.');
      } finally {
        client.release();
      }
    } catch (err) {
      logger.warn(`IdeaRepository: PostgreSQL not reachable (${err instanceof Error ? err.message : String(err)}). Ideas will run with fallback.`);
      this.isConnected = false;
    }
  }

  async saveIdea(data: {
    userId: number;
    chatId?: number;
    telegramMessageId?: number;
    projectId?: string;
    title: string;
    rawIdea: string;
    clarificationSteps: any[];
    specification: string;
    status?: string;
  }): Promise<number | null> {
    if (!this.pool || !this.isConnected) {
      logger.warn('IdeaRepository: DB not connected, cannot save idea.');
      return null;
    }

    try {
      const query = `
        INSERT INTO ideas (user_id, chat_id, telegram_message_id, project_id, title, raw_idea, clarification_steps, specification, status, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
        RETURNING id;
      `;
      const res = await this.pool.query(query, [
        data.userId,
        data.chatId || null,
        data.telegramMessageId || null,
        data.projectId || 'general',
        data.title,
        data.rawIdea,
        JSON.stringify(data.clarificationSteps || []),
        data.specification,
        data.status || 'new',
      ]);

      const id = res.rows[0]?.id;
      logger.info(`IdeaRepository: saved idea #${id} for user ${data.userId} (project: ${data.projectId || 'general'})`);
      return id;
    } catch (err) {
      logger.error(`IdeaRepository.saveIdea failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async linkTelegramMessage(ideaId: number, messageId: number, chatId?: number): Promise<void> {
    if (!this.pool || !this.isConnected) return;

    try {
      await this.pool.query(
        'UPDATE ideas SET telegram_message_id = $1, chat_id = COALESCE($2, chat_id), updated_at = CURRENT_TIMESTAMP WHERE id = $3',
        [messageId, chatId || null, ideaId]
      );
      logger.info(`IdeaRepository: linked idea #${ideaId} to telegram message ${messageId}`);
    } catch (err) {
      logger.error(`IdeaRepository.linkTelegramMessage failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async getIdeaByMessageId(chatId: number, messageId: number): Promise<IdeaRecord | null> {
    if (!this.pool || !this.isConnected) return null;

    try {
      const res = await this.pool.query(
        'SELECT * FROM ideas WHERE telegram_message_id = $1 ORDER BY id DESC LIMIT 1',
        [messageId]
      );

      if (res.rows.length === 0) return null;
      return this.mapRow(res.rows[0]);
    } catch (err) {
      logger.error(`IdeaRepository.getIdeaByMessageId failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async getIdeaById(id: number): Promise<IdeaRecord | null> {
    if (!this.pool || !this.isConnected) return null;

    try {
      const res = await this.pool.query('SELECT * FROM ideas WHERE id = $1', [id]);
      if (res.rows.length === 0) return null;
      return this.mapRow(res.rows[0]);
    } catch (err) {
      logger.error(`IdeaRepository.getIdeaById failed: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }
  }

  async getUserIdeas(userId: number, limit: number = 10): Promise<IdeaRecord[]> {
    if (!this.pool || !this.isConnected) return [];

    try {
      const res = await this.pool.query(
        'SELECT * FROM ideas WHERE user_id = $1 ORDER BY id DESC LIMIT $2',
        [userId, limit]
      );
      return res.rows.map(row => this.mapRow(row));
    } catch (err) {
      logger.error(`IdeaRepository.getUserIdeas failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  async updateSpecification(id: number, newSpecification: string, newTitle?: string): Promise<boolean> {
    if (!this.pool || !this.isConnected) return false;

    try {
      if (newTitle) {
        await this.pool.query(
          'UPDATE ideas SET specification = $1, title = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [newSpecification, newTitle, id]
        );
      } else {
        await this.pool.query(
          'UPDATE ideas SET specification = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [newSpecification, id]
        );
      }
      logger.info(`IdeaRepository: updated specification for idea #${id}`);
      return true;
    } catch (err) {
      logger.error(`IdeaRepository.updateSpecification failed: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  private mapRow(row: any): IdeaRecord {
    return {
      id: Number(row.id),
      userId: Number(row.user_id),
      chatId: row.chat_id ? Number(row.chat_id) : undefined,
      telegramMessageId: row.telegram_message_id ? Number(row.telegram_message_id) : undefined,
      projectId: row.project_id || 'general',
      title: row.title || 'Без названия',
      rawIdea: row.raw_idea || '',
      clarificationSteps: Array.isArray(row.clarification_steps)
        ? row.clarification_steps
        : typeof row.clarification_steps === 'string'
          ? JSON.parse(row.clarification_steps)
          : [],
      specification: row.specification || '',
      status: row.status || 'new',
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at || row.created_at),
    };
  }
}
