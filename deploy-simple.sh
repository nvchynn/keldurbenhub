#!/bin/bash

# Простое развертывание KeldurbenHub сервера
# Без Docker, без сложностей - просто работает!

set -e

echo "🚀 Простое развертывание KeldurbenHub сервера..."

# Очищаем старые файлы
echo "🧹 Очищаем старые файлы..."
rm -rf ~/simple-server
rm -f ~/run-server.sh
rm -f ~/keldurben-server.service

# Создаем папку проекта
echo "📁 Создаем проект..."
mkdir -p ~/simple-server
cd ~/simple-server

# Инициализируем Rust проект
echo "🦀 Инициализируем Rust проект..."
cargo init --name keldurben-server

# Копируем файлы (предполагаем, что они уже в репозитории)
echo "📋 Копируем файлы проекта..."
# Здесь нужно будет скопировать файлы из репозитория

# Устанавливаем зависимости
echo "📦 Устанавливаем зависимости..."
cargo build --release

# Создаем скрипт запуска
echo "🔧 Создаем скрипт запуска..."
cat > ~/run-server.sh << 'EOF'
#!/bin/bash
cd ~/simple-server
export RUST_LOG=info
export JWT_SECRET="simple-server-secret-key-change-this"
cargo run --release
EOF

chmod +x ~/run-server.sh

# Устанавливаем systemd сервис
echo "⚙️ Устанавливаем systemd сервис..."
sudo cp ~/keldurben-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable keldurben-server

# Настраиваем firewall
echo "🔥 Настраиваем firewall..."
sudo ufw allow 8765/tcp
sudo ufw --force enable

echo "✅ Развертывание завершено!"
echo ""
echo "🚀 Для запуска сервера выполните:"
echo "   ~/run-server.sh"
echo ""
echo "🔧 Для автозапуска:"
echo "   sudo systemctl start keldurben-server"
echo ""
echo "📊 Для проверки статуса:"
echo "   sudo systemctl status keldurben-server"
echo ""
echo "🌐 Сервер будет доступен на: http://your-server-ip:8765"
