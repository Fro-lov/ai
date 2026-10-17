#!/usr/bin/env bash
# ==============================================================================
# Скрипт установки GitHub Actions Self-Hosted Runner на сервере Oracle Cloud (ARM64)
# Репозиторий: https://github.com/Fro-lov/ai
# ==============================================================================

set -euo pipefail

REPO_URL="https://github.com/Fro-lov/ai"
RUNNER_DIR="/opt/actions-runner"
RUNNER_USER="github-runner"
RUNNER_VERSION="2.322.0"

echo "=== [1/5] Проверка окружения и зависимостей ==="
ARCH=$(uname -m)
if [ "$ARCH" != "aarch64" ] && [ "$ARCH" != "arm64" ]; then
    echo "⚠️ Внимание: ожидалась архитектура ARM64 (aarch64), текущая: $ARCH"
fi

if ! id "$RUNNER_USER" &>/dev/null; then
    echo "Создание пользователя $RUNNER_USER..."
    sudo useradd -m -s /bin/bash "$RUNNER_USER" || true
fi

# Настройка sudoers для беспарольного перезапуска сервисов
echo "Настройка sudoers для $RUNNER_USER..."
SUDOERS_FILE="/etc/sudoers.d/github-runner-ai"
sudo bash -c "cat << 'EOF' > $SUDOERS_FILE
$RUNNER_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart argon-engine.service
$RUNNER_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart onter-ai.service
$RUNNER_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl status argon-engine.service
$RUNNER_USER ALL=(ALL) NOPASSWD: /usr/bin/systemctl status onter-ai.service
$RUNNER_USER ALL=(ALL) NOPASSWD: /usr/bin/journalctl -u onter-ai.service*
$RUNNER_USER ALL=(ALL) NOPASSWD: /usr/bin/journalctl -u argon-engine.service*
EOF"
sudo chmod 440 "$SUDOERS_FILE"

echo "=== [2/5] Подготовка директории $RUNNER_DIR ==="
sudo mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

if [ ! -f "config.sh" ]; then
    echo "Скачивание GitHub Actions Runner v$RUNNER_VERSION (arm64)..."
    TAR_NAME="actions-runner-linux-arm64-${RUNNER_VERSION}.tar.gz"
    sudo curl -o "$TAR_NAME" -L "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/${TAR_NAME}"
    sudo tar xzf "$TAR_NAME"
    sudo rm -f "$TAR_NAME"
fi

sudo chown -R "$RUNNER_USER:$RUNNER_USER" "$RUNNER_DIR"
sudo chown -R "$RUNNER_USER:$RUNNER_USER" /opt/onter-ai /opt/argon-engine 2>/dev/null || true

echo "=== [3/5] Регистрация Runner в репозитории ==="
REG_TOKEN="${1:-}"

if [ -z "$REG_TOKEN" ]; then
    echo ""
    echo "Получите токен регистрации раннера по ссылке:"
    echo "👉 https://github.com/Fro-lov/ai/settings/actions/runners/new"
    echo ""
    read -rp "Введите полученный токен регистрации (Registration Token): " REG_TOKEN
fi

if [ -z "$REG_TOKEN" ]; then
    echo "❌ Токен не введен. Прерывание."
    exit 1
fi

RUNNER_NAME="oracle-aeronautics-ai"

# Конфигурация от имени пользователя github-runner
sudo -u "$RUNNER_USER" ./config.sh \
    --url "$REPO_URL" \
    --token "$REG_TOKEN" \
    --name "$RUNNER_NAME" \
    --labels "self-hosted,Linux,ARM64,onter-ai" \
    --work "_work" \
    --unattended \
    --replace

echo "=== [4/5] Установка и запуск systemd-сервиса ==="
sudo ./svc.sh install "$RUNNER_USER"
sudo ./svc.sh start

echo "=== [5/5] Проверка статуса ==="
sudo ./svc.sh status
echo "✅ GitHub Actions Runner успешно установлен и запущен как служба!"
