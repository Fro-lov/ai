# onter-ai

onter-ai — backend AI service для использования в нескольких проектах.

## Что это

Backend-сервис, предоставляющий единый AI API для различных проектов. На текущем этапе поддерживает интеграцию с Groq API.

## Текущие возможности

- `POST /api/chat` — отправка сообщений AI
- Мульти-провайдерная архитектура AI
- Groq provider (подключён)
- System prompt
- Выбор провайдера и модели
- Telegram Bot интеграция
- Conversation history (в памяти)
- Health endpoint
- Docker поддержка

## Технологии

- Node.js
- TypeScript
- Fastify
- Zod
- Groq SDK
- grammY (Telegram Bot)
- Docker

## Запуск

### Установка зависимостей

```bash
npm install
```

### Настройка окружения

Создайте файл `.env` на основе `.env.example`:

```bash
cp .env.example .env
```

Заполните обязательные переменные:

```env
GROQ_API_KEY=your_api_key_here
AI_DEFAULT_PROVIDER=groq
GROQ_MODEL=llama-3.1-8b-instant
```

### Разработка

```bash
npm run dev
```

Сервис будет доступен по адресу: `http://localhost:3001`

### Telegram Bot (опционально)

Для включения Telegram Bot:

1. Получите токен бота у [@BotFather](https://t.me/botfather) в Telegram
2. Добавьте в `.env`:

```env
TELEGRAM_ENABLED=true
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_SYSTEM_PROMPT=You are a helpful AI assistant.
CONVERSATION_HISTORY_LIMIT=10
```

3. Запустите сервис:

```bash
npm run dev
```

Бот будет автоматически запущен при старте сервера.

### Production

```bash
npm run build
npm run start
```

## Пример запроса

### Health check

```bash
curl http://localhost:3001/health
```

Ответ:

```json
{
  "status": "ok",
  "service": "onter-ai"
}
```

### Chat endpoint

#### Простое сообщение (использует default provider)

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Привет"}'
```

#### С указанием провайдера

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Привет",
    "provider": "groq"
  }'
```

#### С указанием модели

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Объясни TypeScript",
    "provider": "groq",
    "model": "llama-3.1-8b-instant"
  }'
```

#### С system prompt

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Объясни TypeScript",
    "systemPrompt": "Отвечай кратко.",
    "provider": "groq"
  }'
```

Ответ:

```json
{
  "content": "AI response here",
  "model": "llama-3.1-8b-instant"
}
```

### Telegram Bot команды

- `/start` — Приветственное сообщение
- `/reset` — Очистить историю диалога
- `/context` — Показать информацию о текущем диалоге

### Telegram Bot поведение

**В личных чатах:**
- Бот отвечает на все сообщения

**В группах:**
- Бот отвечает только если его упомянули (@botname)
- Бот отвечает если сообщение является reply на сообщение бота
- При упоминании бота, упоминание удаляется из текста перед отправкой в AI

## Docker

### Запуск через Docker Compose

```bash
docker compose up -d --build
```

### Проверка работоспособности

```bash
curl http://localhost:3001/health
```

## Архитектура

### HTTP API

```
Client
  ↓
POST /api/chat
  ↓
Fastify Route (Zod validation)
  ↓
ChatService
  ↓
AIService (provider registry)
  ↓
AIProvider interface
  ↓
GroqProvider (или другие провайдеры)
  ↓
Groq API
  ↓
AI response
```

### Telegram Bot

```
Telegram
  ↓
Telegram Bot (grammY)
  ↓
Conversation Memory (in-memory)
  ↓
ChatService
  ↓
AIService
  ↓
AIProvider
  ↓
Groq API
  ↓
Telegram response
```

### Переменные окружения

**Основные:**
- `GROQ_API_KEY` — API ключ для Groq
- `AI_DEFAULT_PROVIDER` — провайдер по умолчанию (groq)
- `GROQ_MODEL` — модель по умолчанию для Groq
- `PORT` — порт сервера (3001)
- `HOST` — хост сервера (0.0.0.0)

**Telegram Bot:**
- `TELEGRAM_ENABLED` — включить Telegram bot (true/false)
- `TELEGRAM_BOT_TOKEN` — токен Telegram бота
- `TELEGRAM_SYSTEM_PROMPT` — системный промпт для Telegram
- `CONVERSATION_HISTORY_LIMIT` — лимит истории сообщений (10)

### Обработка ошибок

Сервис возвращает структурированные ошибки с кодами:

- `VALIDATION_ERROR` — ошибка валидации запроса (400)
- `PROVIDER_NOT_FOUND` — провайдер не найден (404)
- `AI_PROVIDER_ERROR` — ошибка AI провайдера (502)
- `INTERNAL_ERROR` — внутренняя ошибка сервера (500)

## Планы развития

В будущем планируется добавить:

1. Telegram bot
2. PostgreSQL для хранения истории
3. Система диалогов
4. Проекты и контекст
5. Task management
6. Trello интеграция
7. AI moderation
8. Tools/function calling
9. Другие AI providers (Gemini, OpenRouter)
10. API для Minecraft/KubeJS и других сервисов

## Скрипты

- `npm run dev` — запуск в режиме разработки с hot-reload
- `npm run build` — сборка TypeScript в JavaScript
- `npm run start` — запуск production версии
- `npm run lint` — проверка кода ESLint
