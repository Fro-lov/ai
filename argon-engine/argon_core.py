import asyncio
import os
import re
import time
from pathlib import Path
from typing import Optional, Dict, Any, List

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

4. Отправка файла пользователю в Telegram / чат:
   <send_file path="rel/path/to/file.txt" caption="Краткое описание"/>

ПРАВИЛА И ПРИНЦИПЫ:
- Действуй по методологии ReAct: Рассуждение (Thought) -> Действие (Action с тегом) -> Анализ результата (Observation).
- Если для выполнения задачи нужно сначала посмотреть структуру папок, начни с команды `<cmd>ls -la</cmd>`.
- Если тебя попросили создать файл, скрипт или отчет и прислать его — запиши файл через `<write>` или собери через `<cmd>`, а затем вызови `<send_file path="..." caption="..."/>` перед финальным отчетом.
- Все пути указывай относительно `/workspace`. Выход за пределы песочницы заблокирован.
- Выполняй команды аккуратно и последовательно. Не запускай интерактивные команды, требующие ручного ввода (например, используй `apt -y` или `npm install --yes`).
- Когда задача полностью решена, предоставь четкий, структурированный отчет на русском языке БЕЗ вызова новых тегов действий.
"""

class ArgonCore:
    def __init__(self, secure_1psid: str = "", secure_1psidts: str = "", env_file_path: Optional[str] = None):
        self.env_file_path = env_file_path or os.environ.get("ENV_FILE_PATH", "/opt/argon-engine/.env")
        
        # Сначала читаем сохраненные на диске куки из .env (гарантия сохранения между перезапусками)
        file_psid, file_psidts = self._read_cookies_from_env()
        self.secure_1psid = secure_1psid or file_psid or os.environ.get("SECURE_1PSID", "")
        self.secure_1psidts = secure_1psidts or file_psidts or os.environ.get("SECURE_1PSIDTS", "")
        
        self.client = None
        self.chat_session = None
        self.user_sessions: Dict[str, Any] = {}
        self.lock = asyncio.Lock()
        self.executor = WorkspaceExecutor()
        self.start_time = time.time()
        self.busy = False
        self.sync_task = None

    def _read_cookies_from_env(self) -> tuple:
        try:
            env_path = Path(self.env_file_path)
            if not env_path.exists():
                return "", ""
            content = env_path.read_text(encoding="utf-8")
            psid_match = re.search(r"^SECURE_1PSID=(.*)$", content, re.MULTILINE)
            psidts_match = re.search(r"^SECURE_1PSIDTS=(.*)$", content, re.MULTILINE)
            psid = psid_match.group(1).strip() if psid_match else ""
            psidts = psidts_match.group(1).strip() if psidts_match else ""
            return psid, psidts
        except Exception as e:
            print(f"[WARN] Error reading cookies from {self.env_file_path}: {e}")
            return "", ""

    def _save_cookies_to_env(self, secure_1psid: str, secure_1psidts: str):
        try:
            env_path = Path(self.env_file_path)
            if env_path.exists():
                content = env_path.read_text(encoding="utf-8")
                if "SECURE_1PSID=" in content:
                    content = re.sub(r"^SECURE_1PSID=.*$", f"SECURE_1PSID={secure_1psid}", content, flags=re.MULTILINE)
                else:
                    content += f"\nSECURE_1PSID={secure_1psid}\n"
                if "SECURE_1PSIDTS=" in content:
                    content = re.sub(r"^SECURE_1PSIDTS=.*$", f"SECURE_1PSIDTS={secure_1psidts}", content, flags=re.MULTILINE)
                else:
                    content += f"\nSECURE_1PSIDTS={secure_1psidts}\n"
                env_path.write_text(content, encoding="utf-8")
            else:
                env_path.write_text(f"SECURE_1PSID={secure_1psid}\nSECURE_1PSIDTS={secure_1psidts}\n", encoding="utf-8")
            print(f"[INFO] Persistent cookies saved to {self.env_file_path}")
        except Exception as e:
            print(f"[WARN] Failed to write updated cookies to {self.env_file_path}: {e}")

    async def _sync_rotated_cookies_loop(self):
        """Периодически проверяет ротированные Google куки в памяти и сбрасывает их на диск в .env"""
        while True:
            await asyncio.sleep(120)
            try:
                if self.client and hasattr(self.client, "cookies"):
                    current_cookies = dict(self.client.cookies)
                    new_psidts = current_cookies.get("__Secure-1PSIDTS")
                    new_psid = current_cookies.get("__Secure-1PSID") or self.secure_1psid
                    if new_psidts and new_psidts != self.secure_1psidts:
                        self.secure_1psidts = new_psidts
                        self._save_cookies_to_env(new_psid, new_psidts)
                        print(f"[INFO] Auto-persisted Google rotated __Secure-1PSIDTS to disk!")
            except Exception as e:
                print(f"[WARN] Error in cookie sync loop: {e}")

    async def init_client(self):
        if not self.secure_1psid or not self.secure_1psidts:
            print("[WARN] SECURE_1PSID or SECURE_1PSIDTS is empty. Client not initialized.")
            return False

        if GeminiClient is None:
            print("[ERROR] gemini_webapi is not installed.")
            return False

        try:
            print("[INFO] Initializing GeminiClient with web cookies...")
            self.client = GeminiClient(
                secure_1psid=self.secure_1psid,
                secure_1psidts=self.secure_1psidts,
                auto_refresh=True
            )
            await self.client.init()
            self.chat_session = self.client.start_chat()
            self.user_sessions.clear()
            print("[INFO] GeminiClient successfully connected and chat session started!")

            # Запускаем фоновую синхронизацию ротированных кук на диск
            if self.sync_task is None or self.sync_task.done():
                self.sync_task = asyncio.create_task(self._sync_rotated_cookies_loop())

            return True
        except Exception as e:
            print(f"[ERROR] Failed to initialize GeminiClient: {e}")
            self.client = None
            self.chat_session = None
            self.user_sessions.clear()
            return False

    async def update_cookies(self, secure_1psid: str, secure_1psidts: str) -> bool:
        async with self.lock:
            self.secure_1psid = secure_1psid.strip()
            self.secure_1psidts = secure_1psidts.strip()
            self._save_cookies_to_env(self.secure_1psid, self.secure_1psidts)
            return await self.init_client()

    async def reset_session(self, user_id: Optional[str] = None):
        async with self.lock:
            if user_id:
                if user_id in self.user_sessions:
                    del self.user_sessions[user_id]
                return True
            if self.client:
                self.chat_session = self.client.start_chat()
                self.user_sessions.clear()
            return True

    async def chat(self, prompt: str, user_id: str = "default") -> Dict[str, Any]:
        async with self.lock:
            if not self.client:
                if not await self.init_client():
                    return {
                        "content": "❌ Ошибка: Сессия Gemini 4 Argon не активна. Пожалуйста, обновите куки через команду /cookies.",
                        "files": [],
                        "actions": []
                    }

            self.busy = True
            try:
                # Получаем или инициализируем персональную сессию Google Gemini
                if user_id not in self.user_sessions:
                    new_session = self.client.start_chat()
                    try:
                        # Задаем системные инструкции для чата
                        await new_session.send_message(
                            f"{SYSTEM_AGENT_PROMPT}\n\nИнструкции приняты. Ты общаешься напрямую с разработчиком экосистемы Onter. "
                            f"Отвечай на русском языке. Если для ответа или решения требуется выполнить действие на сервере в /workspace, "
                            f"используй теги <read>, <write>, <cmd> или <send_file>."
                        )
                    except Exception as e:
                        print(f"[WARN] Could not send initial prompt to user session: {e}")
                    self.user_sessions[user_id] = new_session

                session = self.user_sessions[user_id]

                # Отправляем сообщение пользователя в живую Google-сессию
                response = await session.send_message(prompt)
                raw_text = response.text if hasattr(response, "text") else str(response)

                sent_files = []
                actions_log = []

                # Проверяем, вызвала ли модель какие-либо действия в /workspace
                for iteration in range(1, 4):
                    step_observations = []
                    actions_found = False

                    # 1. Поиск <read path="..."/>
                    for match in re.finditer(r'<read\s+path=["\']([^"\']+)["\']\s*/>', raw_text):
                        actions_found = True
                        rel_path = match.group(1).strip()
                        content = self.executor.read_file(rel_path)
                        step_observations.append(f"[Observation read '{rel_path}']:\n{content}")
                        actions_log.append(f"Прочитан файл: {rel_path}")

                    # 2. Поиск <write path="...">content</write>
                    for match in re.finditer(r'<write\s+path=["\']([^"\']+)["\']>(.*?)</write>', raw_text, re.DOTALL):
                        actions_found = True
                        rel_path = match.group(1).strip()
                        file_content = match.group(2)
                        res = self.executor.write_file(rel_path, file_content)
                        step_observations.append(f"[Observation write '{rel_path}']:\n{res}")
                        actions_log.append(f"Записан файл: {rel_path}")

                    # 3. Поиск <cmd>command</cmd>
                    for match in re.finditer(r'<cmd>(.*?)</cmd>', raw_text, re.DOTALL):
                        actions_found = True
                        cmd = match.group(1).strip()
                        cmd_res = await self.executor.execute_command(cmd)
                        step_observations.append(f"[Observation cmd '{cmd}']:\n{cmd_res}")
                        actions_log.append(f"Выполнена команда: {cmd}")

                    # 4. Поиск <send_file path="..." caption="..."/>
                    for match in re.finditer(r'<send_file\s+path=["\']([^"\']+)["\'](?:\s+caption=["\']([^"\']*)["\'])?\s*/>', raw_text):
                        actions_found = True
                        rel_path = match.group(1).strip()
                        caption = match.group(2) if match.group(2) else ""
                        try:
                            safe_path = self.executor._resolve_safe_path(rel_path)
                            if safe_path.exists() and safe_path.is_file():
                                sent_files.append({
                                    "path": rel_path,
                                    "filename": safe_path.name,
                                    "caption": caption
                                })
                                step_observations.append(f"[Observation send_file '{rel_path}']: Файл готов к отправке.")
                                actions_log.append(f"Подготовлен к отправке файл: {safe_path.name}")
                            else:
                                step_observations.append(f"[Observation send_file '{rel_path}']: Ошибка — файл не найден.")
                        except Exception as e:
                            step_observations.append(f"[Observation send_file '{rel_path}']: Ошибка доступа — {e}")

                    if not actions_found:
                        break

                    # Передаем результат действий обратно в эту же сессию
                    obs_text = "\n\n".join(step_observations)
                    obs_prompt = f"Результаты выполнения действий на сервере:\n{obs_text}\n\nПроанализируй результат и дай ответ пользователю."
                    response = await session.send_message(obs_prompt)
                    raw_text = response.text if hasattr(response, "text") else str(response)

                return {
                    "content": raw_text.strip(),
                    "files": sent_files,
                    "actions": actions_log
                }
            except Exception as e:
                return {
                    "content": f"❌ Ошибка вызова Gemini 4: {e}",
                    "files": [],
                    "actions": []
                }
            finally:
                self.busy = False

    async def run_autonomous_task(self, goal: str, max_iterations: int = 3) -> Dict[str, Any]:
        async with self.lock:
            if not self.client or not self.chat_session:
                if not await self.init_client():
                    return {
                        "success": False,
                        "goal": goal,
                        "report": "Сессия Gemini 4 Argon не активна. Требуется авторизация через /cookies.",
                        "error": "Auth session expired"
                    }

            self.busy = True
            try:
                # Начинаем чистую изолированную ветку диалога для каждой задачи (экономия квоты)
                task_chat = self.client.start_chat()
                initial_prompt = f"{SYSTEM_AGENT_PROMPT}\n\nЗАДАЧА ОТ ПОЛЬЗОВАТЕЛЯ:\n{goal}\n\nПриступай к выполнению (у тебя максимум {max_iterations} шага)."
                
                current_response_text = ""
                iteration_logs = []
                sent_files = []

                for iteration in range(1, max_iterations + 1):
                    prompt_to_send = initial_prompt if iteration == 1 else current_response_text
                    
                    response = await task_chat.send_message(prompt_to_send)
                    raw_text = response.text if hasattr(response, "text") else str(response)
                    
                    # Проверяем наличие тегов действий
                    actions_found = False
                    step_observations = []

                    # 1. Поиск <read path="..."/>
                    for match in re.finditer(r'<read\s+path=["\']([^"\']+)["\']\s*/>', raw_text):
                        actions_found = True
                        rel_path = match.group(1)
                        content = self.executor.read_file(rel_path)
                        step_observations.append(f"[Observation read '{rel_path}']:\n{content}")

                    # 2. Поиск <write path="...">content</write>
                    for match in re.finditer(r'<write\s+path=["\']([^"\']+)["\']>(.*?)</write>', raw_text, re.DOTALL):
                        actions_found = True
                        rel_path = match.group(1)
                        file_content = match.group(2)
                        res = self.executor.write_file(rel_path, file_content)
                        step_observations.append(f"[Observation write '{rel_path}']:\n{res}")

                    # 3. Поиск <cmd>command</cmd>
                    for match in re.finditer(r'<cmd>(.*?)</cmd>', raw_text, re.DOTALL):
                        actions_found = True
                        cmd = match.group(1).strip()
                        cmd_res = await self.executor.execute_command(cmd)
                        step_observations.append(f"[Observation cmd '{cmd}']:\n{cmd_res}")

                    # 4. Поиск <send_file path="..." caption="..."/>
                    for match in re.finditer(r'<send_file\s+path=["\']([^"\']+)["\'](?:\s+caption=["\']([^"\']*)["\'])?\s*/>', raw_text):
                        actions_found = True
                        rel_path = match.group(1).strip()
                        caption = match.group(2) if match.group(2) else ""
                        try:
                            safe_path = self.executor._resolve_safe_path(rel_path)
                            if safe_path.exists() and safe_path.is_file():
                                sent_files.append({
                                    "path": rel_path,
                                    "filename": safe_path.name,
                                    "caption": caption
                                })
                                step_observations.append(f"[Observation send_file '{rel_path}']: Файл '{safe_path.name}' успешно прикреплен к отправке.")
                            else:
                                step_observations.append(f"[Observation send_file '{rel_path}']: Ошибка — файл не найден на диске.")
                        except Exception as e:
                            step_observations.append(f"[Observation send_file '{rel_path}']: Ошибка доступа — {e}")

                    if not actions_found:
                        # Агент завершил задачу без вызова новых действий
                        return {
                            "success": True,
                            "goal": goal,
                            "report": raw_text.strip(),
                            "iterations": iteration,
                            "logs": iteration_logs,
                            "files": sent_files
                        }

                    # Формируем ответ наблюдений для следующего шага
                    obs_text = "\n\n".join(step_observations)
                    iteration_logs.append(f"--- Итерация {iteration} ---\n{obs_text}")
                    current_response_text = f"Результаты выполнения действий:\n{obs_text}\n\nПроанализируй результат и заверши решение задачи либо дай финальный отчет."

                # Достигли лимита итераций (защита квоты от бесконечного цикла)
                last_log = iteration_logs[-1] if iteration_logs else "Нет логов выполнения"
                return {
                    "success": False,
                    "goal": goal,
                    "report": (
                        f"⚠️ <b>Агент остановлен:</b> исчерпан защитный лимит в {max_iterations} шага(ов), чтобы предотвратить бесконечный цикл и сберечь квоту Argon.\n\n"
                        f"<b>Последние логи действий:</b>\n<pre>{last_log[:1500]}</pre>\n\n"
                        f"<b>Вывод модели:</b>\n{raw_text[:1000]}\n\n"
                        f"💡 <i>Рекомендация: уточните задачу или устраните ошибку вручную.</i>"
                    ),
                    "iterations": max_iterations,
                    "logs": iteration_logs,
                    "files": sent_files
                }
            except Exception as e:
                return {
                    "success": False,
                    "goal": goal,
                    "report": f"Сбой ReAct-цикла: {e}",
                    "error": str(e),
                    "files": sent_files if 'sent_files' in locals() else []
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

    async def get_quotas(self) -> Dict[str, Any]:
        if self.client and hasattr(self.client, "_fetch_quota"):
            try:
                await self.client._fetch_quota(flash=True, advanced=True)
            except Exception:
                pass
        if self.client and hasattr(self.client, "_quotas"):
            return self.client._quotas
        return {}
