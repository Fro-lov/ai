import fs from 'fs';
import path from 'path';

export interface MarkdownChunk {
  filePath: string;
  header: string;
  content: string;
}

export class MarkdownChunker {
  private maxChunkLength: number;

  constructor(maxChunkLength = 1200) {
    this.maxChunkLength = maxChunkLength;
  }

  /**
   * Reads a Markdown file and splits it into logical sections by headers (#, ##, ###).
   */
  chunkFile(fullFilePath: string, relativePath: string): MarkdownChunk[] {
    const rawContent = fs.readFileSync(fullFilePath, 'utf-8');
    const lines = rawContent.split('\n');

    const chunks: MarkdownChunk[] = [];
    let currentHeader = 'General';
    let currentLines: string[] = [];

    for (const line of lines) {
      const headerMatch = line.match(/^(#{1,4})\s+(.+)$/);
      if (headerMatch) {
        if (currentLines.length > 0) {
          const chunkText = currentLines.join('\n').trim();
          if (chunkText.length > 0) {
            chunks.push(...this.subdivideIfNeeded(relativePath, currentHeader, chunkText));
          }
          currentLines = [];
        }
        currentHeader = headerMatch[2].trim();
        currentLines.push(line);
      } else {
        currentLines.push(line);
      }
    }

    if (currentLines.length > 0) {
      const chunkText = currentLines.join('\n').trim();
      if (chunkText.length > 0) {
        chunks.push(...this.subdivideIfNeeded(relativePath, currentHeader, chunkText));
      }
    }

    return chunks;
  }

  /**
   * Subdivides large sections by paragraphs or by lines if paragraphs are too long.
   */
  private subdivideIfNeeded(filePath: string, header: string, text: string): MarkdownChunk[] {
    if (text.length <= this.maxChunkLength) {
      return [{ filePath, header, content: text }];
    }

    const result: MarkdownChunk[] = [];
    const lines = text.split('\n');
    let accumulatedLines: string[] = [];
    let currentLen = 0;

    for (const line of lines) {
      if (currentLen + line.length + 1 > this.maxChunkLength && accumulatedLines.length > 0) {
        const chunkText = accumulatedLines.join('\n').trim();
        if (chunkText.length > 0) {
          result.push({
            filePath,
            header,
            content: `[Секция: ${header}]\n${chunkText}`,
          });
        }
        accumulatedLines = [];
        currentLen = 0;
      }

      accumulatedLines.push(line);
      currentLen += line.length + 1;
    }

    if (accumulatedLines.length > 0) {
      const chunkText = accumulatedLines.join('\n').trim();
      if (chunkText.length > 0) {
        result.push({
          filePath,
          header,
          content: `[Секция: ${header}]\n${chunkText}`,
        });
      }
    }

    return result;
  }
}
