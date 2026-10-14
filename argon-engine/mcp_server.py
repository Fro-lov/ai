import asyncio
import os
import sys
from pathlib import Path
from typing import List
from dotenv import load_dotenv

load_dotenv("/opt/argon-engine/.env")

try:
    from mcp.server.fastmcp import FastMCP
except ImportError:
    print("[ERROR] FastMCP is not installed. Please install 'mcp'", file=sys.stderr)
    sys.exit(1)

from argon_core import ArgonCore

# Инициализируем FastMCP сервер
mcp = FastMCP("Argon-Bridge-Hub")
core = ArgonCore()

@mcp.tool()
async def ask_argon(task: str, context_files: List[str] = []) -> str:
    """
    Отправляет сложную архитектурную или кодинговую задачу напрямую в сессию Gemini 4 Argon.
    
    ПРАВИЛО ЭКОНОМИИ КВОТЫ (Flash — руки, Argon — мозг):
    Базовый агент в Antigravity (Flash) должен сам найти нужные файлы и лог ошибки,
    и передать в context_files ТОЛЬКО 1-2 ключевых файла (не больше!), задав конкретный вопрос.
    Не заставляй Argon искать файлы или анализировать весь проект целиком!
    """
    context_text = ""
    if context_files:
        context_parts = []
        for file_path in context_files:
            content = core.executor.read_file(file_path)
            context_parts.append(f"=== File: {file_path} ===\n{content}")
        context_text = "\n\n".join(context_parts) + "\n\n"

    full_prompt = f"{context_text}ЗАДАЧА:\n{task}"
    reply = await core.chat(full_prompt)
    return reply

@mcp.tool()
async def argon_autonomous_task(goal: str) -> str:
    """
    Запускает автономный цикл агента на сервере в папке /workspace с жестким лимитом в 3 шага (защита от бесконечных циклов).
    Если за 3 шага сборка или задача не решена, агент прерывается и возвращает детальный лог ошибки.
    """
    result = await core.run_autonomous_task(goal, max_iterations=3)
    if result["success"]:
        return f"✅ Задача успешно выполнена за {result.get('iterations', 1)} шаг(ов):\n\n{result['report']}"
    else:
        return f"❌ Ошибка / прерывание цикла: {result.get('error', 'Лимит шагов исчерпан')}\nОтчет: {result.get('report', '')}"

@mcp.tool()
async def reset_argon_context() -> str:
    """
    Очищает контекст диалога с Gemini 4 Argon.
    ВАЖНО: Вызывай после каждой завершенной фичи или исправленного бага!
    Чистая сессия расходует в 5-10 раз меньше квоты, чем длинный диалог.
    """
    await core.reset_session()
    return "✅ Контекст сессии Gemini 4 Argon успешно сброшен."

if __name__ == "__main__":
    # Запуск MCP через stdio (идеально для SSH подключения из Antigravity)
    asyncio.run(core.init_client())
    mcp.run()
