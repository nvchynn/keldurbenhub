#!/bin/bash

# Простой скрипт для запуска KeldurbenHub сервера
# Без Docker, без сложностей - просто работает!

set -e

echo "🚀 Запуск простого KeldurbenHub сервера..."

# Проверяем, что Rust установлен
if ! command -v cargo &> /dev/null; then
    echo "❌ Rust не установлен. Устанавливаем..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source $HOME/.cargo/env
    echo "✅ Rust установлен!"
fi

# Переходим в папку проекта
cd ~/simple-server

# Устанавливаем зависимости
echo "📦 Устанавливаем зависимости..."
cargo build --release

# Устанавливаем переменные окружения
export RUST_LOG=info
export JWT_SECRET="simple-server-secret-key-change-this"

# Запускаем сервер
echo "🌐 Запускаем сервер на порту 8765..."
echo "📱 Откройте браузер и перейдите на: http://your-server-ip:8765"
echo "🛑 Для остановки нажмите Ctrl+C"

cargo run --release
