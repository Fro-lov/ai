import asyncio
import os
import sys
from pathlib import Path
from typing import List
import httpx
from dotenv import load_dotenv

load_dotenv("/opt/argon-engine/.env")

try:
    from mcp.server.fastmcp import FastMCP
except ImportError:
    print("[ERROR] FastMCP is not installed. Please install 'mcp'", file=sys.stderr)
    sys.exit(1)

mcp = FastMCP("Argon-Bridge-Hub")
API_BASE = "http://127.0.0.1:8085"
SECRET_TOKEN = os.environ.get("ARGON_SECRET_TOKEN", "onter_argon_secret_2026")
HEADERS = {
    "Authorization": f"Bearer {SECRET_TOKEN}",
    "Content-Type": "application/json"
}

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
        workspace_dir = Path(os.environ.get("WORKSPACE_DIR", "/workspace"))
        context_parts = []
        for file_path in context_files:
            target = (workspace_dir / file_path).resolve()
            if target.is_relative_to(workspace_dir) and target.exists() and target.is_file():
                try:
                    content = target.read_text(encoding="utf-8", errors="replace")[:20000]
                    context_parts.append(f"=== File: {file_path} ===\n{content}")
                except Exception as e:
                    context_parts.append(f"=== File: {file_path} (Ошибка чтения: {e}) ===")
        if context_parts:
            context_text = "\n\n".join(context_parts) + "\n\n"

    full_prompt = f"{context_text}ЗАДАЧА:\n{task}"
    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            res = await client.post(f"{API_BASE}/api/chat", json={
                "messages": [{"role": "user", "content": full_prompt}]
            }, headers=HEADERS)
            if res.status_code == 200:
                data = res.json()
                return data.get("content", str(data))
            return f"❌ Ошибка API ({res.status_code}): {res.text}"
    except Exception as e:
        return f"❌ Ошибка связи с Argon Gateway: {e}"

@mcp.tool()
async def argon_autonomous_task(goal: str) -> str:
    """
    Запускает автономный цикл агента на сервере в папке /workspace с жестким лимитом в 3 шага (защита от бесконечных циклов).
    Если за 3 шага сборка или задача не решена, агент прерывается и возвращает детальный лог ошибки.
    """
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            res = await client.post(f"{API_BASE}/api/agent/task", json={
                "goal": goal,
                "max_iterations": 3
            }, headers=HEADERS)
            if res.status_code == 200:
                result = res.json()
                if result.get("success"):
                    return f"✅ Задача успешно выполнена за {result.get('iterations', 1)} шаг(ов):\n\n{result.get('report')}"
                else:
                    return f"❌ Ошибка / прерывание цикла: {result.get('error', 'Лимит шагов исчерпан')}\nОтчет: {result.get('report', '')}"
            return f"❌ Ошибка вызова агента ({res.status_code}): {res.text}"
    except Exception as e:
        return f"❌ Ошибка связи с Argon Gateway: {e}"

@mcp.tool()
async def reset_argon_context() -> str:
    """
    Очищает контекст диалога с Gemini 4 Argon.
    ВАЖНО: Вызывай после каждой завершенной фичи или исправленного бага!
    Чистая сессия расходует в 5-10 раз меньше квоты, чем длинный диалог.
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            res = await client.post(f"{API_BASE}/api/reset", json={}, headers=HEADERS)
            if res.status_code == 200:
                return res.json().get("message", "✅ Сессия успешно сброшена.")
            return f"❌ Ошибка сброса: {res.text}"
    except Exception as e:
        return f"❌ Ошибка связи с Argon Gateway: {e}"

if __name__ == "__main__":
    mcp.run()
