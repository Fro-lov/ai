import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NewsService } from '../src/news/news.service';

describe('NewsService Tests', () => {
  let newsService: NewsService;

  beforeEach(() => {
    newsService = new NewsService('https://onter.pp.ua/api/news', 5);
  });

  test('fetchNews retrieves news items from real endpoint', async () => {
    const news = await newsService.fetchNews(true);
    assert.ok(Array.isArray(news), 'Expected news to be an array');
    if (news.length > 0) {
      assert.ok(news[0].id, 'News item should have id');
      assert.ok(news[0].title, 'News item should have title');
      assert.ok(news[0].excerpt, 'News item should have excerpt');
    }
  });

  test('getLatestNews returns specified limit of items without content field', async () => {
    const summaries = await newsService.getLatestNews(2);
    assert.ok(summaries.length <= 2, 'Should not return more items than limit');
    if (summaries.length > 0) {
      assert.ok(summaries[0].id);
      assert.ok(summaries[0].title);
      assert.strictEqual((summaries[0] as any).content, undefined, 'Content should be omitted in summary');
    }
  });

  test('formatDigest returns formatted string with headers', async () => {
    const digest = await newsService.formatDigest(2);
    assert.ok(digest.includes('[ПОСЛЕДНИЕ НОВОСТИ И АНОНСЫ ПРОЕКТА ONTER]'));
    assert.ok(digest.includes('1. ['));
  });

  test('getNewsById returns single news item or null if invalid', async () => {
    const news = await newsService.fetchNews();
    if (news.length > 0) {
      const firstId = news[0].id;
      const found = await newsService.getNewsById(firstId);
      assert.ok(found, 'Should find existing news by ID');
      assert.strictEqual(found?.id, firstId);
    }

    const notFound = await newsService.getNewsById('non-existent-id-12345');
    assert.strictEqual(notFound, null, 'Should return null for unknown ID');
  });
});
