import os
import uvicorn
from fastapi import FastAPI, Header, HTTPException, Depends, status, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

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
    user_id: Optional[str] = "default"

class TaskRequest(BaseModel):
    goal: str
    max_iterations: Optional[int] = 5

class CookiesRequest(BaseModel):
    secure_1psid: str
    secure_1psidts: str

class ResetRequest(BaseModel):
    user_id: Optional[str] = None

@app.on_event("startup")
async def on_startup():
    print("[SERVER] Starting Argon Engine server on 127.0.0.1:8085...")
    await core.init_client()

@app.get("/api/status", dependencies=[Depends(verify_token)])
async def get_status():
    return core.get_status()

@app.get("/api/limits", dependencies=[Depends(verify_token)])
async def get_limits():
    quotas = await core.get_quotas()
    return {"quotas": quotas}

@app.post("/api/chat", dependencies=[Depends(verify_token)])
async def chat_endpoint(req: ChatRequest):
    # Извлекаем последнее пользовательское сообщение или форматируем цепочку
    last_user_msg = next((m.content for m in reversed(req.messages) if m.role == "user"), "")
    if not last_user_msg:
        raise HTTPException(status_code=400, detail="No user message provided")
    
    result = await core.chat(last_user_msg, user_id=req.user_id or "default")
    return {
        "content": result["content"],
        "files": result["files"],
        "actions": result["actions"],
        "model": "Gemini 4 Argon (Web Session)"
    }

@app.post("/api/agent/task", dependencies=[Depends(verify_token)])
async def agent_task_endpoint(req: TaskRequest):
    result = await core.run_autonomous_task(req.goal, max_iterations=req.max_iterations or 5)
    return result

@app.get("/api/workspace/file", dependencies=[Depends(verify_token)])
async def get_workspace_file(path: str = Query(..., description="Relative path in /workspace")):
    try:
        safe_path = core.executor._resolve_safe_path(path)
        if not safe_path.exists() or not safe_path.is_file():
            raise HTTPException(status_code=404, detail=f"File '{path}' not found in workspace")
        return FileResponse(path=str(safe_path), filename=safe_path.name)
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/workspace/files", dependencies=[Depends(verify_token)])
async def list_workspace_files():
    return {"files": core.executor.list_files()}

@app.post("/api/cookies", dependencies=[Depends(verify_token)])
async def update_cookies_endpoint(req: CookiesRequest):
    success = await core.update_cookies(req.secure_1psid, req.secure_1psidts)
    if success:
        return {"success": True, "message": "✅ Сессия успешно подтверждена Google! Gemini 4 Argon готов к работе."}
    else:
        return {"success": False, "message": "❌ Токены отклонены Google: статус UNAUTHENTICATED. Проверьте актуальность кук в F12 и скопируйте свежие."}

@app.post("/api/reset", dependencies=[Depends(verify_token)])
async def reset_endpoint(req: Optional[ResetRequest] = None):
    uid = req.user_id if req else None
    await core.reset_session(user_id=uid)
    return {"success": True, "message": f"Контекст диалога {'пользователя ' + uid if uid else ''} сброшен."}

if __name__ == "__main__":
    uvicorn.run("server:app", host="127.0.0.1", port=8085, log_level="info")
