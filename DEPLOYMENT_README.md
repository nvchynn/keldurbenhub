# KeldurbenHub Server - Ubuntu VDS Deployment

Полный набор файлов для развертывания сервера KeldurbenHub на Ubuntu 24.04 VDS без GUI.

## 📁 Структура проекта

```
├── server/                    # Отдельный сервер без GUI зависимостей
│   ├── Cargo.toml            # Конфигурация Rust проекта
│   └── src/
│       ├── main.rs           # Основной файл сервера
│       └── auth.rs          # Модуль аутентификации
├── deploy/                   # Файлы развертывания
│   ├── deploy.sh            # Скрипт нативной установки
│   ├── deploy-docker.sh     # Скрипт Docker развертывания
│   ├── docker-compose.yml    # Docker Compose конфигурация
│   ├── Dockerfile           # Docker образ
│   ├── nginx.conf           # Конфигурация nginx
│   ├── keldurben-server.service # Systemd сервис
│   └── README.md            # Подробные инструкции
├── copy-frontend.sh          # Скрипт копирования frontend
└── deploy-server.sh         # Главный скрипт развертывания
```

## 🚀 Быстрый старт

### 1. Подготовка файлов

Скопируйте все файлы на ваш Ubuntu VDS сервер:

```bash
# На Windows (PowerShell/CMD)
scp -r . user@your-server-ip:/home/user/keldurbenhub/

# Или используйте git
git clone <your-repo-url>
cd keldurbenhub
```

### 2. Развертывание

На сервере выполните:

```bash
# Сделайте скрипты исполняемыми
chmod +x deploy-server.sh copy-frontend.sh deploy/deploy.sh deploy/deploy-docker.sh

# Запустите развертывание
./deploy-server.sh
```

Скрипт предложит выбрать метод развертывания:
- **Docker** (рекомендуется) - автоматическая установка и настройка
- **Native** - установка напрямую в систему

## 🔧 Варианты развертывания

### Docker (Рекомендуется)

```bash
./deploy-server.sh docker
```

**Преимущества:**
- Изолированная среда
- Простое обновление
- Автоматическое управление зависимостями
- Легкое масштабирование

### Нативная установка

```bash
./deploy-server.sh native
```

**Преимущества:**
- Прямая интеграция с системой
- Меньше потребление ресурсов
- Полный контроль над процессом

## 📋 Что включает развертывание

### Автоматически устанавливается:

1. **Зависимости системы:**
   - Rust compiler
   - SQLite
   - Nginx
   - UFW firewall

2. **Сервисы:**
   - KeldurbenHub Server (порт 8765)
   - Nginx reverse proxy (порты 80/443)
   - Systemd сервис для автозапуска

3. **Безопасность:**
   - Настройка firewall
   - Создание системного пользователя
   - SSL готовность

4. **Мониторинг:**
   - Логирование через journald
   - Health checks
   - Статус сервисов

## 🌐 Настройка домена

### 1. DNS настройка
Укажите A-запись вашего домена на IP сервера.

### 2. SSL сертификат
```bash
# Установите certbot
sudo apt install certbot python3-certbot-nginx

# Получите сертификат
sudo certbot --nginx -d your-domain.com

# Обновите nginx.conf с вашим доменом
sudo nano deploy/nginx.conf
```

### 3. Обновите конфигурацию
Замените `your-domain.com` в файлах:
- `deploy/nginx.conf`
- `deploy/docker-compose.yml` (если используете Docker)

## 📊 Управление сервисом

### Проверка статуса
```bash
# Docker
docker-compose ps
docker-compose logs -f

# Native
sudo systemctl status keldurben-server
sudo journalctl -u keldurben-server -f
```

### Перезапуск
```bash
# Docker
docker-compose restart

# Native
sudo systemctl restart keldurben-server
```

### Остановка
```bash
# Docker
docker-compose down

# Native
sudo systemctl stop keldurben-server
```

## 🔒 Безопасность

### Обязательные действия:

1. **Измените JWT_SECRET:**
   ```bash
   # Docker
   nano deploy/docker-compose.yml
   # Измените JWT_SECRET на уникальный ключ
   
   # Native
   sudo nano /etc/systemd/system/keldurben-server.service
   # Измените Environment=JWT_SECRET=...
   ```

2. **Настройте SSL:**
   ```bash
   sudo certbot --nginx -d your-domain.com
   ```

3. **Обновите firewall:**
   ```bash
   sudo ufw status
   sudo ufw allow 22/tcp  # SSH
   sudo ufw allow 80/tcp  # HTTP
   sudo ufw allow 443/tcp # HTTPS
   ```

## 📈 Производительность

### Рекомендуемые настройки для продакшена:

1. **Увеличьте лимиты:**
   ```bash
   echo "* soft nofile 65536" | sudo tee -a /etc/security/limits.conf
   echo "* hard nofile 65536" | sudo tee -a /etc/security/limits.conf
   ```

2. **Оптимизируйте nginx:**
   ```bash
   sudo nano /etc/nginx/nginx.conf
   # Увеличьте worker_processes и worker_connections
   ```

3. **Настройте swap (если нужно):**
   ```bash
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```

## 🛠️ Устранение неполадок

### Сервер не запускается
```bash
# Проверьте логи
sudo journalctl -u keldurben-server -f

# Проверьте права
sudo chown -R keldurben:keldurben /opt/keldurben-server

# Проверьте порт
sudo netstat -tlnp | grep 8765
```

### Nginx ошибки
```bash
# Проверьте конфигурацию
sudo nginx -t

# Перезапустите
sudo systemctl restart nginx
```

### База данных
```bash
# Резервная копия
sudo -u keldurben sqlite3 /opt/keldurben-server/users.db ".backup /opt/keldurben-server/users_backup.db"

# Восстановление
sudo -u keldurben sqlite3 /opt/keldurben-server/users.db < users_backup.db
```

## 🔄 Обновление

### Docker
```bash
cd deploy
docker-compose pull
docker-compose up -d --build
```

### Native
```bash
cd /opt/keldurben-server
sudo -u keldurben git pull
sudo -u keldurben cargo build --release
sudo systemctl restart keldurben-server
```

## 📞 Поддержка

При возникновении проблем:

1. Проверьте логи сервисов
2. Убедитесь в правильности конфигурации
3. Проверьте сетевые настройки
4. Создайте issue в репозитории

## 📄 API Endpoints

После развертывания сервер будет доступен по адресам:

- `GET /` - Frontend приложение
- `POST /api/auth/register` - Регистрация пользователя
- `POST /api/auth/login` - Вход в систему
- `GET /api/auth/me` - Информация о пользователе
- `WebSocket /ws` - Игровой сервер

## 🎮 Игры

Сервер поддерживает:
- **KeldurbenStickers** - игра с персонажами
- **KeldurbenColors** - игра с цветами и подсказками

Все игры доступны через WebSocket соединение на `/ws`.
