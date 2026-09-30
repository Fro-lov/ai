import { RAGService } from '../src/vector/rag.service';
import { logger } from '../src/utils/logger';

async function test() {
  const rag = new RAGService();
  await rag.init();

  const query = 'Какой IP у сервера Oracle Cloud 1 и какие там сервисы?';
  logger.info(`Testing search query: "${query}"`);

  const results = await rag.findRelevantChunks(query, 3);

  console.log('\n--- TOP RETRIEVED CHUNKS ---');
  results.forEach((res, i) => {
    console.log(`\n[#${i + 1}] File: ${res.filePath} | Header: ${res.header} | Similarity Score: ${(res.score * 100).toFixed(2)}%`);
    console.log(`Content:\n${res.content.slice(0, 300)}...`);
  });

  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
