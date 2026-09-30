import { pipeline, FeatureExtractionPipeline } from '@xenova/transformers';
import { logger } from '../utils/logger';

export class EmbeddingService {
  private extractor: FeatureExtractionPipeline | null = null;
  private modelName: string;
  private device: string;

  constructor(modelName = 'Xenova/multilingual-e5-small', device = process.env.EMBEDDING_DEVICE || 'cpu') {
    this.modelName = modelName;
    this.device = device;
  }

  /**
   * Lazy loading of the local ONNX feature extraction pipeline.
   * Supports 'cpu', 'cuda', 'directml', etc.
   */
  private async getExtractor(): Promise<FeatureExtractionPipeline> {
    if (!this.extractor) {
      logger.info(`Loading local embedding model (${this.modelName}) on device: ${this.device.toUpperCase()}...`);
      try {
        this.extractor = (await pipeline('feature-extraction', this.modelName, {
          quantized: true,
        })) as FeatureExtractionPipeline;
        logger.info(`Local embedding model loaded successfully.`);
      } catch (error) {
        logger.warn(`Failed to initialize model: ${error instanceof Error ? error.message : String(error)}.`);
        throw error;
      }
    }
    return this.extractor;
  }

  /**
   * Generates embedding vector for a given text.
   * Performs mean pooling over token embeddings and L2 normalization.
   */
  async generateEmbedding(text: string, isQuery = false): Promise<number[]> {
    const extractor = await this.getExtractor();

    // E5 models expect 'query: ' or 'passage: ' prefix for optimal performance
    const formattedText = this.modelName.includes('e5')
      ? `${isQuery ? 'query: ' : 'passage: '}${text}`
      : text;

    const output = await extractor(formattedText, {
      pooling: 'mean',
      normalize: true,
    });

    // Convert Float32Array / Tensor data to JavaScript Array
    return Array.from(output.data as Float32Array);
  }

  /**
   * Computes Cosine Similarity between two vectors
   */
  static cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) {
      throw new Error(`Vector dimension mismatch: ${vecA.length} vs ${vecB.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
