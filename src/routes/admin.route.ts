import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ArgonProvider } from '../ai/providers/argon.provider';
import { AIService } from '../ai/ai.service';
import { RAGService } from '../vector/rag.service';
import { env } from '../config/env';
import { logger } from '../utils/logger';

interface AdminRouteOptions {
  argonProvider: ArgonProvider;
  aiService: AIService;
  ragService: RAGService;
}

export async function adminRoute(fastify: FastifyInstance, options: AdminRouteOptions) {
  const { argonProvider, aiService, ragService } = options;
  const secretToken = env.ARGON_SECRET_TOKEN;

  // Middleware auth check
  const checkAuth = (request: FastifyRequest, reply: FastifyReply): boolean => {
    const authHeader = request.headers['authorization'];
    const queryToken = (request.query as any)?.token;
    let token = '';

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (queryToken) {
      token = String(queryToken).trim();
    }

    if (!token || token !== secretToken) {
      reply.status(401).send({ error: 'Unauthorized: Invalid or missing admin token' });
      return false;
    }
    return true;
  };

  // 1. Web Dashboard HTML
  fastify.get('/admin', async (_request, reply) => {
    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Onter AI & Argon Hub — Admin Dashboard</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: #111827;
      --card-border: #1f293d;
      --accent-primary: #6366f1;
      --accent-cyan: #06b6d4;
      --accent-green: #10b981;
      --accent-red: #ef4444;
      --accent-amber: #f59e0b;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --font-sans: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background: rgba(17, 24, 39, 0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--card-border);
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 50;
    }
    .logo-group { display: flex; align-items: center; gap: 0.75rem; }
    .logo-badge {
      background: linear-gradient(135deg, var(--accent-primary), var(--accent-cyan));
      width: 38px;
      height: 38px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      color: #fff;
      font-size: 1.1rem;
    }
    .logo-title { font-weight: 700; font-size: 1.25rem; letter-spacing: -0.02em; }
    .logo-subtitle { font-size: 0.8rem; color: var(--text-muted); }
    .header-actions { display: flex; align-items: center; gap: 1rem; }
    .token-btn {
      background: #1f293d;
      color: var(--text);
      border: 1px solid var(--card-border);
      padding: 0.5rem 1rem;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.85rem;
      font-weight: 500;
      transition: all 0.2s;
    }
    .token-btn:hover { background: #2d3748; border-color: var(--accent-primary); }
    .container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 2rem;
      width: 100%;
      flex: 1;
    }
    .nav-tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      border-bottom: 1px solid var(--card-border);
      padding-bottom: 0.5rem;
      overflow-x: auto;
    }
    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-muted);
      padding: 0.6rem 1.2rem;
      border-radius: 8px;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 600;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .tab-btn:hover { color: var(--text); background: rgba(255, 255, 255, 0.05); }
    .tab-btn.active { color: #fff; background: var(--accent-primary); }
    .tab-content { display: none; }
    .tab-content.active { display: block; }

    .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; margin-bottom: 1.5rem; }
    .grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; margin-bottom: 1.5rem; }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 14px;
      padding: 1.5rem;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25);
    }
    .card-title {
      font-size: 1rem;
      font-weight: 600;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: #fff;
    }
    .stat-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.6rem 0;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      font-size: 0.9rem;
    }
    .stat-row:last-child { border-bottom: none; }
    .stat-label { color: var(--text-muted); }
    .stat-value { font-weight: 600; font-family: var(--font-mono); }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem 0.65rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      font-family: var(--font-sans);
    }
    .badge-green { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-red { background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
    .badge-blue { background: rgba(99, 102, 241, 0.15); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.3); }
    .badge-amber { background: rgba(245, 158, 11, 0.15); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.3); }

    .progress-bar-bg {
      background: #1f293d;
      border-radius: 8px;
      height: 10px;
      overflow: hidden;
      margin-top: 0.5rem;
    }
    .progress-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent-cyan), var(--accent-primary));
      border-radius: 8px;
      transition: width 0.4s ease;
    }
    .form-group { margin-bottom: 1.25rem; }
    .form-label { display: block; font-size: 0.85rem; font-weight: 600; color: var(--text-muted); margin-bottom: 0.4rem; }
    .form-control {
      width: 100%;
      background: #0b0f19;
      border: 1px solid var(--card-border);
      color: var(--text);
      padding: 0.75rem 1rem;
      border-radius: 8px;
      font-family: var(--font-mono);
      font-size: 0.85rem;
      transition: border-color 0.2s;
    }
    .form-control:focus { outline: none; border-color: var(--accent-primary); }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      background: var(--accent-primary);
      color: #fff;
      border: none;
      padding: 0.75rem 1.5rem;
      border-radius: 8px;
      font-weight: 600;
      font-size: 0.9rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn:hover { background: #4f46e5; transform: translateY(-1px); }
    .btn-secondary { background: #1f293d; color: var(--text); border: 1px solid var(--card-border); }
    .btn-secondary:hover { background: #2d3748; }

    table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
    th { text-align: left; padding: 0.75rem 1rem; font-size: 0.8rem; text-transform: uppercase; color: var(--text-muted); border-bottom: 1px solid var(--card-border); }
    td { padding: 0.85rem 1rem; font-size: 0.85rem; border-bottom: 1px solid rgba(255,255,255,0.04); }
    tr:hover td { background: rgba(255,255,255,0.02); }
    .file-link { color: var(--accent-cyan); text-decoration: none; font-weight: 600; font-family: var(--font-mono); }
    .file-link:hover { text-decoration: underline; }

    /* Modal */
    .modal-backdrop {
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s;
    }
    .modal-backdrop.open { opacity: 1; pointer-events: auto; }
    .modal-box {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 16px;
      width: 90%;
      max-width: 440px;
      padding: 2rem;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    .chat-box {
      display: flex;
      flex-direction: column;
      height: 400px;
      background: #0b0f19;
      border: 1px solid var(--card-border);
      border-radius: 12px;
      overflow: hidden;
    }
    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .msg-bubble {
      max-width: 80%;
      padding: 0.75rem 1rem;
      border-radius: 12px;
      font-size: 0.9rem;
      line-height: 1.4;
      white-space: pre-wrap;
    }
    .msg-user { align-self: flex-end; background: var(--accent-primary); color: #fff; }
    .msg-bot { align-self: flex-start; background: #1e293b; color: var(--text); border: 1px solid var(--card-border); }
    .chat-input-row {
      display: flex;
      gap: 0.5rem;
      padding: 0.75rem;
      border-top: 1px solid var(--card-border);
      background: var(--card-bg);
    }
  </style>
</head>
<body>
  <header>
    <div class="logo-group">
      <div class="logo-badge">⚡</div>
      <div>
        <div class="logo-title">Onter AI & Argon Hub</div>
        <div class="logo-subtitle">Централизованная консоль управления шлюзом</div>
      </div>
    </div>
    <div class="header-actions">
      <span id="authStatusBadge" class="badge badge-amber">Проверка авторизации...</span>
      <button class="token-btn" onclick="openTokenModal()">🔑 Токен доступа</button>
    </div>
  </header>

  <div class="container">
    <div class="nav-tabs">
      <button class="tab-btn active" onclick="switchTab('overview')">📊 Обзор системы</button>
      <button class="tab-btn" onclick="switchTab('limits')">📈 Лимиты и Квоты</button>
      <button class="tab-btn" onclick="switchTab('cookies')">🍪 Сессия Google (Cookies)</button>
      <button class="tab-btn" onclick="switchTab('workspace')">📂 Файлы /workspace</button>
      <button class="tab-btn" onclick="switchTab('rag')">🧠 База знаний & MySQL</button>
      <button class="tab-btn" onclick="switchTab('test')">💬 Тест диалога</button>
    </div>

    <!-- 1. OVERVIEW TAB -->
    <div id="tab-overview" class="tab-content active">
      <div class="grid-3">
        <div class="card">
          <div class="card-title">🤖 Шлюз Onter AI (Node.js)</div>
          <div class="stat-row">
            <span class="stat-label">Статус</span>
            <span class="badge badge-green">🟢 Онлайн</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Порт Fastify</span>
            <span class="stat-value" id="appPort">3001</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Провайдер по умолчанию</span>
            <span class="stat-value" id="defaultProvider">groq</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Аптайм</span>
            <span class="stat-value" id="nodeUptime">-</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">ОЗУ (Memory)</span>
            <span class="stat-value" id="nodeMemory">-</span>
          </div>
        </div>

        <div class="card">
          <div class="card-title">⚡ Argon Engine (FastAPI)</div>
          <div class="stat-row">
            <span class="stat-label">Статус сервиса</span>
            <span class="badge" id="argonStatusBadge">Загрузка...</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Сессия Gemini 4</span>
            <span class="badge" id="geminiSessionBadge">Загрузка...</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Очередь задач</span>
            <span class="stat-value" id="argonBusy">-</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Диск сервера</span>
            <span class="stat-value" id="freeDisk">-</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Аптайм движка</span>
            <span class="stat-value" id="argonUptime">-</span>
          </div>
        </div>

        <div class="card">
          <div class="card-title">💾 База Данных & RAG</div>
          <div class="stat-row">
            <span class="stat-label">Тип хранилища</span>
            <span class="badge badge-blue" id="ragStorageBadge">-</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Чанков в базе</span>
            <span class="stat-value" id="ragChunksTotal">-</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Telegram бот</span>
            <span class="badge badge-green">🟢 Активен</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Администратор</span>
            <span class="stat-value">682053710</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">🚀 Быстрые действия</div>
        <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
          <button class="btn btn-secondary" onclick="refreshOverview()">🔄 Обновить статус</button>
          <button class="btn btn-secondary" onclick="resetUserSession()">🧹 Сбросить сессию администратора</button>
        </div>
      </div>
    </div>

    <!-- 2. LIMITS TAB -->
    <div id="tab-limits" class="tab-content">
      <div class="grid-2">
        <div class="card">
          <div class="card-title">🦙 Groq API (Llama-3.1 / Qwen)</div>
          <div class="stat-row">
            <span class="stat-label">Лимит запросов (RPM)</span>
            <span class="stat-value" id="groqReq">-</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Лимит токенов (TPM)</span>
            <span class="stat-value" id="groqTok">-</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Сброс счетчика запросов</span>
            <span class="stat-value" id="groqResetReq">-</span>
          </div>
        </div>

        <div class="card">
          <div class="card-title">⚡ Gemini 4 Argon Quotas</div>
          <div class="stat-row">
            <span class="stat-label">Тарифный план</span>
            <span class="badge badge-blue" id="argonTier">PRO</span>
          </div>
          <div style="margin-top: 1rem;">
            <div style="display:flex; justify-content:space-between; font-size: 0.85rem;">
              <span>5-часовое окно (квота)</span>
              <span id="window5hCredits" class="stat-value">-</span>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" id="window5hBar" style="width: 0%;"></div>
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.3rem;" id="window5hReset">-</div>
          </div>

          <div style="margin-top: 1.25rem;">
            <div style="display:flex; justify-content:space-between; font-size: 0.85rem;">
              <span>Недельный лимит</span>
              <span id="windowWeeklyCredits" class="stat-value">-</span>
            </div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" id="windowWeeklyBar" style="width: 0%; background: linear-gradient(90deg, #10b981, #06b6d4);"></div>
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.3rem;" id="windowWeeklyReset">-</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">📊 Детализация по моделям Gemini</div>
        <div id="modelsQuotaTable">Загрузка информации о моделях...</div>
      </div>
    </div>

    <!-- 3. COOKIES TAB -->
    <div id="tab-cookies" class="tab-content">
      <div class="card" style="max-width: 680px; margin: 0 auto;">
        <div class="card-title">🍪 Горячее обновление сессии Gemini 4</div>
        <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 1.5rem;">
          Куки веб-сессии Google используются для взаимодействия с движком Gemini 4 в обход публичных квот. Обновление происходит мгновенно без перезагрузки сервера.
        </p>

        <form id="cookiesForm" onsubmit="submitCookies(event)">
          <div class="form-group">
            <label class="form-label">Cookie __Secure-1PSID</label>
            <input type="password" id="input1PSID" class="form-control" placeholder="g.a000..." required autocomplete="off">
          </div>

          <div class="form-group">
            <label class="form-label">Cookie __Secure-1PSIDTS</label>
            <input type="password" id="input1PSIDTS" class="form-control" placeholder="sidts-..." required autocomplete="off">
          </div>

          <div style="display: flex; gap: 1rem; align-items: center;">
            <button type="submit" class="btn" id="saveCookiesBtn">💾 Сохранить и переподключить</button>
            <span id="cookieFeedback" style="font-size: 0.9rem;"></span>
          </div>
        </form>
      </div>
    </div>

    <!-- 4. WORKSPACE TAB -->
    <div id="tab-workspace" class="tab-content">
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <div class="card-title" style="margin-bottom:0;">📂 Файлы в /workspace</div>
          <button class="btn btn-secondary" onclick="loadWorkspaceFiles()">🔄 Обновить список</button>
        </div>
        <p style="color: var(--text-muted); font-size: 0.85rem;">
          Все файлы, созданные автономным агентом Argon или запрошенные для загрузки:
        </p>
        <div id="workspaceFilesContainer" style="overflow-x: auto;">
          Загрузка списка файлов...
        </div>
      </div>
    </div>

    <!-- 5. RAG & MYSQL TAB -->
    <div id="tab-rag" class="tab-content">
      <div class="grid-2">
        <div class="card">
          <div class="card-title">🗄️ База данных MariaDB 10.11</div>
          <div class="stat-row">
            <span class="stat-label">СУБД</span>
            <span class="stat-value">MariaDB (Docker)</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Хост и порт</span>
            <span class="stat-value">127.0.0.1:3306</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">База данных</span>
            <span class="stat-value">onter_ai</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Таблица векторов</span>
            <span class="stat-value">knowledge_chunks</span>
          </div>
        </div>

        <div class="card">
          <div class="card-title">🔍 Векторная база RAG</div>
          <div class="stat-row">
            <span class="stat-label">Количество фрагментов</span>
            <span class="stat-value" id="ragChunksDetail">-</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Модель эмбеддингов</span>
            <span class="stat-value">Xenova/all-MiniLM-L6-v2 (ONNX)</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">Размерность вектора</span>
            <span class="stat-value">384 float32</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 6. TEST CHAT TAB -->
    <div id="tab-test" class="tab-content">
      <div class="card" style="max-width: 800px; margin: 0 auto;">
        <div class="card-title">💬 Тестирование шлюза в реальном времени</div>
        <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
          <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem;">
            <span>Провайдер:</span>
            <select id="chatProviderSelect" class="form-control" style="width: auto; padding: 0.4rem 0.8rem;">
              <option value="groq">Groq (Llama-3.1 / Qwen)</option>
              <option value="argon">Gemini 4 Argon (Web Session)</option>
            </select>
          </label>
        </div>

        <div class="chat-box">
          <div class="chat-messages" id="chatMessages">
            <div class="msg-bubble msg-bot">Здравствуйте! Здесь вы можете протестировать ответы моделей Onter AI напрямую через веб-интерфейс.</div>
          </div>
          <form class="chat-input-row" onsubmit="sendTestMessage(event)">
            <input type="text" id="chatInput" class="form-control" placeholder="Введите сообщение или задачу..." required>
            <button type="submit" class="btn" id="sendBtn">Отправить</button>
          </form>
        </div>
      </div>
    </div>
  </div>

  <!-- AUTH TOKEN MODAL -->
  <div class="modal-backdrop" id="tokenModal">
    <div class="modal-box">
      <div class="card-title" style="margin-bottom: 0.5rem;">🔑 Авторизация в Админ-панели</div>
      <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1.25rem;">
        Введите токен <code>ARGON_SECRET_TOKEN</code> для доступа к административным функциям.
      </p>
      <div class="form-group">
        <label class="form-label">Секретный токен</label>
        <input type="password" id="modalTokenInput" class="form-control" placeholder="onter_argon_secret_...">
      </div>
      <div style="display: flex; justify-content: flex-end; gap: 0.5rem;">
        <button class="btn btn-secondary" onclick="closeTokenModal()">Отмена</button>
        <button class="btn" onclick="saveTokenAndReload()">Сохранить</button>
      </div>
    </div>
  </div>

  <script>
    const STORAGE_KEY = 'onter_admin_token';

    function getToken() {
      const urlParams = new URLSearchParams(window.location.search);
      const queryToken = urlParams.get('token');
      if (queryToken) {
        localStorage.setItem(STORAGE_KEY, queryToken);
        return queryToken;
      }
      return localStorage.getItem(STORAGE_KEY) || '';
    }

    function openTokenModal() {
      document.getElementById('modalTokenInput').value = getToken();
      document.getElementById('tokenModal').classList.add('open');
    }

    function closeTokenModal() {
      document.getElementById('tokenModal').classList.remove('open');
    }

    function saveTokenAndReload() {
      const token = document.getElementById('modalTokenInput').value.trim();
      if (token) {
        localStorage.setItem(STORAGE_KEY, token);
        closeTokenModal();
        refreshOverview();
      }
    }

    function switchTab(tabName) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      const targetBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick').includes(tabName));
      if (targetBtn) targetBtn.classList.add('active');

      const targetContent = document.getElementById('tab-' + tabName);
      if (targetContent) targetContent.classList.add('active');

      if (tabName === 'limits') loadLimits();
      if (tabName === 'workspace') loadWorkspaceFiles();
    }

    async function apiFetch(url, options = {}) {
      const token = getToken();
      if (!options.headers) options.headers = {};
      if (token) options.headers['Authorization'] = 'Bearer ' + token;
      
      const res = await fetch(url, options);
      if (res.status === 401) {
        document.getElementById('authStatusBadge').className = 'badge badge-red';
        document.getElementById('authStatusBadge').textContent = '🔴 Требуется токен';
        openTokenModal();
        throw new Error('Unauthorized');
      }
      return res;
    }

    async function refreshOverview() {
      try {
        const token = getToken();
        if (!token) {
          document.getElementById('authStatusBadge').className = 'badge badge-amber';
          document.getElementById('authStatusBadge').textContent = '⚠️ Без токена';
          return;
        }

        const res = await apiFetch('/api/admin/overview');
        const data = await res.json();

        document.getElementById('authStatusBadge').className = 'badge badge-green';
        document.getElementById('authStatusBadge').textContent = '🟢 Авторизован';

        document.getElementById('appPort').textContent = data.app?.port || '3001';
        document.getElementById('defaultProvider').textContent = data.app?.defaultProvider || 'groq';
        document.getElementById('nodeUptime').textContent = Math.round(data.app?.uptime / 60) + ' мин.';
        document.getElementById('nodeMemory').textContent = data.app?.memoryMb + ' MB';

        // Argon Engine
        const argon = data.argon;
        if (argon && argon.available) {
          document.getElementById('argonStatusBadge').className = 'badge badge-green';
          document.getElementById('argonStatusBadge').textContent = '🟢 Онлайн';
          
          document.getElementById('geminiSessionBadge').className = argon.sessionActive ? 'badge badge-green' : 'badge badge-red';
          document.getElementById('geminiSessionBadge').textContent = argon.sessionActive ? '🟢 Активна' : '🔴 Не активна';

          document.getElementById('argonBusy').textContent = argon.busy ? '⏳ Выполняет задачу' : '🟢 Свободен';
          document.getElementById('freeDisk').textContent = argon.freeDiskGb + ' GB';
          document.getElementById('argonUptime').textContent = Math.round(argon.uptimeSeconds / 60) + ' мин.';
        } else {
          document.getElementById('argonStatusBadge').className = 'badge badge-red';
          document.getElementById('argonStatusBadge').textContent = '🔴 Недоступен';
          document.getElementById('geminiSessionBadge').textContent = 'Неизвестно';
        }

        // RAG
        const rag = data.rag;
        if (rag) {
          document.getElementById('ragStorageBadge').textContent = rag.storage === 'mysql' ? '🐬 MariaDB (MySQL)' : '📁 JSON Fallback';
          document.getElementById('ragChunksTotal').textContent = rag.totalChunks;
          document.getElementById('ragChunksDetail').textContent = rag.totalChunks + ' фрагментов';
        }
      } catch (err) {
        console.warn('Overview refresh failed:', err);
      }
    }

    async function loadLimits() {
      try {
        const res = await apiFetch('/api/admin/limits');
        const data = await res.json();

        // Groq
        if (data.groq) {
          const g = data.groq;
          document.getElementById('groqReq').textContent = (g.remainingRequests ?? '∞') + (g.limitRequests ? ' / ' + g.limitRequests : '');
          document.getElementById('groqTok').textContent = (g.remainingTokens ?? '∞') + (g.limitTokens ? ' / ' + g.limitTokens : '');
          document.getElementById('groqResetReq').textContent = g.resetRequests || 'Каждую минуту';
        }

        // Argon Quotas
        if (data.argon && data.argon.quotas) {
          const q = data.argon.quotas;
          if (q.usage_info) {
            const ui = q.usage_info;
            document.getElementById('argonTier').textContent = ui.tier?.label || 'PRO';

            if (ui.current_5h) {
              const c5 = ui.current_5h;
              document.getElementById('window5hCredits').textContent = (c5.remaining_credits ?? '∞') + ' кредитов (' + (c5.usage_percentage ?? 0) + '% исп.)';
              document.getElementById('window5hBar').style.width = (c5.usage_percentage ?? 0) + '%';
              if (c5.reset_at) {
                const d = new Date(c5.reset_at);
                document.getElementById('window5hReset').textContent = 'Сброс окна: ' + d.toLocaleTimeString('ru-RU');
              }
            }

            if (ui.weekly) {
              const w = ui.weekly;
              document.getElementById('windowWeeklyCredits').textContent = (w.remaining_credits ?? '∞') + ' кредитов (' + (w.usage_percentage ?? 0) + '% исп.)';
              document.getElementById('windowWeeklyBar').style.width = (w.usage_percentage ?? 0) + '%';
              if (w.reset_at) {
                const d = new Date(w.reset_at);
                document.getElementById('windowWeeklyReset').textContent = 'Сброс недели: ' + d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU');
              }
            }
          }

          // Таблица моделей
          let tableHtml = '<table><thead><tr><th>Модель</th><th>Остаток</th><th>Лимит</th><th>Использование</th></tr></thead><tbody>';
          let hasRows = false;
          for (const [key, model] of Object.entries(q)) {
            if (key === 'usage_info' || key === 'extra') continue;
            if (typeof model === 'object' && model !== null) {
              hasRows = true;
              const name = (model.label || key).replace(/\\s*\\[.*?\\]/g, '').trim();
              const badgeClass = (model.usage_percentage || 0) > 80 ? 'badge-red' : 'badge-green';
              tableHtml += '<tr>' +
                '<td><strong>' + name + '</strong></td>' +
                '<td>' + (model.remaining !== undefined ? model.remaining : '∞') + '</td>' +
                '<td>' + (model.total !== undefined ? model.total : '∞') + '</td>' +
                '<td><span class="badge ' + badgeClass + '">' + (model.usage_percentage || 0) + '%</span></td>' +
              '</tr>';
            }
          }
          tableHtml += '</tbody></table>';
          document.getElementById('modelsQuotaTable').innerHTML = hasRows ? tableHtml : '<p style="color:var(--text-muted);">Нет информации по моделям</p>';
        }
      } catch (err) {
        console.warn('Limits loading failed:', err);
      }
    }

    async function loadWorkspaceFiles() {
      try {
        const res = await apiFetch('/api/admin/workspace/files');
        const data = await res.json();
        const files = data.files || [];
        const token = getToken();

        if (files.length === 0) {
          document.getElementById('workspaceFilesContainer').innerHTML = '<p style="color: var(--text-muted); padding: 1rem 0;">Рабочая директория пуста. Агент еще не создавал файлов.</p>';
          return;
        }

        let html = '<table><thead><tr><th>Файл</th><th>Путь</th><th>Размер</th><th>Изменен</th><th>Действие</th></tr></thead><tbody>';
        for (const f of files) {
          const dateStr = f.modified_at ? new Date(f.modified_at * 1000).toLocaleString('ru-RU') : '-';
          const sizeKb = (f.size / 1024).toFixed(1) + ' KB';
          const downloadUrl = '/api/workspace/file?path=' + encodeURIComponent(f.path) + '&token=' + encodeURIComponent(token);
          html += '<tr>' +
            '<td><strong>' + f.filename + '</strong></td>' +
            '<td><code>' + f.path + '</code></td>' +
            '<td>' + sizeKb + '</td>' +
            '<td>' + dateStr + '</td>' +
            '<td><a href="' + downloadUrl + '" target="_blank" class="file-link">⬇️ Скачать</a></td>' +
          '</tr>';
        }
        html += '</tbody></table>';
        document.getElementById('workspaceFilesContainer').innerHTML = html;
      } catch (err) {
        document.getElementById('workspaceFilesContainer').innerHTML = '<p style="color: var(--accent-red);">Не удалось загрузить файлы: ' + err.message + '</p>';
      }
    }

    async function submitCookies(e) {
      e.preventDefault();
      const psid = document.getElementById('input1PSID').value.trim();
      const psidts = document.getElementById('input1PSIDTS').value.trim();
      const fb = document.getElementById('cookieFeedback');
      const btn = document.getElementById('saveCookiesBtn');

      fb.innerHTML = '⏳ Проверка и сохранение...';
      btn.disabled = true;

      try {
        const res = await apiFetch('/api/admin/cookies', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ secure_1psid: psid, secure_1psidts: psidts })
        });
        const data = await res.json();
        if (data.success) {
          fb.innerHTML = '✅ <span style="color:#34d399;">' + data.message + '</span>';
          refreshOverview();
        } else {
          fb.innerHTML = '❌ <span style="color:#f87171;">' + (data.message || 'Ошибка обновления') + '</span>';
        }
      } catch (err) {
        fb.innerHTML = '❌ <span style="color:#f87171;">' + err.message + '</span>';
      } finally {
        btn.disabled = false;
      }
    }

    async function resetUserSession() {
      if (!confirm('Вы уверены, что хотите сбросить сессию диалога Gemini 4?')) return;
      try {
        const res = await apiFetch('/api/admin/reset', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: '682053710' })
        });
        const data = await res.json();
        alert(data.message || 'Сессия сброшена');
      } catch (err) {
        alert('Ошибка: ' + err.message);
      }
    }

    async function sendTestMessage(e) {
      e.preventDefault();
      const input = document.getElementById('chatInput');
      const provider = document.getElementById('chatProviderSelect').value;
      const text = input.value.trim();
      if (!text) return;

      const container = document.getElementById('chatMessages');
      const userBubble = document.createElement('div');
      userBubble.className = 'msg-bubble msg-user';
      userBubble.textContent = text;
      container.appendChild(userBubble);
      input.value = '';
      container.scrollTop = container.scrollHeight;

      const botBubble = document.createElement('div');
      botBubble.className = 'msg-bubble msg-bot';
      botBubble.textContent = '⏳ Ожидание ответа модели (' + provider + ')...';
      container.appendChild(botBubble);
      container.scrollTop = container.scrollHeight;

      try {
        const res = await apiFetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: text,
            provider: provider,
            userId: 'admin_dashboard'
          })
        });
        const data = await res.json();
        let replyText = data.content || 'Нет текстового ответа';
        if (data.actions && data.actions.length > 0) {
          replyText += '\n\n⚡ Выполненные действия:\n• ' + data.actions.join('\n• ');
        }
        if (data.files && data.files.length > 0) {
          replyText += '\n\n📄 Сгенерированные файлы:\n• ' + data.files.map(f => f.path).join('\n• ');
        }
        botBubble.textContent = replyText;
      } catch (err) {
        botBubble.textContent = '❌ Ошибка: ' + err.message;
      }
      container.scrollTop = container.scrollHeight;
    }

    // Auto-init on load
    window.addEventListener('DOMContentLoaded', () => {
      refreshOverview();
    });
  </script>
</body>
</html>`;
    reply.type('text/html').send(html);
  });

  // 2. Overview API
  fastify.get('/api/admin/overview', async (request, reply) => {
    if (!checkAuth(request, reply)) return;

    let argonInfo: any = { available: false };
    try {
      const status = await argonProvider.getEngineStatus();
      argonInfo = {
        available: true,
        sessionActive: status.sessionActive,
        busy: status.busy,
        freeDiskGb: status.freeDiskGb,
        uptimeSeconds: status.uptimeSeconds,
      };
    } catch (e) {
      argonInfo = {
        available: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }

    let ragInfo: any = { totalChunks: 0, storage: 'unknown' };
    try {
      ragInfo = await ragService.getStatus();
    } catch (e) {
      ragInfo = { error: e instanceof Error ? e.message : String(e) };
    }

    const mem = process.memoryUsage();
    return {
      app: {
        port: env.PORT,
        defaultProvider: env.AI_DEFAULT_PROVIDER,
        uptime: process.uptime(),
        memoryMb: Math.round(mem.rss / 1024 / 1024),
      },
      argon: argonInfo,
      rag: ragInfo,
    };
  });

  // 3. Limits API
  fastify.get('/api/admin/limits', async (request, reply) => {
    if (!checkAuth(request, reply)) return;

    let groqLimits: any = null;
    try {
      groqLimits = await aiService.getProviderLimits('groq');
    } catch (err) {
      logger.warn(`Admin dashboard failed to get Groq limits: ${err}`);
    }

    let argonQuotas: any = null;
    try {
      argonQuotas = await argonProvider.getLimits();
    } catch (err) {
      logger.warn(`Admin dashboard failed to get Argon limits: ${err}`);
    }

    return {
      groq: groqLimits,
      argon: argonQuotas,
    };
  });

  // 4. Update Cookies API
  fastify.post('/api/admin/cookies', async (request, reply) => {
    if (!checkAuth(request, reply)) return;
    const body = request.body as { secure_1psid?: string; secure_1psidts?: string };

    if (!body?.secure_1psid || !body?.secure_1psidts) {
      return reply.status(400).send({ success: false, message: 'Оба параметра cookies обязательны' });
    }

    try {
      const result = await argonProvider.updateCookies(body.secure_1psid, body.secure_1psidts);
      return result;
    } catch (err) {
      return reply.status(500).send({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 5. Workspace files list API
  fastify.get('/api/admin/workspace/files', async (request, reply) => {
    if (!checkAuth(request, reply)) return;
    try {
      const files = await argonProvider.listWorkspaceFiles();
      return { files };
    } catch (err) {
      return reply.status(500).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 6. Reset session API
  fastify.post('/api/admin/reset', async (request, reply) => {
    if (!checkAuth(request, reply)) return;
    const body = request.body as { user_id?: string };
    try {
      const res = await argonProvider.resetSession(body?.user_id);
      return res;
    } catch (err) {
      return reply.status(500).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // 7. Workspace file download proxy for dashboard and API
  fastify.get('/api/workspace/file', async (request, reply) => {
    if (!checkAuth(request, reply)) return;
    const query = request.query as { path?: string };
    if (!query?.path) {
      return reply.status(400).send({ error: 'Missing required query parameter "path"' });
    }

    try {
      const buffer = await argonProvider.downloadWorkspaceFile(query.path);
      const filename = query.path.split('/').pop() || 'download';
      reply
        .header('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`)
        .type('application/octet-stream')
        .send(buffer);
    } catch (err) {
      return reply.status(500).send({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}
