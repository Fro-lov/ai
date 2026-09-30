import path from 'path';
import dotenv from 'dotenv';
import { RAGService } from '../src/vector/rag.service';
import { logger } from '../src/utils/logger';

dotenv.config();

async function run() {
  const args = process.argv.slice(2);
  const clearBefore = args.includes('--clear');
  const targetDir = args.find(a => !a.startsWith('--')) || process.env.OBSIDIAN_PATH || 'E:\\obsidian\\Onter\\DB';

  logger.info(`=== Starting Obsidian Vector Indexer ===`);
  logger.info(`Target directory: ${targetDir}`);

  const ragService = new RAGService();
  await ragService.init();

  if (clearBefore) {
    logger.info('Clearing existing vector index...');
    await ragService.clearIndex();
  }

  const startTime = Date.now();
  const totalChunks = await ragService.indexDirectory(targetDir);
  const elapsedSeconds = ((Date.now() - startTime) / 1000).toFixed(2);

  logger.info(`=== Indexing Complete! ===`);
  logger.info(`Processed ${totalChunks} chunks in ${elapsedSeconds}s.`);
  process.exit(0);
}

run().catch(error => {
  logger.error(`Indexing failed: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exit(1);
});
