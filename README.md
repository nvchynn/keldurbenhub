# 🚀 Простое развертывание KELDURBENHUB через GitHub

## Загрузка и запуск на Ubuntu сервере

### 1. Подключение к серверу
```bash
ssh username@your-server-ip
```

### 2. Установка зависимостей
```bash
# Обновляем систему
sudo apt update && sudo apt upgrade -y

# Устанавливаем Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Устанавливаем зависимости
sudo apt install -y build-essential pkg-config libssl-dev sqlite3 libsqlite3-dev nginx git

# Устанавливаем системные библиотеки
sudo apt install -y libglib2.0-dev libgtk-3-dev libwebkit2gtk-4.0-dev libayatana-appindicator3-dev librsvg2-dev
```

### 3. Клонирование проекта
```bash
# Клонируем проект
git clone https://github.com/your-username/keldurbenhub.git
cd keldurbenhub
```

### 4. Компиляция и запуск
```bash
# Компилируем сервер
cd src-tauri
cargo build --bin server --release

# Создаем директорию для приложения
sudo mkdir -p /opt/keldurbenhub
sudo cp target/release/server /opt/keldurbenhub/
sudo cp -r ../frontend /opt/keldurbenhub/
sudo chown -R www-data:www-data /opt/keldurbenhub
sudo chmod +x /opt/keldurbenhub/server
```

### 5. Настройка systemd сервиса
```bash
# Создаем сервис
sudo nano /etc/systemd/system/keldurbenhub.service
```

Вставьте:
```ini
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
Environment=JWT_SECRET=your-secret-key
Environment=RUST_LOG=info

[Install]
WantedBy=multi-user.target
```

### 6. Настройка Nginx
```bash
# Создаем конфигурацию
sudo nano /etc/nginx/sites-available/keldurbenhub
```

Вставьте:
```nginx
server {
    listen 80;
    server_name _;

    location / {
        root /opt/keldurbenhub/frontend;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://localhost:8765/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location /ws {
        proxy_pass http://localhost:8765/ws;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 7. Запуск сервисов
```bash
# Активируем конфигурацию Nginx
sudo ln -s /etc/nginx/sites-available/keldurbenhub /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Настраиваем файрвол
sudo ufw allow 80
sudo ufw allow 443
sudo ufw allow ssh
sudo ufw --force enable

# Запускаем сервисы
sudo systemctl daemon-reload
sudo systemctl enable keldurbenhub
sudo systemctl start keldurbenhub
sudo systemctl restart nginx
```

### 8. Проверка работы
```bash
# Проверяем статус
sudo systemctl status keldurbenhub

# Проверяем порты
sudo netstat -tlnp | grep :80
sudo netstat -tlnp | grep :8765

# Тестируем API
curl -X POST http://localhost/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test123"}'
```

## Готово! 🎉

Ваше приложение доступно по адресу: `http://your-server-ip`

### Полезные команды:
```bash
# Перезапуск сервиса
sudo systemctl restart keldurbenhub

# Просмотр логов
sudo journalctl -u keldurbenhub -f

# Обновление проекта
cd keldurbenhub
git pull
cd src-tauri
cargo build --bin server --release
sudo cp target/release/server /opt/keldurbenhub/
sudo systemctl restart keldurbenhub
```

### Настройка SSL (опционально):
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```