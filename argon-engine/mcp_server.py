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
    Отправляет архитектурную или кодинговую задачу напрямую в сессию Gemini 4 Argon.
    Позволяет приложить содержимое файлов из /workspace для контекста.
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
    Запускает полный автономный цикл агента (ReAct loop) прямо на сервере в папке /workspace.
    Агент может читать файлы, создавать код и запускать shell/git команды, после чего вернет готовый отчет.
    """
    result = await core.run_autonomous_task(goal, max_iterations=5)
    if result["success"]:
        return f"✅ Задача успешно выполнена за {result.get('iterations', 1)} шаг(ов):\n\n{result['report']}"
    else:
        return f"❌ Ошибка выполнения задачи: {result.get('error', 'Неизвестная ошибка')}\nОтчет: {result.get('report', '')}"

@mcp.tool()
async def reset_argon_context() -> str:
    """
    Очищает историю текущего диалога с Gemini 4 Argon.
    """
    await core.reset_session()
    return "✅ История сессии Gemini 4 Argon успешно очищена."

if __name__ == "__main__":
    # Запуск MCP через stdio (идеально для SSH подключения из Antigravity)
    asyncio.run(core.init_client())
    mcp.run()
