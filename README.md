# onter-ai

**onter-ai** — единый бэкенд-сервис искусственного интеллекта и базы знаний (RAG) для экосистемы игровых и комьюнити-проектов Onter (Minecraft, FiveM, Scrap Evolution, Telegram, Discord, Web).

---

## 🎯 Основная среда и целевая инфраструктура

* **Основная среда развертывания (Production)**: Удаленный Linux-сервер **Oracle Cloud (ARM64)**, рабочая директория `/opt/onter-ai`.
* **CI/CD Автодеплой**: Настроен через GitHub Actions Self-Hosted Runner (`.github/workflows/deploy.yml`). При пуше в ветку `main` сервис автоматически обновляется, собирается и перезапускается.
* **Локальная среда (Dev)**: Используется для разработки, отладки и векторизации локальных заметок Obsidian (`E:\obsidian\Onter\DB`).

---

## 🚀 Возможности системы

### 1. Мульти-провайдерная AI архитектура
* **Groq API**: Сверхбыстрый инференс открытых моделей (Llama 3.3, Mixtral, Qwen).
* **Argon Engine (Gemini 4 Web Session)**: Внутренний агентный движок с автономным исполнителем задач в `/workspace`, поддержкой файлов и выполнения shell-команд.
* **OpenRouter Ready**: Архитектура готова к подключению единого шлюза бесплатных моделей (`:free`).

### 2. Мультипроектный RAG (Изоляция баз знаний)
* **Pre-Filtering по `projectId`**: Запросы разделяются по проектам (`minecraft`, `fivem`, `scrap_evolution`, `general`). Игроки Minecraft гарантированно не получают контекст FiveM и наоборот.
* **Векторная БД PostgreSQL + `pgvector`**: Нативный HNSW векторный индекс (Cosine Similarity) прямо в СУБД. Поиск за 2–5 мс без выгрузки чанков в оперативную память Node.js.
* **Мягкий фоллбэк**: Если PostgreSQL временно недоступен, сервис плавно переключается на MariaDB или локальный `data/knowledge_chunks.json`.
* **Локальные ONNX-эмбеддинги**: Модель `Xenova/multilingual-e5-small` генерирует 384-мерные векторы локально на CPU без затрат на внешние API.

### 3. Форматирование под игровые и мессенджер-каналы
* **Minecraft Formatter**: Очистка Markdown, объединение в одну строку с разделителем ` | ` для вывода в чат игры.
* **Discord Formatter**: Сохранение форматирования блоков кода, спойлеров и цитат.
* **Telegram Formatter**: Поддержка безопасного экранирования HTML/MarkdownV2.
* **Plaintext Formatter**: Чистый текст для NUI интерфейсов и консолей.

### 4. Telegram Bot
* Поддержка личных чатов и групп (с учетом Telegram Privacy Mode).
* Скользящее окно истории диалога (`CONVERSATION_HISTORY_LIMIT=10`).
* Команды: `/start`, `/help`, `/reset`, `/context`, `/limits`, `/history`.

### 5. Admin & Health API
* `GET /health` — проверка состояния сервиса.
* `GET /api/admin/system/status` — системный статус, аптайм, память, активные провайдеры.
* `GET /api/admin/rag/status` — количество проиндексированных чанков и текущее хранилище (PostgreSQL / MySQL / JSON).
* `GET /api/admin/limits` — квоты и лимиты текущего AI провайдера.

---

## 🛠️ Стек технологий

* **Runtime**: Node.js (v20+ LTS) & TypeScript
* **HTTP Framework**: Fastify + Zod (строгая валидация схем)
* **Векторная БД**: PostgreSQL 16 с расширением `pgvector` (HNSW) в Docker
* **Эмбеддинги**: `@xenova/transformers` (ONNX Runtime)
* **Боты**: grammY (Telegram Bot Framework)
* **Инференс**: `groq-sdk`, внутренний `Argon Engine` (FastAPI / Gemini Web API)

---

## 🐘 Развертывание PostgreSQL + pgvector на сервере

На хостинге предусмотрен скрипт автоматической установки, который сам ставит Docker, запускает `pgvector/pgvector:pg16`, мигрирует все данные и отключает устаревшую MariaDB.

### Быстрый запуск на хостинге:

Зайдите по SSH на сервер и выполните команду:

```bash
sudo bash scripts/setup-docker-postgres.sh
```

### Что делает скрипт:
1. Проверяет и при необходимости устанавливает Docker и Docker Compose (поддерживается ARM64 Oracle Cloud).
2. Поднимает контейнер `onter-postgres` с расширением `pgvector`.
3. Запускает `npm run migrate:postgres` — переносит все 3 871+ чанков из MariaDB/JSON в PostgreSQL, автоматически распределяя `projectId`.
4. Создает таблицы сессий диалогов и HNSW индекс.
5. Безопасно останавливает и отключает старую службу MariaDB (`systemctl disable --now mariadb`).
6. Перезапускает службу `onter-ai`.

---

## 💻 Локальная разработка (Dev)

### 1. Установка зависимостей
```bash
npm install
```

### 2. Настройка `.env`
Скопируйте пример окружения:
```bash
cp .env.example .env
```
Заполните ключи:
```env
PORT=3001
GROQ_API_KEY=gsk_...
AI_DEFAULT_PROVIDER=groq
AI_SYSTEM_PROMPT="..."

# Опционально: подключение к PostgreSQL
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_USER=onter_ai
POSTGRES_PASSWORD=onter_pg_pass_2026
POSTGRES_DB=onter_ai
```

### 3. Запуск сервера в режиме разработки
```bash
npm run dev
```

### 4. Индексация базы знаний Obsidian (на ПК)
```bash
# Индексировать хранилище
npm run index:obsidian

# Очистить индекс и заново переиндексировать
npm run index:obsidian -- --clear
```

---

## 📡 Примеры API

### Chat Endpoint (`POST /api/chat`)

```bash
curl -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Как получить нейтроний на скайблоке?",
    "projectId": "minecraft",
    "provider": "groq"
  }'
```

Ответ:
```json
{
  "content": "Для получения нейтрония на ATM10 Skyblock используется нейтронный компрессор...",
  "model": "llama-3.3-70b-versatile"
}
```

---

## 📁 Структура проекта

```text
onter-ai/
├── argon-engine/           # Внутренний агентный движок Argon (Python / Gemini Web API)
├── data/                   # Локальные файлы и кэш (knowledge_chunks.json)
├── docs/                   # Архитектурная документация (RAG_ARCHITECTURE.md)
├── scripts/                # Скрипты развертывания и миграции
│   ├── setup-docker-postgres.sh    # Автоустановка Docker + pgvector на сервере
│   ├── migrate-to-postgres.ts      # Миграция RAG данных в PostgreSQL
│   ├── index-obsidian.ts           # Индексатор Markdown заметок
│   └── setup-runner.sh             # Скрипт настройки GitHub Actions Runner
├── src/
│   ├── ai/                 # Провайдеры (Groq, Argon, OpenRouter)
│   ├── chat/               # ChatService и схемы запросов
│   ├── config/             # Zod валидация окружения
│   ├── conversation/       # Управление сессиями диалогов
│   ├── formatter/          # Форматтеры каналов (Minecraft, Discord, Telegram)
│   ├── routes/             # Fastify эндпоинты (chat, admin, health)
│   ├── telegram/           # Telegram бот на grammY
│   └── vector/             # RAG, Chunker, ONNX эмбеддинги, VectorRepository
├── docker-compose.yml      # Конфигурация PostgreSQL (pgvector) и сервиса
├── Dockerfile              # Сборка контейнера Node.js
└── package.json
```
