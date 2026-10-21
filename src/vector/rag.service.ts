import fs from 'fs';
import path from 'path';
import { EmbeddingService } from './embedding.service';
import { MarkdownChunker, MarkdownChunk } from './chunker';
import { VectorRepository, ChunkRecord } from './vector.repository';
import { logger } from '../utils/logger';

export interface SearchResult {
  filePath: string;
  header: string;
  content: string;
  score: number;
  projectId?: string;
}

export class RAGService {
  private embeddingService: EmbeddingService;
  private chunker: MarkdownChunker;
  private repository: VectorRepository;
  private isInitialized = false;

  constructor() {
    this.embeddingService = new EmbeddingService();
    this.chunker = new MarkdownChunker();
    this.repository = new VectorRepository();
  }

  async init(): Promise<void> {
    if (!this.isInitialized) {
      await this.repository.init();
      this.isInitialized = true;
    }
  }

  private detectProjectId(filePath: string): string {
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

  /**
   * Recursively indexes all Markdown files in a directory
   */
  async indexDirectory(dirPath: string): Promise<number> {
    await this.init();

    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory does not exist: ${dirPath}`);
    }

    logger.info(`Starting indexing of directory: ${dirPath}`);

    const markdownFiles = this.getMarkdownFiles(dirPath);
    logger.info(`Found ${markdownFiles.length} Markdown files to index.`);

    let totalChunksSaved = 0;

    for (const fullPath of markdownFiles) {
      const relativePath = path.relative(dirPath, fullPath).replace(/\\/g, '/');
      logger.info(`Processing file: ${relativePath}`);

      const chunks = this.chunker.chunkFile(fullPath, relativePath);
      const recordsToSave: ChunkRecord[] = [];
      const projectId = this.detectProjectId(relativePath);

      for (const chunk of chunks) {
        // Generate embedding vector using local ONNX model
        const embedding = await this.embeddingService.generateEmbedding(chunk.content, false);

        recordsToSave.push({
          projectId,
          filePath: chunk.filePath,
          header: chunk.header,
          content: chunk.content,
          embedding,
        });
      }

      if (recordsToSave.length > 0) {
        await this.repository.saveChunks(recordsToSave);
        totalChunksSaved += recordsToSave.length;
      }
    }

    logger.info(`Indexing completed. Total chunks processed: ${totalChunksSaved}`);
    return totalChunksSaved;
  }

  /**
   * Clears the vector store index
   */
  async clearIndex(): Promise<void> {
    await this.init();
    await this.repository.clearAll();
  }

  /**
   * Returns statistics about vector storage (chunk count and storage type)
   */
  async getStatus(): Promise<{ totalChunks: number; storage: 'postgres' | 'mysql' | 'json'; error?: string }> {
    await this.init();
    const res = await this.repository.getChunkCount();
    return {
      totalChunks: res.total,
      storage: res.storage,
      error: res.error,
    };
  }

  /**
   * Performs vector similarity search for a query and returns top-K relevant chunks,
   * filtered by projectId (with fallback to 'general').
   */
  async findRelevantChunks(
    query: string,
    topK = 5,
    minScore = 0.25,
    projectId?: string
  ): Promise<SearchResult[]> {
    await this.init();

    const queryEmbedding = await this.embeddingService.generateEmbedding(query, true);
    const similarChunks = await this.repository.searchSimilar(queryEmbedding, topK, minScore, projectId);

    const results: SearchResult[] = similarChunks.map(chunk => ({
      filePath: chunk.filePath,
      header: chunk.header,
      content: chunk.content,
      score: chunk.score ?? 0,
      projectId: chunk.projectId,
    }));

    logger.info(
      `RAG search for "${query}" [projectId: ${projectId || 'general'}]: found ${results.length} chunks (top score: ${results[0]?.score.toFixed(3) || 'none'}).`
    );
    return results;
  }

  private getMarkdownFiles(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);

    for (const file of list) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat && stat.isDirectory()) {
        results = results.concat(this.getMarkdownFiles(fullPath));
      } else if (file.endsWith('.md')) {
        results.push(fullPath);
      }
    }

    return results;
  }
}
