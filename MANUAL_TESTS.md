# 📑 Реестр руководств по мануальному тестированию (Manual Test Guides)

В данном файле собрана единая навигация по всем руководствам мануального тестирования проектов экосистемы **Onter** (AI Backend, Minecraft RPG, FiveM Scrap Evolution и сервисные подсистемы).

---

## 🤖 1. Backend & AI Service (`onter-ai`)

| Руководство | Назначение / Проверяемые подсистемы | Локация файла |
| :--- | :--- | :--- |
| 📖 [**01_AI_Service_Manual_Test_Guide.md**](file:///E:/obsidian/Onter/projects/01_AI_Service_Manual_Test_Guide.md) | **Основные функции AI Сервиса**: Интеграция с API новостей (`https://onter.pp.ua/api/news`), Универсальный Tool Engine (`get_latest_news`, `get_news_detail`), Telegram-бот, форматирование сообщений и сжатие контекста. | Obsidian: `projects/01_AI_Service_Manual_Test_Guide.md` |
| 🧪 [**Auto Test Suite**](file:///e:/ai/onter-ai/tests/) | **Автоматические юнит-тесты** (`npm test`):<br>• [news.service.test.ts](file:///e:/ai/onter-ai/tests/news.service.test.ts) — Фетчинг новостей и кэш<br>• [tool.registry.test.ts](file:///e:/ai/onter-ai/tests/tool.registry.test.ts) — Реестр и генерация схем тулов<br>• [tool.executor.test.ts](file:///e:/ai/onter-ai/tests/tool.executor.test.ts) — Парсинг native & prompt fallback тулов<br>• [telegram.test.ts](file:///e:/ai/onter-ai/tests/telegram.test.ts) — Фильтрация реплаев бота<br>• [formatter.test.ts](file:///e:/ai/onter-ai/tests/formatter.test.ts) — Разметка HTML/Discord/Minecraft | Проект: `tests/` |

---

## 🎮 2. Minecraft RPG Server & Mythic+ Dungeons

| Руководство | Назначение / Проверяемые подсистемы | Локация файла |
| :--- | :--- | :--- |
| ⚔️ [**01_Manual_Test_Guide.md**](file:///E:/obsidian/Onter/minecraft/rpg/01_Manual_Test_Guide.md) | **Mythic+ Подземелья & Механики**: Генерация ключей (`KeystoneItem`), запуск данжей в пустотном мире, Zero Griefing (Mixin защита мира), креатив-табы, блоки-маркеры, разметка NBT структур, Pack Aggro и Boundary Lock. | Obsidian: `minecraft/rpg/01_Manual_Test_Guide.md` |

---

## 🚗 3. FiveM & Scrap Evolution

| Руководство | Назначение / Проверяемые подсистемы | Локация файла |
| :--- | :--- | :--- |
| 🔧 [**03_Manual_Test_Guide.md**](file:///E:/obsidian/Onter/scrap/03_Manual_Test_Guide.md) | **Сборка & Игровой функционал Scrap**: Игровые механики, кастомные скрипты, экономика и клиентско-серверное взаимодействие. | Obsidian: `scrap/03_Manual_Test_Guide.md` |

---

## 🚀 Как запустить автоматические тесты в `onter-ai`

```bash
# Запуск всех модульных тестов
npm test

# Запуск билда TypeScript
npm run build
```
