import { RawNewsItem, NewsApiResponse, NewsSummaryItem } from './news.types';
import { logger } from '../utils/logger';

export class NewsService {
  private apiUrl: string;
  private cacheTTLMs: number;
  private cachedNews: RawNewsItem[] | null = null;
  private lastFetchTime = 0;

  constructor(apiUrl = 'https://onter.pp.ua/api/news', cacheTTLMinutes = 10) {
    this.apiUrl = apiUrl;
    this.cacheTTLMs = cacheTTLMinutes * 60 * 1000;
  }

  /**
   * Fetches news from API or returns cached data if TTL is valid.
   */
  async fetchNews(forceRefresh = false): Promise<RawNewsItem[]> {
    const now = Date.now();
    if (!forceRefresh && this.cachedNews && now - this.lastFetchTime < this.cacheTTLMs) {
      return this.cachedNews;
    }

    try {
      logger.info(`Fetching news from API: ${this.apiUrl}`);
      const response = await fetch(this.apiUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const json = (await response.json()) as NewsApiResponse;
      if (json && json.success && Array.isArray(json.data)) {
        // Sort by date descending
        this.cachedNews = json.data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        this.lastFetchTime = now;
        logger.info(`Successfully fetched and cached ${this.cachedNews.length} news items.`);
        return this.cachedNews;
      }

      logger.warn('News API returned unexpected format or success=false.');
      return this.cachedNews || [];
    } catch (error) {
      logger.error(`Failed to fetch news from ${this.apiUrl}: ${error instanceof Error ? error.message : String(error)}`);
      // Fallback to cache if network fails
      return this.cachedNews || [];
    }
  }

  /**
   * Returns a lightweight summary of the latest news items.
   */
  async getLatestNews(limit = 3): Promise<NewsSummaryItem[]> {
    const allNews = await this.fetchNews();
    return allNews.slice(0, limit).map((item) => ({
      id: item.id,
      title: item.title,
      excerpt: item.excerpt,
      date: item.date,
      author: item.author,
    }));
  }

  /**
   * Retrieves full details for a specific news item by ID.
   */
  async getNewsById(id: string): Promise<RawNewsItem | null> {
    const allNews = await this.fetchNews();
    const item = allNews.find((n) => n.id.toLowerCase() === id.toLowerCase());
    return item || null;
  }

  /**
   * Formats top N news items as a concise text digest for system prompt or context.
   */
  async formatDigest(limit = 3): Promise<string> {
    const summaries = await this.getLatestNews(limit);
    if (summaries.length === 0) {
      return 'Актуальных новостей проекта в данный момент нет.';
    }

    const lines = summaries.map((item, index) => {
      const dateFormatted = item.date ? new Date(item.date).toLocaleDateString('ru-RU') : '';
      return `${index + 1}. [${dateFormatted}] ${item.title} (ID: ${item.id})\n   ${item.excerpt}`;
    });

    return `[ПОСЛЕДНИЕ НОВОСТИ И АНОНСЫ ПРОЕКТА ONTER]:\n${lines.join('\n\n')}`;
  }

  /**
   * Clears in-memory cache manually.
   */
  clearCache(): void {
    this.cachedNews = null;
    this.lastFetchTime = 0;
  }
}
