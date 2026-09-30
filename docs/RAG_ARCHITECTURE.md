# 🧠 RAG & Vector Search Architecture (`onter-ai`)

Модуль локального векторного поиска (Retrieval-Augmented Generation) позволяет `onter-ai` использовать ваши заметки из **Obsidian** (инструкции, рецепты майнкрафта, IP-адреса, конфигурации) для формирования 100% точных ответов на базе фактов.

---

## 🏗️ Архитектура системы

Схема работы разделена на два независимых процесса: **Индексация (на ПК)** и **Поиск (на VPS/Сервере)**.

```text
[ ЛОКАЛЬНЫЙ ПК ]
  1. Заметки Obsidian (E:\obsidian\Onter)
  2. MarkdownChunker (нарезка по заголовкам #, ##, ###)
  3. EmbeddingService (локальная ONNX-модель Xenova/multilingual-e5-small)
  4. VectorRepository (сохранение векторов в MySQL LONGBLOB / local JSON)

[ VPS / СЕРВЕР ]
  1. Пользователь отправляет вопрос через /api/chat или Telegram
  2. EmbeddingService переводит вопрос в вектор на CPU (~20 мс)
  3. VectorRepository загружает векторы и находит топ-3 близких чанка (Cosine Similarity)
  4. Векторный контекст подставляется в System Prompt
  5. Groq LLM генерирует финальный фактологический ответ
```

---

## 🗄️ Схема Базы Данных (MySQL / MariaDB)

Векторы хранятся в таблице `knowledge_chunks`:

```sql
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  file_path VARCHAR(255) NOT NULL,    -- Путь к заметке (напр. "projects/Minecraft.md")
  header VARCHAR(255),                 -- Заголовок секции (напр. "### Рецепт Турбины")
  content TEXT NOT NULL,               -- Текст чанка
  embedding LONGBLOB NOT NULL,         -- Бинарный вектор (Float32Array, 384 измерения)
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_file (file_path)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

> **Фоллбэк режим (Fallback):** Если переменные `MYSQL_HOST` не заданы в `.env` или MySQL недоступен, система автоматически переключается на файл `data/knowledge_chunks.json` без падения сервера.

---

## 🚀 Команды для использования

### 1. Индексация заметок Obsidian (на ПК)

Для запуска векторизации и сохранения заметок в базу данных выполните команду:

```bash
npm run index:obsidian
```

Вы также можете передать кастомный путь к хранилищу Obsidian или сбросить индекс перед загрузкой:

```bash
# Индексация с предварительной очисткой базы
npm run index:obsidian -- --clear

# Указание кастомной папки
npm run index:obsidian "E:\obsidian\Onter\projects"
```

---

## ⚙️ Конфигурация в `.env`

Добавьте в `.env` реквизиты вашей MariaDB / MySQL (опционально):

```env
# Опционально: Настройки MySQL для векторного хранения
MYSQL_HOST=85.17.118.39
MYSQL_PORT=3306
MYSQL_USER=vpn_user
MYSQL_PASSWORD=your_password
MYSQL_DATABASE=onter_ai

# Путь к Obsidian (для ПК)
OBSIDIAN_PATH=E:\obsidian\Onter
```

---

## 🧬 Технические детали векторизации

1. **Модель эмбеддингов**: `Xenova/multilingual-e5-small` (384 измерений).
2. **Форматирование E5**: Для документов используется префикс `passage: `, а для запросов — `query: `.
3. **Метод измерения сходства**: Косинусное сходство (Cosine Similarity). Значения от `0.0` до `1.0`. Чанки с релевантностью ниже `0.4` отсекаются.
