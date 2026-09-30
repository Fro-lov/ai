import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { ToolRegistry } from '../src/tools/tool.registry';

describe('ToolRegistry Tests', () => {
  test('registerTool registers and retrieves a tool', () => {
    const registry = new ToolRegistry();
    registry.registerTool({
      name: 'test_calculator',
      description: 'Adds two numbers',
      parameters: z.object({ a: z.number(), b: z.number() }),
      execute: async ({ a, b }) => a + b,
    });

    const tool = registry.getTool('test_calculator');
    assert.ok(tool, 'Tool should be registered');
    assert.strictEqual(tool.name, 'test_calculator');
  });

  test('executeToolCall executes function with validated params', async () => {
    const registry = new ToolRegistry();
    registry.registerTool({
      name: 'add',
      description: 'Add numbers',
      parameters: z.object({ a: z.number(), b: z.number() }),
      execute: async ({ a, b }) => a + b,
    });

    const successResult = await registry.executeToolCall({
      id: 'call_1',
      name: 'add',
      args: { a: 5, b: 10 },
    });

    assert.strictEqual(successResult.result, 15);
    assert.strictEqual(successResult.error, undefined);

    const invalidParamResult = await registry.executeToolCall({
      id: 'call_2',
      name: 'add',
      args: { a: 'not_a_number', b: 10 },
    });

    assert.ok(invalidParamResult.error?.includes('Invalid parameters'));
  });

  test('toNativeToolsSchema generates OpenAI compatible schema', () => {
    const registry = new ToolRegistry();
    registry.registerTool({
      name: 'get_weather',
      description: 'Get weather for city',
      parameters: z.object({ city: z.string() }),
      execute: async () => 'sunny',
    });

    const schema = registry.toNativeToolsSchema();
    assert.strictEqual(schema.length, 1);
    assert.strictEqual(schema[0].type, 'function');
    assert.strictEqual(schema[0].function.name, 'get_weather');
  });

  test('toPromptSystemInstructions generates fallback system prompt', () => {
    const registry = new ToolRegistry();
    registry.registerTool({
      name: 'ping',
      description: 'Pings server',
      parameters: z.object({ target: z.string() }),
      execute: async () => 'pong',
    });

    const instructions = registry.toPromptSystemInstructions();
    assert.ok(instructions.includes('[ДОСТУПНЫЕ ИНСТРУМЕНТЫ (TOOLS / FUNCTIONS)]'));
    assert.ok(instructions.includes('ping'));
  });
});
