# onter-ai

onter-ai — backend AI service для использования в нескольких проектах.

## Что это

Backend-сервис, предоставляющий единый AI API для различных проектов. На текущем этапе поддерживает интеграцию с Groq API.

## Текущие возможности

- `POST /api/chat` — отправка сообщений AI
- Groq provider
- System prompt
- Health endpoint
- Docker поддержка

## Технологии

- Node.js
- TypeScript
- Fastify
- Zod
- Groq SDK
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
```

### Разработка

```bash
npm run dev
```

Сервис будет доступен по адресу: `http://localhost:3001`

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

#### Простое сообщение

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Привет"}'
```

#### С system prompt

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Объясни TypeScript",
    "systemPrompt": "Отвечай кратко."
  }'
```

Ответ:

```json
{
  "content": "AI response here",
  "model": "llama-3.1-8b-instant"
}
```

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

```
Client
  ↓
POST /api/chat
  ↓
Fastify Route
  ↓
ChatService
  ↓
AIProvider interface
  ↓
GroqProvider
  ↓
Groq API
  ↓
AI response
```

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
