#!/bin/bash

# Скрипт для исправления ошибки glib-sys
# Запускать с правами root: sudo ./fix-glib-error.sh

echo "🔧 Исправляем ошибку glib-sys..."

# Проверяем, что скрипт запущен с правами root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Запустите скрипт с правами root: sudo ./fix-glib-error.sh"
    exit 1
fi

echo "📚 Устанавливаем недостающие системные библиотеки..."
apt update
apt install -y libglib2.0-dev libgtk-3-dev libwebkit2gtk-4.0-dev libayatana-appindicator3-dev librsvg2-dev

echo "🧹 Очищаем кэш компиляции..."
if [ -d "src-tauri/target" ]; then
    cd src-tauri
    cargo clean
    cd ..
else
    echo "❌ Директория src-tauri/target не найдена. Убедитесь, что вы в корне проекта."
    exit 1
fi

echo "🏗️ Перекомпилируем проект..."
cd src-tauri
cargo build --bin server --release

echo "📁 Обновляем файлы на сервере..."
cp target/release/server /opt/keldurbenhub/
chown www-data:www-data /opt/keldurbenhub/server
chmod +x /opt/keldurbenhub/server

echo "🔄 Перезапускаем сервис..."
systemctl restart keldurbenhub

echo "✅ Ошибка исправлена!"
echo ""
echo "📊 Проверяем статус сервиса..."
systemctl status keldurbenhub --no-pager -l

echo ""
echo "🌐 Сервер должен быть доступен по адресу: http://$(curl -s ifconfig.me)"
