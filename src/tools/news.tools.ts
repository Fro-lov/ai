import { z } from 'zod';
import { ToolDefinition } from './tool.types';
import { NewsService } from '../news/news.service';

export function createNewsTools(newsService: NewsService): ToolDefinition[] {
  const getLatestNewsTool: ToolDefinition = {
    name: 'get_latest_news',
    description: 'Получить список последних новостей, анонсов и патчноутов проекта Onter с кратким описанием и датами.',
    parameters: z.object({
      limit: z.number().int().min(1).max(10).optional().default(3).describe('Количество новостей для получения (по умолчанию 3)'),
    }),
    execute: async (args: { limit?: number }) => {
      const news = await newsService.getLatestNews(args.limit || 3);
      if (news.length === 0) {
        return { message: 'Новостей не найдено.' };
      }
      return news;
    },
  };

  const getNewsDetailTool: ToolDefinition = {
    name: 'get_news_detail',
    description: 'Получить подробное содержание (полный текст content) конкретной новости по ее ID.',
    parameters: z.object({
      newsId: z.string().min(1).describe('Уникальный ID новости (например, "open-atm-skyblock" или "builder-contest")'),
    }),
    execute: async (args: { newsId: string }) => {
      const detail = await newsService.getNewsById(args.newsId);
      if (!detail) {
        return { error: `Новость с ID "${args.newsId}" не найдена.` };
      }
      return {
        id: detail.id,
        title: detail.title,
        date: detail.date,
        author: detail.author,
        content: detail.content,
      };
    },
  };

  return [getLatestNewsTool, getNewsDetailTool];
}
