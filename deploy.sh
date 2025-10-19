#!/bin/bash

# Простой скрипт развертывания KELDURBENHUB
# Запускать с правами root: sudo ./deploy.sh

set -e

echo "🚀 Развертывание KELDURBENHUB..."

# Проверяем, что скрипт запущен с правами root
if [ "$EUID" -ne 0 ]; then
    echo "❌ Запустите скрипт с правами root: sudo ./deploy.sh"
    exit 1
fi

# Проверяем, что мы в директории проекта
if [ ! -f "src-tauri/Cargo.toml" ]; then
    echo "❌ Запустите скрипт из корневой директории проекта"
    exit 1
fi

echo "📦 Обновляем систему..."
apt update && apt upgrade -y

echo "🔧 Устанавливаем зависимости..."
apt install -y build-essential pkg-config libssl-dev sqlite3 libsqlite3-dev nginx git

echo "📚 Устанавливаем системные библиотеки..."
apt install -y libglib2.0-dev libgtk-3-dev libwebkit2gtk-4.0-dev libayatana-appindicator3-dev librsvg2-dev

echo "🦀 Устанавливаем Rust..."
if ! command -v rustc &> /dev/null; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source /root/.cargo/env
    echo 'source ~/.cargo/env' >> /root/.bashrc
else
    echo "✅ Rust уже установлен"
fi

echo "🏗️ Компилируем проект..."
cd src-tauri
cargo build --bin server --release

echo "📁 Настраиваем директории..."
mkdir -p /opt/keldurbenhub
cp target/release/server /opt/keldurbenhub/
cp -r ../frontend /opt/keldurbenhub/
chown -R www-data:www-data /opt/keldurbenhub
chmod +x /opt/keldurbenhub/server

echo "⚙️ Настраиваем systemd сервис..."
cat > /etc/systemd/system/keldurbenhub.service << EOF
[Unit]
Description=KELDURBENHUB Server
After=network.target

[Service]
Type=simple
User=www-data
Group=www-data
WorkingDirectory=/opt/keldurbenhub
ExecStart=/opt/keldurbenhub/server
Restart=always
Environment=JWT_SECRET=your-secret-key-change-this
Environment=RUST_LOG=info

[Install]
WantedBy=multi-user.target
EOF

echo "🌐 Настраиваем Nginx..."
cat > /etc/nginx/sites-available/keldurbenhub << EOF
server {
    listen 80;
    server_name _;

    location / {
        root /opt/keldurbenhub/frontend;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:8765/api/;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }

    location /ws {
        proxy_pass http://localhost:8765/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

echo "🛡️ Настраиваем файрвол..."
ufw --force enable
ufw allow ssh
ufw allow 80
ufw allow 443

echo "🔄 Запускаем сервисы..."
ln -sf /etc/nginx/sites-available/keldurbenhub /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

systemctl daemon-reload
systemctl enable keldurbenhub
systemctl start keldurbenhub
systemctl restart nginx

echo "✅ Развертывание завершено!"
echo ""
echo "🌐 Ваш сервер доступен по адресу: http://$(curl -s ifconfig.me)"
echo ""
echo "📋 Полезные команды:"
echo "  sudo systemctl status keldurbenhub    # Статус сервиса"
echo "  sudo journalctl -u keldurbenhub -f    # Логи сервиса"
echo "  sudo systemctl restart keldurbenhub  # Перезапуск сервиса"
echo ""
echo "🔄 Для обновления:"
echo "  git pull"
echo "  cd src-tauri && cargo build --bin server --release"
echo "  sudo cp target/release/server /opt/keldurbenhub/"
echo "  sudo systemctl restart keldurbenhub"
