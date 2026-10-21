# 🧠 RAG & Vector Search Architecture (`onter-ai`)

Модуль локального векторного поиска (Retrieval-Augmented Generation) позволяет `onter-ai` использовать ваши заметки из **Obsidian** (инструкции, рецепты майнкрафта, механики FiveM, правила и конфигурации) для формирования 100% точных ответов на базе фактов с нулевыми галлюцинациями.

---

## 🏗️ Архитектура системы

Система построена на разделении на два контура: **Индексация (ПК разработчика)** и **Быстрый поиск (Хостинг / Сервер)**.

```text
[ ЛОКАЛЬНЫЙ ПК РАЗРАБОТЧИКА ]
  1. Заметки Obsidian (E:\obsidian\Onter\DB)
     ├── minecraft/    -> project_id: "minecraft"
     ├── fivem/        -> project_id: "fivem"
     ├── scrap/        -> project_id: "scrap_evolution"
     └── common/       -> project_id: "general"
  2. MarkdownChunker: нарезка файлов по заголовкам (#, ##, ###)
  3. EmbeddingService: локальная генерация эмбеддингов (ONNX Xenova/multilingual-e5-small, 384 dim)
  4. Сохранение чанков в базу данных или передача на сервер

[ VPS / ХОСТИНГ СЕРВЕР (Oracle Cloud ARM64) ]
  1. Игрок или пользователь присылает вопрос (с projectId: "minecraft" или "fivem")
  2. EmbeddingService переводит вопрос в вектор за ~15–20 мс
  3. Векторный запрос в PostgreSQL (pgvector HNSW индекс):
     SELECT * FROM knowledge_chunks 
     WHERE project_id IN ($projectId, 'general')
     ORDER BY embedding <=> $queryEmbedding LIMIT 5;
  4. База данных за 2–5 мс возвращает только наиболее релевантные чанки
  5. Чанки инжектируются в System Prompt LLM модели
  6. Модель отвечает со 100% точностью по правилам сервера
```

---

## 🗄️ Схема Базы Данных (PostgreSQL 16 + pgvector)

Таблица векторных чанков:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id SERIAL PRIMARY KEY,
  project_id VARCHAR(50) NOT NULL DEFAULT 'general',
  file_path VARCHAR(255) NOT NULL,
  header VARCHAR(255),
  content TEXT NOT NULL,
  embedding vector(384) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Индекс для мгновенной фильтрации по проекту
CREATE INDEX IF NOT EXISTS idx_chunks_project ON knowledge_chunks(project_id);

-- Индекс HNSW для приближенного векторного поиска по косинусному сходству
CREATE INDEX IF NOT EXISTS idx_chunks_vector 
ON knowledge_chunks 
USING hnsw (embedding vector_cosine_ops);
```

Таблица сессий и истории диалогов:

```sql
CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR(100) PRIMARY KEY,                  -- Напр. "mc:PlayerNick" или "tg:12345678"
  project_id VARCHAR(50) NOT NULL DEFAULT 'general',
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,  -- Скользящее окно из 10 сообщений
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);
```

---

## 🛡️ Изоляция проектов (`projectId`)

Благодаря предварительной фильтрации (Pre-Filtering):
* Запросы от сервера **Minecraft** ищут чанки только со статусом `project_id IN ('minecraft', 'general')`. Чанки FiveM физически отсекаются на уровне базы данных.
* Запросы от **FiveM** видят только данные `fivem` и `general`.
* Документы из категории `general` (общие правила проекта, регламент администрации, донат) доступны обоим направлениям.

---

## 🚀 Команды управления RAG

### 1. Индексация заметок (ПК)
```bash
# Обычная доиндексация
npm run index:obsidian

# Очистить всю базу и переиндексировать заново
npm run index:obsidian -- --clear
```

### 2. Миграция данных в PostgreSQL
```bash
npm run migrate:postgres
```

Скрипт автоматически:
1. Забирает данные из MariaDB или файла `data/knowledge_chunks.json`.
2. Автоматически проставляет `project_id` по путям файлов.
3. Пакетно загружает все 3 871+ чанков в PostgreSQL.
4. Создает и проверяет HNSW индекс.
