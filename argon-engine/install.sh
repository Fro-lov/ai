#!/usr/bin/env bash
set -e

# ==============================================================================
# ⚡ Argon Bridge Hub & Onter AI — Автономный Установщик для Linux (ARM64/x86_64)
# Поддерживает Oracle Linux 8/9 (dnf) и Ubuntu/Debian (apt)
# ==============================================================================

echo "=========================================================="
echo "🚀 Установка автономного агентского хаба Argon Bridge Hub"
echo "=========================================================="

CURRENT_USER=$(whoami)
if [ "$CURRENT_USER" = "root" ]; then
    TARGET_USER="opc"
    if ! id "$TARGET_USER" &>/dev/null; then
        TARGET_USER="ubuntu"
        if ! id "$TARGET_USER" &>/dev/null; then
            TARGET_USER="root"
        fi
    fi
else
    TARGET_USER="$CURRENT_USER"
fi

echo "[INFO] Установка выполняется для пользователя: $TARGET_USER"

# Определение пакетного менеджера
if command -v dnf &>/dev/null; then
    PKG_MANAGER="dnf"
elif command -v apt-get &>/dev/null; then
    PKG_MANAGER="apt"
else
    echo "❌ Ошибка: Не найден поддерживаемый пакетный менеджер (dnf/apt)."
    exit 1
fi

echo "[INFO] Обнаружен пакетный менеджер: $PKG_MANAGER"

# Интерактивный запрос параметров
echo ""
echo "--- Ввод конфигурационных данных ---"

read -r -p "Введите Google Cookie __Secure-1PSID: " SECURE_1PSID
read -r -p "Введите Google Cookie __Secure-1PSIDTS: " SECURE_1PSIDTS
read -r -p "Введите Telegram Bot Token: " TG_BOT_TOKEN
read -r -p "Введите ваш цифровой Telegram ID (Admin): " ADMIN_TELEGRAM_IDS
read -r -p "Введите секретный токен для локального API (Enter для генерации): " ARGON_SECRET_TOKEN

if [ -z "$ARGON_SECRET_TOKEN" ]; then
    ARGON_SECRET_TOKEN=$(head -c 16 /dev/urandom | xxd -p 2>/dev/null || date +%s%N | sha256sum | head -c 32)
fi

echo ""
echo "[1/6] Установка системных зависимостей ($PKG_MANAGER)..."
if [ "$PKG_MANAGER" = "dnf" ]; then
    sudo dnf update -y
    sudo dnf install -y python39 python39-pip python39-devel git curl gcc tar
    PYTHON_CMD="python3.9"
else
    sudo apt-get update -y
    sudo apt-get install -y python3 python3-pip python3-venv git curl gcc tar
    PYTHON_CMD="python3"
fi

# Установка Node.js 20 LTS (для onter-ai), если не установлен
if ! command -v node &>/dev/null; then
    echo "[INFO] Установка Node.js 20 LTS..."
    curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash - 2>/dev/null || curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    if [ "$PKG_MANAGER" = "dnf" ]; then
        sudo dnf install -y nodejs
    else
        sudo apt-get install -y nodejs
    fi
fi

echo "[2/6] Создание изолированных директорий..."
sudo mkdir -p /opt/argon-engine
sudo mkdir -p /opt/onter-ai
sudo mkdir -p /workspace

sudo chown -R "$TARGET_USER":"$TARGET_USER" /opt/argon-engine
sudo chown -R "$TARGET_USER":"$TARGET_USER" /opt/onter-ai
sudo chown -R "$TARGET_USER":"$TARGET_USER" /workspace

echo "[3/6] Развертывание файлов Argon Engine..."

# 1. requirements.txt
cat << 'EOF' > /opt/argon-engine/requirements.txt
fastapi>=0.110.0
uvicorn>=0.28.0
pydantic>=2.0.0
gemini-webapi>=1.4.0
mcp>=1.0.0
python-dotenv>=1.0.0
EOF

# 2. workspace_executor.py
cat << 'EOF' > /opt/argon-engine/workspace_executor.py
import asyncio
import os
from pathlib import Path

WORKSPACE_ROOT = Path(os.environ.get("WORKSPACE_DIR", "/workspace")).resolve()

class WorkspaceExecutor:
    def __init__(self, workspace_path: Path = WORKSPACE_ROOT):
        self.workspace = workspace_path
        self.workspace.mkdir(parents=True, exist_ok=True)

    def _resolve_safe_path(self, rel_path: str) -> Path:
        clean_rel = rel_path.strip().lstrip("/\\")
        target = (self.workspace / clean_rel).resolve()
        if not str(target).startswith(str(self.workspace)):
            raise PermissionError(f"Access denied: path '{rel_path}' is outside workspace")
        return target

    def read_file(self, rel_path: str) -> str:
        safe_path = self._resolve_safe_path(rel_path)
        if not safe_path.exists():
            return f"[ERROR: File '{rel_path}' does not exist]"
        if safe_path.is_dir():
            return f"[ERROR: '{rel_path}' is a directory]"
        try:
            return safe_path.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            return f"[ERROR reading '{rel_path}': {e}]"

    def write_file(self, rel_path: str, content: str) -> str:
        safe_path = self._resolve_safe_path(rel_path)
        try:
            safe_path.parent.mkdir(parents=True, exist_ok=True)
            safe_path.write_text(content, encoding="utf-8")
            return f"[SUCCESS: File '{rel_path}' written successfully ({len(content)} bytes)]"
        except Exception as e:
            return f"[ERROR writing '{rel_path}': {e}]"

    async def execute_command(self, command: str, timeout: int = 60) -> str:
        clean_cmd = command.strip()
        if not clean_cmd:
            return "[Empty command]"

        try:
            process = await asyncio.create_subprocess_shell(
                clean_cmd,
                cwd=str(self.workspace),
                stdin=asyncio.subprocess.DEVNULL,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            try:
                stdout_b, stderr_b = await asyncio.wait_for(process.communicate(), timeout=timeout)
                stdout = stdout_b.decode("utf-8", errors="replace")
                stderr = stderr_b.decode("utf-8", errors="replace")
                code = process.returncode

                output = ""
                if stdout:
                    output += stdout
                if stderr:
                    output += f"\n[STDERR]:\n{stderr}"
                
                if len(output) > 4000:
                    output = output[:2000] + f"\n... [Вывод обрезан: всего {len(output)} символов] ...\n" + output[-1800:]

                return f"[Exit code: {code}]\n{output.strip()}"
            except asyncio.TimeoutError:
                try:
                    process.kill()
                except Exception:
                    pass
                return f"[ERROR: Command timed out after {timeout} seconds and was killed]"
        except Exception as e:
            return f"[ERROR executing command '{clean_cmd}': {e}]"
EOF

# 3. argon_core.py
cat << 'EOF' > /opt/argon-engine/argon_core.py
import asyncio
import os
import re
import time
from pathlib import Path
from typing import Optional, Dict, Any

try:
    from gemini_webapi import GeminiClient
except ImportError:
    GeminiClient = None

from workspace_executor import WorkspaceExecutor

SYSTEM_AGENT_PROMPT = """Ты — автономный серверный ИИ-агент «Gemini 4 Argon» в экосистеме Onter.
Твоя рабочая среда находится строго в директории `/workspace` на сервере Linux (Oracle Cloud ARM64).

Ты можешь взаимодействовать с файловой системой и выполнять команды в терминале с помощью специальных XML-тегов:

1. Чтение файла:
   <read path="rel/path/to/file.txt"/>

2. Запись/создание файла:
   <write path="rel/path/to/file.txt">
   ...содержимое файла...
   </write>

3. Выполнение shell-команды в /workspace:
   <cmd>bash command here</cmd>

ПРАВИЛА:
- Действуй по циклу ReAct: Рассуждение -> Действие -> Наблюдение.
- Все пути указывай относительно /workspace.
- Когда задача выполнена, предоставь финальный отчет на русском языке БЕЗ новых тегов действий.
"""

class ArgonCore:
    def __init__(self, secure_1psid: str = "", secure_1psidts: str = ""):
        self.secure_1psid = secure_1psid or os.environ.get("SECURE_1PSID", "")
        self.secure_1psidts = secure_1psidts or os.environ.get("SECURE_1PSIDTS", "")
        self.env_file_path = os.environ.get("ENV_FILE_PATH", "/opt/argon-engine/.env")
        
        self.client = None
        self.chat_session = None
        self.lock = asyncio.Lock()
        self.executor = WorkspaceExecutor()
        self.start_time = time.time()
        self.busy = False

    async def init_client(self):
        if not self.secure_1psid or not self.secure_1psidts:
            print("[WARN] SECURE_1PSID or SECURE_1PSIDTS is empty.")
            return False

        if GeminiClient is None:
            print("[ERROR] gemini_webapi is not installed.")
            return False

        try:
            print("[INFO] Initializing GeminiClient...")
            self.client = GeminiClient(
                secure_1psid=self.secure_1psid,
                secure_1psidts=self.secure_1psidts,
                auto_refresh=True
            )
            await self.client.init()
            self.chat_session = self.client.start_chat()
            print("[INFO] GeminiClient connected!")
            return True
        except Exception as e:
            print(f"[ERROR] Failed to initialize GeminiClient: {e}")
            self.client = None
            self.chat_session = None
            return False

    async def update_cookies(self, secure_1psid: str, secure_1psidts: str) -> bool:
        async with self.lock:
            self.secure_1psid = secure_1psid.strip()
            self.secure_1psidts = secure_1psidts.strip()
            try:
                env_path = Path(self.env_file_path)
                if env_path.exists():
                    content = env_path.read_text(encoding="utf-8")
                    content = re.sub(r"SECURE_1PSID=.*", f"SECURE_1PSID={self.secure_1psid}", content)
                    content = re.sub(r"SECURE_1PSIDTS=.*", f"SECURE_1PSIDTS={self.secure_1psidts}", content)
                    env_path.write_text(content, encoding="utf-8")
            except Exception as e:
                print(f"[WARN] Failed to write to .env: {e}")

            return await self.init_client()

    async def reset_session(self):
        async with self.lock:
            if self.client:
                self.chat_session = self.client.start_chat()
            return True

    async def chat(self, prompt: str) -> str:
        async with self.lock:
            if not self.client or not self.chat_session:
                if not await self.init_client():
                    return "❌ Ошибка: Сессия Gemini 4 Argon не активна. Обновите куки через /cookies."

            self.busy = True
            try:
                response = await self.chat_session.send_message(prompt)
                return response.text if hasattr(response, "text") else str(response)
            except Exception as e:
                return f"❌ Ошибка вызова Gemini 4: {e}"
            finally:
                self.busy = False

    async def run_autonomous_task(self, goal: str, max_iterations: int = 5) -> Dict[str, Any]:
        async with self.lock:
            if not self.client or not self.chat_session:
                if not await self.init_client():
                    return {
                        "success": False,
                        "goal": goal,
                        "report": "Сессия Gemini 4 Argon не активна. Требуется авторизация.",
                        "error": "Auth session expired"
                    }

            self.busy = True
            try:
                task_chat = self.client.start_chat()
                initial_prompt = f"{SYSTEM_AGENT_PROMPT}\n\nЗАДАЧА:\n{goal}\n\nПриступай к выполнению."
                
                current_response_text = ""
                iteration_logs = []

                for iteration in range(1, max_iterations + 1):
                    prompt_to_send = initial_prompt if iteration == 1 else current_response_text
                    response = await task_chat.send_message(prompt_to_send)
                    raw_text = response.text if hasattr(response, "text") else str(response)
                    
                    actions_found = False
                    step_observations = []

                    for match in re.finditer(r'<read\s+path=["\']([^"\']+)["\']\s*/>', raw_text):
                        actions_found = True
                        rel_path = match.group(1)
                        content = self.executor.read_file(rel_path)
                        step_observations.append(f"[Observation read '{rel_path}']:\n{content}")

                    for match in re.finditer(r'<write\s+path=["\']([^"\']+)["\']>(.*?)</write>', raw_text, re.DOTALL):
                        actions_found = True
                        rel_path = match.group(1)
                        file_content = match.group(2)
                        res = self.executor.write_file(rel_path, file_content)
                        step_observations.append(f"[Observation write '{rel_path}']:\n{res}")

                    for match in re.finditer(r'<cmd>(.*?)</cmd>', raw_text, re.DOTALL):
                        actions_found = True
                        cmd = match.group(1).strip()
                        cmd_res = await self.executor.execute_command(cmd)
                        step_observations.append(f"[Observation cmd '{cmd}']:\n{cmd_res}")

                    if not actions_found:
                        return {
                            "success": True,
                            "goal": goal,
                            "report": raw_text.strip(),
                            "iterations": iteration,
                            "logs": iteration_logs
                        }

                    obs_text = "\n\n".join(step_observations)
                    iteration_logs.append(f"--- Итерация {iteration} ---\n{obs_text}")
                    current_response_text = f"Результаты выполнения действий:\n{obs_text}\n\nПроанализируй результат и продолжай решение задачи либо дай финальный отчет."

                return {
                    "success": True,
                    "goal": goal,
                    "report": f"Достигнут лимит в {max_iterations} итераций.\n{raw_text}",
                    "iterations": max_iterations,
                    "logs": iteration_logs
                }
            except Exception as e:
                return {
                    "success": False,
                    "goal": goal,
                    "report": f"Сбой ReAct-цикла: {e}",
                    "error": str(e)
                }
            finally:
                self.busy = False

    def get_status(self) -> Dict[str, Any]:
        stat = os.statvfs(str(self.executor.workspace))
        free_gb = round((stat.f_bavail * stat.f_frsize) / (1024 ** 3), 2)
        return {
            "sessionActive": self.client is not None,
            "busy": self.busy,
            "freeDiskGb": free_gb,
            "uptimeSeconds": round(time.time() - self.start_time)
        }
EOF

# 4. server.py
cat << 'EOF' > /opt/argon-engine/server.py
import os
import uvicorn
from fastapi import FastAPI, Header, HTTPException, Depends, status
from pydantic import BaseModel
from typing import Optional, List

from argon_core import ArgonCore

SECRET_TOKEN = os.environ.get("ARGON_SECRET_TOKEN", "onter_argon_secret_2026")

app = FastAPI(title="Argon Engine API Gateway", version="1.0.0")
core = ArgonCore()

async def verify_token(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing Authorization header")
    parts = authorization.split()
    if len(parts) != 2 or parts[0].lower() != "bearer" or parts[1] != SECRET_TOKEN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid token")

class ChatMessage(BaseModel):
    role: str
    content: str
    author: Optional[str] = None

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    max_tokens: Optional[int] = None

class TaskRequest(BaseModel):
    goal: str
    max_iterations: Optional[int] = 5

class CookiesRequest(BaseModel):
    secure_1psid: str
    secure_1psidts: str

@app.on_event("startup")
async def on_startup():
    print("[SERVER] Starting Argon Engine server on 127.0.0.1:8085...")
    await core.init_client()

@app.get("/api/status", dependencies=[Depends(verify_token)])
async def get_status():
    return core.get_status()

@app.post("/api/chat", dependencies=[Depends(verify_token)])
async def chat_endpoint(req: ChatRequest):
    last_user_msg = next((m.content for m in reversed(req.messages) if m.role == "user"), "")
    if not last_user_msg:
        raise HTTPException(status_code=400, detail="No user message provided")
    reply = await core.chat(last_user_msg)
    return {"content": reply, "model": "Gemini 4 Argon (Web Session)"}

@app.post("/api/agent/task", dependencies=[Depends(verify_token)])
async def agent_task_endpoint(req: TaskRequest):
    return await core.run_autonomous_task(req.goal, max_iterations=req.max_iterations or 5)

@app.post("/api/cookies", dependencies=[Depends(verify_token)])
async def update_cookies_endpoint(req: CookiesRequest):
    success = await core.update_cookies(req.secure_1psid, req.secure_1psidts)
    if success:
        return {"success": True, "message": "Куки успешно обновлены и сессия активна."}
    else:
        return {"success": False, "message": "Куки сохранены, но не удалось инициализировать сессию."}

@app.post("/api/reset", dependencies=[Depends(verify_token)])
async def reset_endpoint():
    await core.reset_session()
    return {"success": True, "message": "Контекст диалога сброшен."}

if __name__ == "__main__":
    uvicorn.run("server:app", host="127.0.0.1", port=8085, log_level="info")
EOF

# 5. mcp_server.py
cat << 'EOF' > /opt/argon-engine/mcp_server.py
import asyncio
import os
import sys
from pathlib import Path
from typing import List

try:
    from mcp.server.fastmcp import FastMCP
except ImportError:
    print("[ERROR] FastMCP is not installed. Please install 'mcp'", file=sys.stderr)
    sys.exit(1)

from argon_core import ArgonCore

mcp = FastMCP("Argon-Bridge-Hub")
core = ArgonCore()

@mcp.tool()
async def ask_argon(task: str, context_files: List[str] = []) -> str:
    """Отправляет задачу в Gemini 4 Argon с контекстом указанных файлов."""
    context_text = ""
    if context_files:
        context_parts = []
        for file_path in context_files:
            content = core.executor.read_file(file_path)
            context_parts.append(f"=== File: {file_path} ===\n{content}")
        context_text = "\n\n".join(context_parts) + "\n\n"

    full_prompt = f"{context_text}ЗАДАЧА:\n{task}"
    return await core.chat(full_prompt)

@mcp.tool()
async def argon_autonomous_task(goal: str) -> str:
    """Запускает автономный цикл агента (ReAct loop) на сервере в /workspace."""
    result = await core.run_autonomous_task(goal, max_iterations=5)
    if result["success"]:
        return f"✅ Успешно за {result.get('iterations', 1)} шаг(ов):\n\n{result['report']}"
    else:
        return f"❌ Ошибка: {result.get('error', 'Неизвестная ошибка')}\n{result.get('report', '')}"

@mcp.tool()
async def reset_argon_context() -> str:
    """Очищает историю сессии Gemini 4 Argon."""
    await core.reset_session()
    return "✅ История сессии Gemini 4 Argon успешно очищена."

if __name__ == "__main__":
    asyncio.run(core.init_client())
    mcp.run()
EOF

# 6. Конфигурационный файл .env
cat << EOF > /opt/argon-engine/.env
SECURE_1PSID=${SECURE_1PSID}
SECURE_1PSIDTS=${SECURE_1PSIDTS}
ARGON_SECRET_TOKEN=${ARGON_SECRET_TOKEN}
WORKSPACE_DIR=/workspace
ENV_FILE_PATH=/opt/argon-engine/.env
EOF
chmod 600 /opt/argon-engine/.env
chown "$TARGET_USER":"$TARGET_USER" /opt/argon-engine/.env

echo "[4/6] Создание виртуального окружения Python..."
$PYTHON_CMD -m venv /opt/argon-engine/venv
/opt/argon-engine/venv/bin/pip install --upgrade pip
/opt/argon-engine/venv/bin/pip install -r /opt/argon-engine/requirements.txt
chown -R "$TARGET_USER":"$TARGET_USER" /opt/argon-engine/venv

echo "[5/6] Создание Systemd сервиса argon-engine..."
sudo bash -c "cat << EOF > /etc/systemd/system/argon-engine.service
[Unit]
Description=Argon Bridge Hub (Gemini 4 Argon Gateway)
After=network.target

[Service]
Type=simple
User=$TARGET_USER
WorkingDirectory=/opt/argon-engine
EnvironmentFile=/opt/argon-engine/.env
ExecStart=/opt/argon-engine/venv/bin/python /opt/argon-engine/server.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF"

sudo systemctl daemon-reload
sudo systemctl enable --now argon-engine.service

echo "[6/6] Подготовка репозитория Onter AI..."
if [ ! -d "/opt/onter-ai/.git" ]; then
    echo "[INFO] Клонирование Onter AI из GitHub..."
    git clone https://github.com/Fro-lov/ai.git /opt/onter-ai
fi

chown -R "$TARGET_USER":"$TARGET_USER" /opt/onter-ai

# Настройка .env для Onter AI
cat << EOF > /opt/onter-ai/.env
PORT=3001
HOST=0.0.0.0
GROQ_API_KEY=your_groq_key_here
GROQ_MODEL=llama-3.1-8b-instant
AI_DEFAULT_PROVIDER=groq
TELEGRAM_BOT_TOKEN=${TG_BOT_TOKEN}
TELEGRAM_ENABLED=true
ADMIN_TELEGRAM_IDS=${ADMIN_TELEGRAM_IDS}
ARGON_ENGINE_URL=http://127.0.0.1:8085
ARGON_SECRET_TOKEN=${ARGON_SECRET_TOKEN}
AI_SYSTEM_PROMPT="You are a helpful AI assistant for Onter ecosystem."
EOF
chmod 600 /opt/onter-ai/.env
chown "$TARGET_USER":"$TARGET_USER" /opt/onter-ai/.env

# Сборка onter-ai
cd /opt/onter-ai
sudo -u "$TARGET_USER" npm install
sudo -u "$TARGET_USER" npm run build

# Systemd сервис для onter-ai
sudo bash -c "cat << EOF > /etc/systemd/system/onter-ai.service
[Unit]
Description=Onter AI Gateway (Node.js & Telegram Bot)
After=network.target argon-engine.service

[Service]
Type=simple
User=$TARGET_USER
WorkingDirectory=/opt/onter-ai
EnvironmentFile=/opt/onter-ai/.env
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF"

sudo systemctl daemon-reload
sudo systemctl enable --now onter-ai.service

echo ""
echo "=========================================================="
echo "🎉 Установка успешно завершена!"
echo "=========================================================="
echo "• Статус Argon Engine: sudo systemctl status argon-engine"
echo "• Статус Onter AI:     sudo systemctl status onter-ai"
echo "• Секретный токен API: $ARGON_SECRET_TOKEN"
echo ""
echo "--- СНИППЕТ ДЛЯ GOOGLE ANTIGRAVITY (mcp_config.json на ПК) ---"
cat << EOF
{
  "mcpServers": {
    "argon-hub": {
      "command": "ssh",
      "args": [
        "-i", "C:/Users/onter/.ssh/ssh.key",
        "opc@158.101.188.95",
        "/opt/argon-engine/venv/bin/python", "/opt/argon-engine/mcp_server.py"
      ]
    }
  }
}
EOF
echo "=========================================================="
