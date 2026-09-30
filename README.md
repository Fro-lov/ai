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

- `/start` — Начать работу и узнать как взаимодействовать (различается для личных чатов и групп)
- `/help` — Показать список команд
- `/reset` — Очистить историю диалога
- `/context` — Показать информацию о текущем диалоге
- `/limits` — Показать информацию о лимитах AI provider
- `/history` — Показать всю историю диалога в виде текста

### Telegram Bot поведение

**В личных чатах:**
- Бот отвечает на все сообщения

**В группах:**
- Бот отвечает только если его упомянули (@botname)
- Бот отвечает если сообщение является reply на сообщение бота
- При упоминании бота, упоминание удаляется из текста перед отправкой в AI

### Telegram Privacy Mode

Бот работает с Telegram Privacy Mode без необходимости отключать его. Для работы в группах:

1. Добавьте бота в группу
2. Используйте `@bot_username вопрос` или ответьте (reply) на сообщение бота

Если Privacy Mode влияет на уже добавленного бота после изменения настроек, возможно потребуется повторное добавление бота в группу.

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

### Prompt Architecture

Сервис использует многоуровневую систему промптов для формирования AI контекста:

```
Global Prompt
    ↓
Project Prompt (опционально)
    ↓
Conversation History
    ↓
Current User Message
```

**Global Prompt** (`AI_SYSTEM_PROMPT`):
- Определяет общее поведение AI
- Задаёт стиль мышления и принципы ответов
- Управляет отношением к фактам и неопределённости
- Обязателен для заполнения

**Project Prompt** (`AI_PROJECT_PROMPT_*`):
- Содержит факты о конкретном проекте
- Технологии, версии, архитектура
- Подтверждённые команды и API
- Опциональный, используется при указании `projectId`

**Conversation History**:
- Хранит историю диалога
- Передаётся как часть контекста
- Ограничивается `CONVERSATION_HISTORY_LIMIT`

### Переменные окружения

**Основные:**
- `GROQ_API_KEY` — API ключ для Groq
- `AI_DEFAULT_PROVIDER` — провайдер по умолчанию (groq)
- `GROQ_MODEL` — модель по умолчанию для Groq
- `PORT` — порт сервера (3001)
- `HOST` — хост сервера (0.0.0.0)

**Prompts:**
- `AI_SYSTEM_PROMPT` — глобальный промпт поведения AI (обязательный)
- `AI_PROJECT_PROMPT_ONTER_AI` — контекст проекта onter-ai (опциональный)
- `AI_PROJECT_PROMPT_MINECRAFT` — контекст проекта minecraft (опциональный)
- `AI_PROJECT_PROMPT_SCRAP_EVOLUTION` — контекст проекта scrap-evolution (опциональный)

**Telegram Bot:**
- `TELEGRAM_ENABLED` — включить Telegram bot (true/false)
- `TELEGRAM_BOT_TOKEN` — токен Telegram бота
- `TELEGRAM_SYSTEM_PROMPT` — системный промпт для Telegram (устарел, используйте AI_SYSTEM_PROMPT)
- `CONVERSATION_HISTORY_LIMIT` — лимит истории сообщений (10)

**AI Settings:**
- `AI_MAX_TOKENS` — максимальное количество токенов в ответе (800)

### Обработка ошибок

Сервис возвращает структурированные ошибки с кодами:

- `VALIDATION_ERROR` — ошибка валидации запроса (400)
- `PROVIDER_NOT_FOUND` — провайдер не найден (404)
- `AI_PROVIDER_ERROR` — ошибка AI провайдера (502)
- `INTERNAL_ERROR` — внутренняя ошибка сервера (500)

### Groq Rate Limits

Информация о лимитах Groq берётся из HTTP response headers API. Команда `/limits` в Telegram показывает доступные данные:

- Remaining requests — оставшиеся запросы
- Remaining tokens — оставшиеся токены
- Reset requests — время сброса лимита запросов
- Reset tokens — время сброса лимита токенов

Эти значения относятся к конкретным лимитным окнам, предоставляемым Groq API. Не следует интерпретировать их как полный остаток месячной или дневной квоты без подтверждения соответствующим API полем.

## Планы развития

В будущем планируется добавить:

1. PostgreSQL для хранения истории
2. Система диалогов
3. Проекты и контекст
4. Task management
5. Trello интеграция
6. AI moderation
7. Tools/function calling
8. Другие AI providers (Gemini, OpenRouter)
9. API для Minecraft/KubeJS и других сервисов

## Скрипты

- `npm run dev` — запуск в режиме разработки с hot-reload
- `npm run build` — сборка TypeScript в JavaScript
- `npm run start` — запуск production версии
- `npm run lint` — проверка кода ESLint
