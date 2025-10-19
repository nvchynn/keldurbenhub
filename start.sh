#!/bin/bash

# Простой скрипт запуска KeldurbenHub сервера
# Без Docker, без сложностей - просто работает!

echo "🚀 Запуск KeldurbenHub сервера..."

# Проверяем Rust
if ! command -v cargo &> /dev/null; then
    echo "❌ Rust не установлен. Устанавливаем..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source $HOME/.cargo/env
    echo "✅ Rust установлен!"
fi

# Устанавливаем переменные окружения
export RUST_LOG=info
export JWT_SECRET="keldurben-secret-key-2024"

# Собираем и запускаем
echo "📦 Собираем проект..."
cargo build --release

echo "🌐 Запускаем сервер на порту 8765..."
echo "📱 Откройте браузер: http://your-server-ip:8765"
echo "🛑 Для остановки: Ctrl+C"

cargo run --release
