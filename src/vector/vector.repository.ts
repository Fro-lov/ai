import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface ChunkRecord {
  id?: number;
  filePath: string;
  header: string;
  content: string;
  embedding: number[];
}

export class VectorRepository {
  private pool: mysql.Pool | null = null;
  private fallbackFilePath: string;
  private useFallback = false;

  constructor() {
    this.fallbackFilePath = path.join(process.cwd(), 'data', 'knowledge_chunks.json');
  }

  /**
   * Initialize MySQL pool if credentials exist, otherwise default to local file storage.
   */
  async init(): Promise<void> {
    const host = process.env.MYSQL_HOST;
    const user = process.env.MYSQL_USER;
    const password = process.env.MYSQL_PASSWORD;
    const database = process.env.MYSQL_DATABASE || 'onter_ai';
    const port = Number(process.env.MYSQL_PORT) || 3306;

    if (!host || !user) {
      logger.info('MySQL environment variables not fully configured. Using local JSON vector storage.');
      this.useFallback = true;
      this.ensureFallbackDir();
      return;
    }

    try {
      this.pool = mysql.createPool({
        host,
        port,
        user,
        password,
        database,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });

      // Ensure table exists
      await this.pool.execute(`
        CREATE TABLE IF NOT EXISTS knowledge_chunks (
          id INT AUTO_INCREMENT PRIMARY KEY,
          file_path VARCHAR(255) NOT NULL,
          header VARCHAR(255),
          content TEXT NOT NULL,
          embedding LONGBLOB NOT NULL,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_file (file_path)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);

      logger.info('Successfully connected to MySQL and verified knowledge_chunks table.');
    } catch (error) {
      logger.warn(`Could not connect to MySQL: ${error instanceof Error ? error.message : String(error)}. Falling back to local file storage.`);
      this.useFallback = true;
      this.ensureFallbackDir();
    }
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
   * Save chunks with binary vector embeddings
   */
  async saveChunks(chunks: ChunkRecord[]): Promise<void> {
    if (this.useFallback || !this.pool) {
      this.saveToFallback(chunks);
      return;
    }

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();

      for (const chunk of chunks) {
        // Convert number[] vector to Float32Array binary buffer
        const floatArray = new Float32Array(chunk.embedding);
        const buffer = Buffer.from(floatArray.buffer, floatArray.byteOffset, floatArray.byteLength);

        await connection.execute(
          `INSERT INTO knowledge_chunks (file_path, header, content, embedding) VALUES (?, ?, ?, ?)`,
          [chunk.filePath, chunk.header, chunk.content, buffer]
        );
      }

      await connection.commit();
      logger.info(`Saved ${chunks.length} chunks to MySQL knowledge_chunks table.`);
    } catch (error) {
      await connection.rollback();
      logger.error(`Failed to save chunks to MySQL: ${error}`);
      throw error;
    } finally {
      connection.release();
    }
  }

  private memoryCache: ChunkRecord[] | null = null;

  /**
   * Clears existing chunks for a file or all chunks
   */
  async clearAll(): Promise<void> {
    if (this.useFallback || !this.pool) {
      this.ensureFallbackDir();
      this.memoryCache = [];
      fs.writeFileSync(this.fallbackFilePath, JSON.stringify([]), 'utf-8');
      logger.info('Cleared local JSON vector storage.');
      return;
    }

    await this.pool.execute(`TRUNCATE TABLE knowledge_chunks`);
    logger.info('Cleared MySQL knowledge_chunks table.');
  }

  /**
   * Load all chunks and vectors from MySQL or local storage into memory for search
   */
  async getAllChunks(): Promise<ChunkRecord[]> {
    if (this.useFallback || !this.pool) {
      return this.loadFromFallback();
    }

    const [rows] = await this.pool.query<mysql.RowDataPacket[]>(
      `SELECT id, file_path, header, content, embedding FROM knowledge_chunks`
    );

    return rows.map(row => {
      const buffer = row.embedding as Buffer;
      const floatArray = new Float32Array(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength / 4
      );
      const embedding = Array.from(floatArray);

      return {
        id: row.id,
        filePath: row.file_path,
        header: row.header,
        content: row.content,
        embedding,
      };
    });
  }

  async getChunkCount(): Promise<{ total: number; storage: 'mysql' | 'json'; error?: string }> {
    if (this.useFallback || !this.pool) {
      const chunks = this.loadFromFallback();
      return { total: chunks.length, storage: 'json' };
    }
    try {
      const [rows] = await this.pool.query<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM knowledge_chunks');
      const count = (rows[0] as any)?.cnt ?? 0;
      return { total: Number(count), storage: 'mysql' };
    } catch (err) {
      return { total: 0, storage: 'mysql', error: err instanceof Error ? err.message : String(err) };
    }
  }

  private saveToFallback(chunks: ChunkRecord[]): void {
    this.ensureFallbackDir();
    const existing = this.loadFromFallback();
    const updated = [...existing, ...chunks];
    this.memoryCache = updated;
    const tempPath = `${this.fallbackFilePath}.tmp`;
    try {
      fs.writeFileSync(tempPath, JSON.stringify(updated), 'utf-8');
      fs.renameSync(tempPath, this.fallbackFilePath);
    } catch {
      // Fallback direct write if rename fails
      fs.writeFileSync(this.fallbackFilePath, JSON.stringify(updated), 'utf-8');
    }
    logger.info(`Saved ${chunks.length} chunks to local JSON (${this.fallbackFilePath}). Total: ${updated.length}`);
  }

  private loadFromFallback(): ChunkRecord[] {
    if (this.memoryCache !== null) {
      return this.memoryCache;
    }
    this.ensureFallbackDir();
    try {
      const data = fs.readFileSync(this.fallbackFilePath, 'utf-8');
      this.memoryCache = JSON.parse(data) as ChunkRecord[];
      return this.memoryCache;
    } catch {
      this.memoryCache = [];
      return [];
    }
  }
}
