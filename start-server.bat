@echo off
REM Скрипт для запуска сервера аутентификации

echo Запуск сервера аутентификации...

REM Проверяем, что мы в правильной директории
if not exist "src-tauri\Cargo.toml" (
    echo Ошибка: Запустите скрипт из корневой директории проекта
    pause
    exit /b 1
)

REM Переходим в директорию src-tauri
cd src-tauri

REM Устанавливаем переменную окружения для JWT секрета
set JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

REM Запускаем сервер
echo Запуск сервера на http://localhost:8765
echo API endpoints:
echo   POST /api/auth/register - регистрация
echo   POST /api/auth/login - вход
echo   GET /api/auth/me?token=... - получение текущего пользователя
echo   WebSocket /ws - игровой сервер
echo.
echo Нажмите Ctrl+C для остановки сервера

cargo run --bin server

