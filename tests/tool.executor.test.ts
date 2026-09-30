import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { ToolRegistry } from '../src/tools/tool.registry';
import { ToolExecutor } from '../src/tools/tool.executor';

describe('ToolExecutor Tests', () => {
  test('parseResponse handles native tool calls', () => {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor(registry);

    const nativeCalls = [
      {
        id: 'call_native_1',
        function: {
          name: 'get_latest_news',
          arguments: '{"limit": 2}',
        },
      },
    ];

    const parsed = executor.parseResponse('Some response text', nativeCalls);
    assert.strictEqual(parsed.hasToolCalls, true);
    assert.strictEqual(parsed.toolCalls.length, 1);
    assert.strictEqual(parsed.toolCalls[0].name, 'get_latest_news');
    assert.strictEqual(parsed.toolCalls[0].args.limit, 2);
  });

  test('parseResponse parses structured prompt fallback JSON block', () => {
    const registry = new ToolRegistry();
    const executor = new ToolExecutor(registry);

    const rawText = `
Нашел нужный инструмент:
\`\`\`json
{
  "tool_call": {
    "name": "get_news_detail",
    "args": { "newsId": "open-atm-skyblock" }
  }
}
\`\`\`
`;

    const parsed = executor.parseResponse(rawText);
    assert.strictEqual(parsed.hasToolCalls, true);
    assert.strictEqual(parsed.toolCalls.length, 1);
    assert.strictEqual(parsed.toolCalls[0].name, 'get_news_detail');
    assert.strictEqual(parsed.toolCalls[0].args.newsId, 'open-atm-skyblock');
  });

  test('executeToolCalls executes parsed tools successfully', async () => {
    const registry = new ToolRegistry();
    registry.registerTool({
      name: 'echo',
      description: 'Echoes input',
      parameters: z.object({ text: z.string() }),
      execute: async ({ text }) => `Echo: ${text}`,
    });

    const executor = new ToolExecutor(registry);
    const parsed = executor.parseResponse(JSON.stringify({ tool_call: { name: 'echo', args: { text: 'Hello!' } } }));

    const results = await executor.executeToolCalls(parsed.toolCalls);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].result, 'Echo: Hello!');
  });
});
