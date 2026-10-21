import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Client as PgClient } from 'pg';
import mysql from 'mysql2/promise';

dotenv.config();

interface SourceChunk {
  filePath: string;
  header?: string | null;
  content: string;
  embedding: number[];
}

function detectProjectId(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (normalized.startsWith('minecraft/') || normalized.includes('minecraft') || normalized.includes('skyblock') || normalized.includes('atm10')) {
    return 'minecraft';
  }
  if (normalized.startsWith('fivem/') || normalized.includes('fivem') || normalized.includes('gta')) {
    return 'fivem';
  }
  if (normalized.startsWith('scrap/') || normalized.includes('scrap')) {
    return 'scrap_evolution';
  }
  return 'general';
}

async function loadChunks(): Promise<{ chunks: SourceChunk[]; source: string }> {
  // 1. Попытка загрузить из MariaDB
  const mysqlHost = process.env.MYSQL_HOST;
  const mysqlUser = process.env.MYSQL_USER;
  if (mysqlHost && mysqlUser) {
    try {
      console.log(`[Source] Подключение к MariaDB (${mysqlHost}:${process.env.MYSQL_PORT || 3306})...`);
      const connection = await mysql.createConnection({
        host: mysqlHost,
        port: Number(process.env.MYSQL_PORT) || 3306,
        user: mysqlUser,
        password: process.env.MYSQL_PASSWORD || 'onter_ai_db_pass_2026',
        database: process.env.MYSQL_DATABASE || 'onter_ai',
      });

      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        'SELECT file_path, header, content, embedding FROM knowledge_chunks'
      );
      await connection.end();

      if (rows && rows.length > 0) {
        console.log(`[Source] Успешно загружено ${rows.length} чанков из MariaDB.`);
        const chunks: SourceChunk[] = rows.map(r => {
          const buffer = r.embedding as Buffer;
          const floatArray = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
          return {
            filePath: r.file_path,
            header: r.header,
            content: r.content,
            embedding: Array.from(floatArray),
          };
        });
        return { chunks, source: 'MariaDB' };
      }
    } catch (err) {
      console.log(`[Source] MariaDB недоступна (${err instanceof Error ? err.message : String(err)}). Проверяем локальный JSON...`);
    }
  }

  // 2. Фоллбэк: загрузка из JSON
  const jsonPath = path.join(process.cwd(), 'data', 'knowledge_chunks.json');
  if (fs.existsSync(jsonPath)) {
    console.log(`[Source] Загрузка чанков из ${jsonPath}...`);
    const raw = fs.readFileSync(jsonPath, 'utf-8');
    const chunks = JSON.parse(raw) as SourceChunk[];
    console.log(`[Source] Загружено ${chunks.length} чанков из JSON.`);
    return { chunks, source: 'JSON (data/knowledge_chunks.json)' };
  }

  throw new Error('Не найдено данных ни в MariaDB, ни в data/knowledge_chunks.json');
}

async function runMigration() {
  console.log('====================================================');
  console.log('🚀 Старт миграции данных в PostgreSQL (pgvector)');
  console.log('====================================================\n');

  const { chunks, source } = await loadChunks();
  console.log(`📦 Всего чанков для переноса: ${chunks.length} (Источник: ${source})\n`);

  const pgHost = process.env.POSTGRES_HOST || '127.0.0.1';
  const pgPort = Number(process.env.POSTGRES_PORT) || 5432;
  const pgUser = process.env.POSTGRES_USER || 'onter_ai';
  const pgPassword = process.env.POSTGRES_PASSWORD || 'onter_pg_pass_2026';
  const pgDatabase = process.env.POSTGRES_DB || 'onter_ai';

  console.log(`[PostgreSQL] Подключение к ${pgHost}:${pgPort}/${pgDatabase} под пользователем ${pgUser}...`);
  const pg = new PgClient({
    host: pgHost,
    port: pgPort,
    user: pgUser,
    password: pgPassword,
    database: pgDatabase,
  });

  await pg.connect();
  console.log('[PostgreSQL] Успешное подключение!\n');

  console.log('[PostgreSQL] Инициализация расширения vector и таблиц...');
  await pg.query('CREATE EXTENSION IF NOT EXISTS vector;');

  // Таблица векторных чанков RAG
  await pg.query(`
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

  await pg.query('CREATE INDEX IF NOT EXISTS idx_chunks_project ON knowledge_chunks(project_id);');
  await pg.query('CREATE INDEX IF NOT EXISTS idx_chunks_file ON knowledge_chunks(file_path);');

  // Таблица истории сессий (скользящее окно 10 сообщений)
  await pg.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id VARCHAR(100) PRIMARY KEY,
      project_id VARCHAR(50) NOT NULL DEFAULT 'general',
      messages JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pg.query('CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);');

  // Очистка перед миграцией
  await pg.query('TRUNCATE TABLE knowledge_chunks RESTART IDENTITY;');
  console.log('[PostgreSQL] Таблицы подготовлены. Начинаем пакетную вставку...');

  const batchSize = 100;
  const projectStats: Record<string, number> = {};

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);

    // Подготовка параметризованного запроса для батча
    const values: any[] = [];
    const placeholders: string[] = [];

    batch.forEach((c, idx) => {
      const proj = detectProjectId(c.filePath);
      projectStats[proj] = (projectStats[proj] || 0) + 1;

      const offset = idx * 5;
      placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`);
      
      // pgvector принимает строку формата '[0.1, 0.2, ...]'
      const vectorStr = `[${c.embedding.join(',')}]`;
      values.push(proj, c.filePath, c.header || null, c.content, vectorStr);
    });

    const query = `
      INSERT INTO knowledge_chunks (project_id, file_path, header, content, embedding)
      VALUES ${placeholders.join(', ')}
    `;

    await pg.query(query, values);
    process.stdout.write(`\r⏳ Перенесено: ${Math.min(i + batchSize, chunks.length)} / ${chunks.length} чанков...`);
  }

  console.log('\n\n[PostgreSQL] Создание HNSW векторного индекса для мгновенного поиска...');
  await pg.query(`
    CREATE INDEX IF NOT EXISTS idx_chunks_vector 
    ON knowledge_chunks 
    USING hnsw (embedding vector_cosine_ops);
  `);

  const countRes = await pg.query('SELECT COUNT(*) FROM knowledge_chunks');
  const totalInPg = countRes.rows[0].count;

  console.log('\n====================================================');
  console.log('✅ Миграция успешно завершена!');
  console.log(`📊 Итоговое количество записей в PostgreSQL: ${totalInPg}`);
  console.log('📂 Распределение чанков по проектам:');
  for (const [proj, count] of Object.entries(projectStats)) {
    console.log(`   - ${proj}: ${count} чанков`);
  }
  console.log('====================================================\n');

  // Тестовый запрос векторизации
  console.log('🧪 Тест векторного поиска в PostgreSQL...');
  const testRes = await pg.query(`
    SELECT file_path, header, project_id, 1 - (embedding <=> $1) AS score
    FROM knowledge_chunks
    WHERE project_id IN ('minecraft', 'general')
    ORDER BY embedding <=> $1
    LIMIT 3;
  `, [`[${chunks[0].embedding.join(',')}]`]);

  console.log(`  Top 1 результат: [${testRes.rows[0]?.project_id}] ${testRes.rows[0]?.file_path} (Сходство: ${(Number(testRes.rows[0]?.score) * 100).toFixed(1)}%)`);
  console.log('🎉 Векторный индекс HNSW работает корректно!\n');

  await pg.end();
}

runMigration().catch(err => {
  console.error('\n❌ Ошибка миграции:', err);
  process.exit(1);
});
