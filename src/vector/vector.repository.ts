import mysql from 'mysql2/promise';
import { Pool as PgPool } from 'pg';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';

export interface ChunkRecord {
  id?: number;
  projectId?: string;
  filePath: string;
  header: string;
  content: string;
  embedding: number[];
  score?: number;
}

export class VectorRepository {
  private pgPool: PgPool | null = null;
  private mysqlPool: mysql.Pool | null = null;
  private fallbackFilePath: string;
  private storageType: 'postgres' | 'mysql' | 'json' = 'json';

  constructor() {
    this.fallbackFilePath = path.join(process.cwd(), 'data', 'knowledge_chunks.json');
  }

  /**
   * Инициализация хранилища: сначала проверяется PostgreSQL, затем MariaDB/MySQL, затем локальный JSON.
   */
  async init(): Promise<void> {
    // 1. Пробуем подключиться к PostgreSQL + pgvector
    const pgHost = process.env.POSTGRES_HOST;
    const pgUser = process.env.POSTGRES_USER;
    if (pgHost && pgUser) {
      try {
        const pool = new PgPool({
          host: pgHost,
          port: Number(process.env.POSTGRES_PORT) || 5432,
          user: pgUser,
          password: process.env.POSTGRES_PASSWORD || 'onter_pg_pass_2026',
          database: process.env.POSTGRES_DB || 'onter_ai',
          max: 10,
        });

        // Проверяем соединение и наличие расширения pgvector
        const client = await pool.connect();
        try {
          await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
          await client.query(`
            CREATE TABLE IF NOT EXISTS knowledge_chunks (
              id SERIAL PRIMARY KEY,
              project_id VARCHAR(50) NOT NULL DEFAULT 'general',
              file_path VARCHAR(255) NOT NULL,
              header VARCHAR(255),
              content TEXT NOT NULL,
              embedding vector(384) NOT NULL,
              created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
              updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
          `);
          await client.query('CREATE INDEX IF NOT EXISTS idx_chunks_project ON knowledge_chunks(project_id);');
          await client.query('CREATE INDEX IF NOT EXISTS idx_chunks_file ON knowledge_chunks(file_path);');
          await client.query(`
            CREATE INDEX IF NOT EXISTS idx_chunks_vector 
            ON knowledge_chunks 
            USING hnsw (embedding vector_cosine_ops);
          `);
          
          this.pgPool = pool;
          this.storageType = 'postgres';
          logger.info('VectorRepository: Successfully connected to PostgreSQL (pgvector HNSW enabled).');
          return;
        } finally {
          client.release();
        }
      } catch (err) {
        logger.warn(`VectorRepository: Could not initialize PostgreSQL: ${err instanceof Error ? err.message : String(err)}. Falling back to MySQL/JSON.`);
      }
    }

    // 2. Фоллбэк: пробуем MariaDB/MySQL
    const mysqlHost = process.env.MYSQL_HOST;
    const mysqlUser = process.env.MYSQL_USER;
    if (mysqlHost && mysqlUser) {
      try {
        this.mysqlPool = mysql.createPool({
          host: mysqlHost,
          port: Number(process.env.MYSQL_PORT) || 3306,
          user: mysqlUser,
          password: process.env.MYSQL_PASSWORD,
          database: process.env.MYSQL_DATABASE || 'onter_ai',
          waitForConnections: true,
          connectionLimit: 10,
        });

        await this.mysqlPool.execute(`
          CREATE TABLE IF NOT EXISTS knowledge_chunks (
            id INT AUTO_INCREMENT PRIMARY KEY,
            project_id VARCHAR(50) DEFAULT 'general',
            file_path VARCHAR(255) NOT NULL,
            header VARCHAR(255),
            content TEXT NOT NULL,
            embedding LONGBLOB NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_file (file_path)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `);

        this.storageType = 'mysql';
        logger.info('VectorRepository: Successfully connected to MySQL.');
        return;
      } catch (err) {
        logger.warn(`VectorRepository: Could not connect to MySQL: ${err instanceof Error ? err.message : String(err)}. Falling back to local JSON.`);
      }
    }

    // 3. Локальный JSON фоллбэк
    this.storageType = 'json';
    this.ensureFallbackDir();
    logger.info('VectorRepository: Using local JSON vector storage.');
  }

  private ensureFallbackDir(): void {
    const dir = path.dirname(this.fallbackFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.fallbackFilePath)) {
      fs.writeFileSync(this.fallbackFilePath, JSON.stringify([]), 'utf-8');
    }
  }

  /**
   * Нативный векторный поиск в PostgreSQL (через HNSW индекс) с фильтрацией по projectId
   */
  async searchSimilar(
    queryEmbedding: number[],
    topK = 5,
    minScore = 0.25,
    projectId?: string
  ): Promise<ChunkRecord[]> {
    if (this.storageType === 'postgres' && this.pgPool) {
      const targetProject = (projectId || 'general').toLowerCase();
      const vectorStr = `[${queryEmbedding.join(',')}]`;

      const res = await this.pgPool.query(`
        SELECT 
          id,
          project_id,
          file_path,
          header,
          content,
          1 - (embedding <=> $1) AS score
        FROM knowledge_chunks
        WHERE (project_id = $2 OR project_id = 'general')
          AND (1 - (embedding <=> $1)) >= $3
        ORDER BY embedding <=> $1
        LIMIT $4;
      `, [vectorStr, targetProject, minScore, topK]);

      return res.rows.map((row: any) => ({
        id: row.id,
        projectId: row.project_id,
        filePath: row.file_path,
        header: row.header,
        content: row.content,
        embedding: [],
        score: Number(row.score),
      }));
    }

    // Фоллбэк: загрузка чанков и подсчёт косинусного сходства в памяти
    return this.searchInMemoryFallback(queryEmbedding, topK, minScore, projectId);
  }

  private async searchInMemoryFallback(
    queryEmbedding: number[],
    topK: number,
    minScore: number,
    projectId?: string
  ): Promise<ChunkRecord[]> {
    const allChunks = await this.getAllChunks();
    const targetProject = (projectId || 'general').toLowerCase();

    const scored = allChunks
      .filter(chunk => {
        if (!projectId) return true;
        const p = (chunk.projectId || 'general').toLowerCase();
        return p === targetProject || p === 'general';
      })
      .map(chunk => {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < queryEmbedding.length; i++) {
          dotProduct += queryEmbedding[i] * chunk.embedding[i];
          normA += queryEmbedding[i] * queryEmbedding[i];
          normB += chunk.embedding[i] * chunk.embedding[i];
        }
        const score = (normA === 0 || normB === 0) ? 0 : dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
        return { ...chunk, score };
      });

    return scored
      .filter(c => (c.score || 0) >= minScore)
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, topK);
  }

  /**
   * Сохранение чанков в базу
   */
  async saveChunks(chunks: ChunkRecord[]): Promise<void> {
    if (this.storageType === 'postgres' && this.pgPool) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');
        for (const chunk of chunks) {
          const vectorStr = `[${chunk.embedding.join(',')}]`;
          const proj = chunk.projectId || 'general';
          await client.query(
            `INSERT INTO knowledge_chunks (project_id, file_path, header, content, embedding)
             VALUES ($1, $2, $3, $4, $5)`,
            [proj, chunk.filePath, chunk.header, chunk.content, vectorStr]
          );
        }
        await client.query('COMMIT');
        logger.info(`VectorRepository: Saved ${chunks.length} chunks to PostgreSQL.`);
        return;
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error(`VectorRepository: Failed to save chunks to PostgreSQL: ${err}`);
        throw err;
      } finally {
        client.release();
      }
    }

    if (this.storageType === 'mysql' && this.mysqlPool) {
      const connection = await this.mysqlPool.getConnection();
      try {
        await connection.beginTransaction();
        for (const chunk of chunks) {
          const floatArray = new Float32Array(chunk.embedding);
          const buffer = Buffer.from(floatArray.buffer, floatArray.byteOffset, floatArray.byteLength);
          await connection.execute(
            `INSERT INTO knowledge_chunks (project_id, file_path, header, content, embedding) VALUES (?, ?, ?, ?, ?)`,
            [chunk.projectId || 'general', chunk.filePath, chunk.header, chunk.content, buffer]
          );
        }
        await connection.commit();
        logger.info(`VectorRepository: Saved ${chunks.length} chunks to MySQL.`);
        return;
      } catch (err) {
        await connection.rollback();
        logger.error(`VectorRepository: Failed to save chunks to MySQL: ${err}`);
        throw err;
      } finally {
        connection.release();
      }
    }

    this.saveToFallback(chunks);
  }

  async clearAll(): Promise<void> {
    if (this.storageType === 'postgres' && this.pgPool) {
      await this.pgPool.query('TRUNCATE TABLE knowledge_chunks RESTART IDENTITY;');
      logger.info('VectorRepository: Cleared PostgreSQL knowledge_chunks table.');
      return;
    }
    if (this.storageType === 'mysql' && this.mysqlPool) {
      await this.mysqlPool.execute('TRUNCATE TABLE knowledge_chunks');
      logger.info('VectorRepository: Cleared MySQL knowledge_chunks table.');
      return;
    }
    this.ensureFallbackDir();
    fs.writeFileSync(this.fallbackFilePath, JSON.stringify([]), 'utf-8');
    logger.info('VectorRepository: Cleared local JSON vector storage.');
  }

  async getAllChunks(): Promise<ChunkRecord[]> {
    if (this.storageType === 'postgres' && this.pgPool) {
      const res = await this.pgPool.query(
        'SELECT id, project_id, file_path, header, content, embedding::text FROM knowledge_chunks'
      );
      return res.rows.map((row: any) => {
        const raw = row.embedding as string;
        const embedding = raw.replace(/[\[\]]/g, '').split(',').map(Number);
        return {
          id: row.id,
          projectId: row.project_id,
          filePath: row.file_path,
          header: row.header,
          content: row.content,
          embedding,
        };
      });
    }

    if (this.storageType === 'mysql' && this.mysqlPool) {
      const [rows] = await this.mysqlPool.query<mysql.RowDataPacket[]>(
        'SELECT id, project_id, file_path, header, content, embedding FROM knowledge_chunks'
      );
      return rows.map(row => {
        const buffer = row.embedding as Buffer;
        const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
        return {
          id: row.id,
          projectId: row.project_id || 'general',
          filePath: row.file_path,
          header: row.header,
          content: row.content,
          embedding: Array.from(floatArray),
        };
      });
    }

    return this.loadFromFallback();
  }

  async getChunkCount(): Promise<{ total: number; storage: 'postgres' | 'mysql' | 'json'; error?: string }> {
    if (this.storageType === 'postgres' && this.pgPool) {
      try {
        const res = await this.pgPool.query('SELECT COUNT(*) FROM knowledge_chunks');
        return { total: Number(res.rows[0].count), storage: 'postgres' };
      } catch (err) {
        return { total: 0, storage: 'postgres', error: err instanceof Error ? err.message : String(err) };
      }
    }
    if (this.storageType === 'mysql' && this.mysqlPool) {
      try {
        const [rows] = await this.mysqlPool.query<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM knowledge_chunks');
        const count = (rows[0] as any)?.cnt ?? 0;
        return { total: Number(count), storage: 'mysql' };
      } catch (err) {
        return { total: 0, storage: 'mysql', error: err instanceof Error ? err.message : String(err) };
      }
    }
    const chunks = this.loadFromFallback();
    return { total: chunks.length, storage: 'json' };
  }

  private saveToFallback(chunks: ChunkRecord[]): void {
    this.ensureFallbackDir();
    let current: ChunkRecord[] = [];
    if (fs.existsSync(this.fallbackFilePath)) {
      try {
        current = JSON.parse(fs.readFileSync(this.fallbackFilePath, 'utf-8'));
      } catch {
        current = [];
      }
    }
    current.push(...chunks);
    fs.writeFileSync(this.fallbackFilePath, JSON.stringify(current, null, 2), 'utf-8');
    logger.info(`VectorRepository: Saved ${chunks.length} chunks to JSON fallback.`);
  }

  private loadFromFallback(): ChunkRecord[] {
    this.ensureFallbackDir();
    try {
      return JSON.parse(fs.readFileSync(this.fallbackFilePath, 'utf-8'));
    } catch {
      return [];
    }
  }
}
