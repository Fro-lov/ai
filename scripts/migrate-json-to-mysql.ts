import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

async function migrate() {
  const filePath = path.join(process.cwd(), 'data', 'knowledge_chunks.json');
  if (!fs.existsSync(filePath)) {
    console.log('No knowledge_chunks.json found');
    return;
  }

  const raw = fs.readFileSync(filePath, 'utf-8');
  const chunks = JSON.parse(raw) as Array<{
    filePath: string;
    header?: string;
    content: string;
    embedding: number[];
  }>;
  console.log(`Loaded ${chunks.length} chunks from JSON.`);

  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'onter_ai',
    password: process.env.MYSQL_PASSWORD || 'onter_ai_db_pass_2026',
    database: process.env.MYSQL_DATABASE || 'onter_ai',
  });

  console.log('Connected to MariaDB. Ensuring knowledge_chunks table exists...');
  await connection.execute(`
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

  console.log('Inserting chunks in batches...');
  const batchSize = 100;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    for (const chunk of batch) {
      const floatArray = new Float32Array(chunk.embedding);
      const buffer = Buffer.from(floatArray.buffer, floatArray.byteOffset, floatArray.byteLength);
      await connection.execute(
        `INSERT INTO knowledge_chunks (file_path, header, content, embedding) VALUES (?, ?, ?, ?)`,
        [chunk.filePath, chunk.header || null, chunk.content, buffer]
      );
    }
    console.log(`Migrated ${Math.min(i + batchSize, chunks.length)} / ${chunks.length} chunks...`);
  }

  const [rows] = await connection.query<mysql.RowDataPacket[]>('SELECT COUNT(*) as cnt FROM knowledge_chunks');
  console.log(`Migration complete! MariaDB knowledge_chunks table now has ${(rows[0] as any)?.cnt} records.`);
  await connection.end();
}

migrate().catch(console.error);
