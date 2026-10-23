import { Pool } from 'pg';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface ChatSessionRecord {
  id: number;
  userId: number;
  conversationId: string;
  title: string;
  provider: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class ChatSessionRepository {
  private pool: Pool | null = null;
  private isConnected: boolean = false;
  private fallbackSessions: Map<number, ChatSessionRecord[]> = new Map();
  private nextFallbackId: number = 1;

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
        logger.error(`ChatSessionRepository pool error: ${err.message}`);
      });
    } catch (err) {
      logger.error(`Failed to create PostgreSQL pool for ChatSessionRepository: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async init(): Promise<void> {
    if (!this.pool) return;

    try {
      const client = await this.pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS chat_sessions (
            id SERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            conversation_id VARCHAR(128) NOT NULL,
            title VARCHAR(255) NOT NULL,
            provider VARCHAR(64) NOT NULL DEFAULT 'antigravity',
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions (user_id);
        `);
        this.isConnected = true;
        logger.info('ChatSessionRepository: successfully connected to PostgreSQL and verified chat_sessions table.');
      } finally {
        client.release();
      }
    } catch (err) {
      this.isConnected = false;
      logger.warn(`ChatSessionRepository: PostgreSQL not reachable (${err instanceof Error ? err.message : String(err)}). Sessions will run with in-memory fallback.`);
    }
  }

  async getSessions(userId: number): Promise<ChatSessionRecord[]> {
    if (this.isConnected && this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT id, user_id, conversation_id, title, provider, is_active, created_at, updated_at
           FROM chat_sessions
           WHERE user_id = $1
           ORDER BY is_active DESC, updated_at DESC`,
          [userId]
        );
        return res.rows.map(row => ({
          id: Number(row.id),
          userId: Number(row.user_id),
          conversationId: row.conversation_id,
          title: row.title,
          provider: row.provider,
          isActive: Boolean(row.is_active),
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
        }));
      } catch (err) {
        logger.error(`Error fetching chat sessions from PostgreSQL: ${err}`);
      }
    }

    const list = this.fallbackSessions.get(userId) || [];
    return [...list].sort((a, b) => (b.isActive ? 1 : 0) - (a.isActive ? 1 : 0));
  }

  async getActiveSession(userId: number): Promise<ChatSessionRecord> {
    const sessions = await this.getSessions(userId);
    const active = sessions.find(s => s.isActive);
    if (active) return active;

    if (sessions.length > 0) {
      await this.setActiveSession(userId, sessions[0].id);
      sessions[0].isActive = true;
      return sessions[0];
    }

    // Create initial default session
    return await this.createSession(userId, 'Основной чат');
  }

  async setActiveSession(userId: number, sessionId: number): Promise<ChatSessionRecord | null> {
    if (this.isConnected && this.pool) {
      try {
        await this.pool.query(
          `UPDATE chat_sessions SET is_active = false, updated_at = NOW() WHERE user_id = $1`,
          [userId]
        );
        const res = await this.pool.query(
          `UPDATE chat_sessions SET is_active = true, updated_at = NOW() WHERE user_id = $1 AND id = $2 RETURNING *`,
          [userId, sessionId]
        );
        if (res.rows.length > 0) {
          const row = res.rows[0];
          return {
            id: Number(row.id),
            userId: Number(row.user_id),
            conversationId: row.conversation_id,
            title: row.title,
            provider: row.provider,
            isActive: true,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
          };
        }
      } catch (err) {
        logger.error(`Error setting active session in PostgreSQL: ${err}`);
      }
    }

    const list = this.fallbackSessions.get(userId) || [];
    let found: ChatSessionRecord | null = null;
    for (const s of list) {
      if (s.id === sessionId) {
        s.isActive = true;
        s.updatedAt = new Date();
        found = s;
      } else {
        s.isActive = false;
      }
    }
    return found;
  }

  async createSession(userId: number, title?: string, conversationId = ''): Promise<ChatSessionRecord> {
    const finalTitle = title || `Диалог #${(await this.getSessions(userId)).length + 1}`;

    if (this.isConnected && this.pool) {
      try {
        await this.pool.query(
          `UPDATE chat_sessions SET is_active = false, updated_at = NOW() WHERE user_id = $1`,
          [userId]
        );
        const res = await this.pool.query(
          `INSERT INTO chat_sessions (user_id, conversation_id, title, provider, is_active, created_at, updated_at)
           VALUES ($1, $2, $3, 'antigravity', true, NOW(), NOW())
           RETURNING *`,
          [userId, conversationId, finalTitle]
        );
        const row = res.rows[0];
        return {
          id: Number(row.id),
          userId: Number(row.user_id),
          conversationId: row.conversation_id,
          title: row.title,
          provider: row.provider,
          isActive: true,
          createdAt: new Date(row.created_at),
          updatedAt: new Date(row.updated_at),
        };
      } catch (err) {
        logger.error(`Error creating chat session in PostgreSQL: ${err}`);
      }
    }

    // In-memory fallback
    const list = this.fallbackSessions.get(userId) || [];
    for (const s of list) {
      s.isActive = false;
    }
    const newSession: ChatSessionRecord = {
      id: this.nextFallbackId++,
      userId,
      conversationId,
      title: finalTitle,
      provider: 'antigravity',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    list.push(newSession);
    this.fallbackSessions.set(userId, list);
    return newSession;
  }

  async updateSession(id: number, updates: { title?: string; conversationId?: string }): Promise<void> {
    if (this.isConnected && this.pool) {
      try {
        const fields: string[] = ['updated_at = NOW()'];
        const values: any[] = [id];
        let idx = 2;

        if (updates.title !== undefined) {
          fields.push(`title = $${idx++}`);
          values.push(updates.title);
        }
        if (updates.conversationId !== undefined) {
          fields.push(`conversation_id = $${idx++}`);
          values.push(updates.conversationId);
        }

        await this.pool.query(
          `UPDATE chat_sessions SET ${fields.join(', ')} WHERE id = $1`,
          values
        );
        return;
      } catch (err) {
        logger.error(`Error updating chat session in PostgreSQL: ${err}`);
      }
    }

    // Fallback update
    for (const list of this.fallbackSessions.values()) {
      const s = list.find(item => item.id === id);
      if (s) {
        if (updates.title !== undefined) s.title = updates.title;
        if (updates.conversationId !== undefined) s.conversationId = updates.conversationId;
        s.updatedAt = new Date();
        break;
      }
    }
  }

  async deleteSession(userId: number, id: number): Promise<boolean> {
    if (this.isConnected && this.pool) {
      try {
        await this.pool.query(`DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2`, [id, userId]);
        return true;
      } catch (err) {
        logger.error(`Error deleting chat session in PostgreSQL: ${err}`);
      }
    }

    const list = this.fallbackSessions.get(userId) || [];
    const idx = list.findIndex(s => s.id === id);
    if (idx !== -1) {
      list.splice(idx, 1);
      return true;
    }
    return false;
  }
}
