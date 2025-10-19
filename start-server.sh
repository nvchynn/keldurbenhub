#!/bin/bash

# Скрипт для запуска сервера аутентификации

echo "Запуск сервера аутентификации..."

# Проверяем, что мы в правильной директории
if [ ! -f "src-tauri/Cargo.toml" ]; then
    echo "Ошибка: Запустите скрипт из корневой директории проекта"
    exit 1
fi

# Переходим в директорию src-tauri
cd src-tauri

# Устанавливаем переменную окружения для JWT секрета
export JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"

# Запускаем сервер
echo "Запуск сервера на http://localhost:8765"
echo "API endpoints:"
echo "  POST /api/auth/register - регистрация"
echo "  POST /api/auth/login - вход"
echo "  GET /api/auth/me?token=... - получение текущего пользователя"
echo "  WebSocket /ws - игровой сервер"
echo ""
echo "Нажмите Ctrl+C для остановки сервера"

cargo run --bin server

