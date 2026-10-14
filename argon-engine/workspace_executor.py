import asyncio
import os
import re
import shutil
from pathlib import Path
from typing import Tuple, List, Dict, Any

WORKSPACE_ROOT = Path(os.environ.get("WORKSPACE_DIR", "/workspace")).resolve()

class WorkspaceExecutor:
    def __init__(self, workspace_path: Path = WORKSPACE_ROOT):
        self.workspace = workspace_path
        self.workspace.mkdir(parents=True, exist_ok=True)

    def _resolve_safe_path(self, rel_path: str) -> Path:
        """Гарантирует, что путь находится строго внутри /workspace"""
        # Убираем ведущие слэши, чтобы path.resolve() считал его относительным к workspace
        clean_rel = rel_path.strip().lstrip("/\\")
        target = (self.workspace / clean_rel).resolve()
        if not str(target).startswith(str(self.workspace)):
            raise PermissionError(f"Access denied: path '{rel_path}' is outside workspace '{self.workspace}'")
        return target

    def read_file(self, rel_path: str) -> str:
        safe_path = self._resolve_safe_path(rel_path)
        if not safe_path.exists():
            return f"[ERROR: File '{rel_path}' does not exist]"
        if safe_path.is_dir():
            return f"[ERROR: '{rel_path}' is a directory, not a file]"
        try:
            content = safe_path.read_text(encoding="utf-8", errors="replace")
            return content
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
                
                # Обрезка вывода до 4000 символов
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
