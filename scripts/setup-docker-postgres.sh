#!/usr/bin/env bash
# ==============================================================================
# Автоматическая установка Docker, PostgreSQL (pgvector) и миграция данных на хостинге
# Поддерживает: Linux Ubuntu / Debian (x86_64 и ARM64 Oracle Cloud)
# ==============================================================================

set -euo pipefail

echo "============================================================"
echo "🚀 [1/6] Проверка и установка Docker & Docker Compose"
echo "============================================================"

if ! command -v docker &> /dev/null; then
    echo "📦 Docker не найден. Запуск официальной автоматической установки Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    rm -f get-docker.sh
    sudo usermod -aG docker "$USER" || true
    sudo systemctl enable --now docker
    echo "✅ Docker успешно установлен!"
else
    echo "✅ Docker уже установлен: $(docker --version)"
fi

# Проверка Compose плагина
if ! docker compose version &> /dev/null; then
    echo "📦 Установка docker-compose-plugin..."
    sudo apt-get update && sudo apt-get install -y docker-compose-plugin
fi

echo ""
echo "============================================================"
echo "🐘 [2/6] Запуск контейнера PostgreSQL + pgvector (ARM64/x86_64)"
echo "============================================================"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"
cd "$APP_DIR"

# Запуск только сервиса postgres в фоне через docker compose
docker compose up -d postgres

echo "⏳ Ожидание готовности PostgreSQL к приёму соединений..."
until docker exec onter-postgres pg_isready -U onter_ai -d onter_ai > /dev/null 2>&1; do
    sleep 1
done
echo "✅ PostgreSQL + pgvector запущен и готов к работе!"

echo ""
echo "============================================================"
echo "⚙️ [3/6] Настройка переменных окружения в .env"
echo "============================================================"

ENV_FILE="$APP_DIR/.env"
if [ -f "$ENV_FILE" ]; then
    if ! grep -q "POSTGRES_HOST" "$ENV_FILE"; then
        echo "" >> "$ENV_FILE"
        echo "# PostgreSQL + pgvector config" >> "$ENV_FILE"
        echo "POSTGRES_HOST=127.0.0.1" >> "$ENV_FILE"
        echo "POSTGRES_PORT=5432" >> "$ENV_FILE"
        echo "POSTGRES_USER=onter_ai" >> "$ENV_FILE"
        echo "POSTGRES_PASSWORD=onter_pg_pass_2026" >> "$ENV_FILE"
        echo "POSTGRES_DB=onter_ai" >> "$ENV_FILE"
        echo "✅ Добавлены переменные POSTGRES_* в .env"
    else
        echo "ℹ️ Переменные POSTGRES_* уже присутствуют в .env"
    fi
fi

echo ""
echo "============================================================"
echo "📦 [4/6] Установка npm зависимостей (pg)"
echo "============================================================"
npm install

echo ""
echo "============================================================"
echo "🔄 [5/6] Миграция RAG базы знаний из MariaDB / JSON в PostgreSQL"
echo "============================================================"
npx tsx scripts/migrate-to-postgres.ts

echo ""
echo "============================================================"
echo "🧹 [6/6] Остановка и отключение старой службы MariaDB"
echo "============================================================"

if command -v systemctl &> /dev/null; then
    if systemctl is-active --quiet mariadb; then
        echo "🛑 Остановка работающей службы MariaDB..."
        sudo systemctl stop mariadb || true
        sudo systemctl disable mariadb || true
        echo "✅ Служба MariaDB успешно остановлена и отключена из автозагрузки!"
    elif systemctl is-active --quiet mysql; then
        echo "🛑 Остановка работающей службы MySQL..."
        sudo systemctl stop mysql || true
        sudo systemctl disable mysql || true
        echo "✅ Служба MySQL успешно остановлена и отключена из автозагрузки!"
    else
        echo "ℹ️ Служба MariaDB/MySQL уже не запущена."
    fi

    # Перезапуск службы onter-ai для перехода на Postgres
    if systemctl is-active --quiet onter-ai; then
        echo "🔄 Перезапуск службы onter-ai..."
        sudo systemctl restart onter-ai
        echo "✅ onter-ai перезапущен с поддержкой PostgreSQL!"
    fi
fi

echo ""
echo "============================================================"
echo "🎉 ВСЕ ОПЕРАЦИИ УСПЕШНО ЗАВЕРШЕНЫ!"
echo "База данных переведена на PostgreSQL + pgvector."
echo "Все чанки RAG и HNSW векторный индекс активны."
echo "============================================================"
