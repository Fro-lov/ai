import assert from 'node:assert';
import { TelegramService } from '../src/telegram/telegram.service';
import { TelegramMessageContext } from '../src/telegram/telegram.types';

// Mock TelegramService dependencies
const dummyService = new (TelegramService as any)(
  { getOrCreate: () => {}, addMessage: () => {}, getMessages: () => [] },
  { chat: () => {} },
  { getGlobalPrompt: () => '', buildMessages: () => [] },
  { getRuntimeInfo: () => ({}) },
  { format: (text: string) => text }
);

// Override botInfo for testing
(dummyService as any).bot = {
  botInfo: { id: 9999, username: 'onter_ai_bot' }
};

console.log('--- TELEGRAM SERVICE REPLY BUG FIX TEST ---');

// Case 1: User replies to their OWN message in a group chat (no bot mention)
const mockCtxSelfReply = {
  chat: { id: -1001234567, type: 'supergroup' },
  message: {
    message_id: 100,
    chat: { id: -1001234567, type: 'supergroup' },
    from: { id: 1111, username: 'user_yan' },
    text: 'ну 3',
    reply_to_message: {
      message_id: 90,
      from: { id: 1111, username: 'user_yan' },
      text: 'ВСТРЕЧАЙТЕ WOT EXPRESS'
    }
  },
  me: { id: 9999, username: 'onter_ai_bot' }
} as any;

const contextSelfReply = dummyService.extractMessageContext(mockCtxSelfReply)!;
assert.strictEqual(contextSelfReply.isReplyToBot, false, 'Should NOT be identified as reply to bot');
assert.strictEqual(contextSelfReply.mentionedBot, false, 'Should NOT be identified as mention');
assert.strictEqual(dummyService.shouldRespond(contextSelfReply), false, 'Bot MUST NOT respond to self reply in group');
console.log('✅ Case 1 passed: Bot correctly IGNORES user replying to their own message.');

// Case 2: User replies to BOT message in a group chat
const mockCtxBotReply = {
  chat: { id: -1001234567, type: 'supergroup' },
  message: {
    message_id: 101,
    chat: { id: -1001234567, type: 'supergroup' },
    from: { id: 1111, username: 'user_yan' },
    text: 'спасибо за ответ',
    reply_to_message: {
      message_id: 99,
      from: { id: 9999, username: 'onter_ai_bot' },
      text: 'Вот информация о модах...'
    }
  },
  me: { id: 9999, username: 'onter_ai_bot' }
} as any;

const contextBotReply = dummyService.extractMessageContext(mockCtxBotReply)!;
assert.strictEqual(contextBotReply.isReplyToBot, true, 'Should be identified as reply to bot');
assert.strictEqual(dummyService.shouldRespond(contextBotReply), true, 'Bot MUST respond to reply to bot');
console.log('✅ Case 2 passed: Bot correctly RESPONDS to reply sent to bot.');

// Case 3: User replies to another user BUT mentions the bot
const mockCtxMentionInReply = {
  chat: { id: -1001234567, type: 'supergroup' },
  message: {
    message_id: 102,
    chat: { id: -1001234567, type: 'supergroup' },
    from: { id: 1111, username: 'user_yan' },
    text: '@onter_ai_bot ну 3',
    entities: [{ type: 'mention', offset: 0, length: 13 }],
    reply_to_message: {
      message_id: 88,
      from: { id: 2222, username: 'other_user' },
      text: 'какое количество?'
    }
  },
  me: { id: 9999, username: 'onter_ai_bot' }
} as any;

const contextMentionInReply = dummyService.extractMessageContext(mockCtxMentionInReply)!;
assert.strictEqual(contextMentionInReply.isReplyToBot, false);
assert.strictEqual(contextMentionInReply.mentionedBot, true);
assert.strictEqual(dummyService.shouldRespond(contextMentionInReply), true, 'Bot MUST respond when explicitly mentioned');
console.log('✅ Case 3 passed: Bot correctly RESPONDS when explicitly mentioned in reply to another user.');

// Case 4: Private chat reply
const mockCtxPrivateReply = {
  chat: { id: 1111, type: 'private' },
  message: {
    message_id: 103,
    chat: { id: 1111, type: 'private' },
    from: { id: 1111, username: 'user_yan' },
    text: 'ну 3',
    reply_to_message: {
      message_id: 80,
      from: { id: 1111, username: 'user_yan' },
      text: 'предыдущее сообщение'
    }
  },
  me: { id: 9999, username: 'onter_ai_bot' }
} as any;

const contextPrivateReply = dummyService.extractMessageContext(mockCtxPrivateReply)!;
assert.strictEqual(dummyService.shouldRespond(contextPrivateReply), true, 'Bot MUST respond in private chats');
console.log('✅ Case 4 passed: Bot correctly RESPONDS in private chats.');

console.log('\nALL TESTS PASSED SUCCESSFULLY! 🎉');
