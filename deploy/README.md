# KeldurbenHub Server - Ubuntu VDS Deployment

Этот репозиторий содержит сервер для игрового хаба KeldurbenHub, оптимизированный для развертывания на Ubuntu 24.04 VDS без GUI.

## 🚀 Быстрый старт

### Вариант 1: Docker (Рекомендуется)

```bash
# Клонируйте репозиторий
git clone <your-repo-url>
cd keldurbenhub/deploy

# Запустите автоматическое развертывание
chmod +x deploy-docker.sh
./deploy-docker.sh
```

### Вариант 2: Нативная установка

```bash
# Клонируйте репозиторий
git clone <your-repo-url>
cd keldurbenhub/deploy

# Запустите скрипт установки
chmod +x deploy.sh
./deploy.sh
```

## 📋 Требования

### Для Docker развертывания:
- Ubuntu 20.04+ или другая Linux система
- Docker и Docker Compose
- Минимум 1GB RAM
- Минимум 2GB свободного места

### Для нативной установки:
- Ubuntu 24.04 (рекомендуется)
- Минимум 512MB RAM
- Минимум 1GB свободного места
- Доступ к интернету для установки зависимостей

## 🔧 Конфигурация

### Переменные окружения

- `JWT_SECRET` - Секретный ключ для JWT токенов (автоматически генерируется в Docker)
- `RUST_LOG` - Уровень логирования (по умолчанию: info)

### Порты

- `8765` - Основной порт сервера
- `80` - HTTP (nginx)
- `443` - HTTPS (nginx)

## 🌐 Настройка домена и SSL

### 1. Настройте DNS
Укажите A-запись вашего домена на IP адрес сервера.

### 2. Получите SSL сертификат (Let's Encrypt)

```bash
# Установите certbot
sudo apt install certbot python3-certbot-nginx

# Получите сертификат
sudo certbot --nginx -d your-domain.com -d www.your-domain.com

# Настройте автообновление
sudo crontab -e
# Добавьте строку:
# 0 12 * * * /usr/bin/certbot renew --quiet
```

### 3. Обновите nginx конфигурацию
Замените `your-domain.com` в файле `nginx.conf` на ваш домен.

## 📊 Мониторинг

### Проверка статуса сервисов

```bash
# Docker
docker-compose ps
docker-compose logs -f

# Systemd
sudo systemctl status keldurben-server
sudo journalctl -u keldurben-server -f
```

### Логи

- **Docker**: `docker-compose logs -f keldurben-server`
- **Systemd**: `sudo journalctl -u keldurben-server -f`

## 🔄 Обновление

### Docker

```bash
cd deploy
docker-compose pull
docker-compose up -d --build
```

### Нативная установка

```bash
cd /opt/keldurben-server
sudo -u keldurben git pull
sudo -u keldurben cargo build --release
sudo systemctl restart keldurben-server
```

## 🛠️ Устранение неполадок

### Сервер не запускается

1. Проверьте логи:
   ```bash
   sudo journalctl -u keldurben-server -f
   ```

2. Проверьте права доступа:
   ```bash
   sudo chown -R keldurben:keldurben /opt/keldurben-server
   ```

3. Проверьте порт:
   ```bash
   sudo netstat -tlnp | grep 8765
   ```

### Nginx не работает

1. Проверьте конфигурацию:
   ```bash
   sudo nginx -t
   ```

2. Перезапустите nginx:
   ```bash
   sudo systemctl restart nginx
   ```

### База данных

База данных SQLite создается автоматически в файле `users.db`. Для резервного копирования:

```bash
# Docker
docker-compose exec keldurben-server sqlite3 /app/data/users.db ".backup /app/data/users_backup.db"

# Нативная установка
sudo -u keldurben sqlite3 /opt/keldurben-server/users.db ".backup /opt/keldurben-server/users_backup.db"
```

## 🔒 Безопасность

### Рекомендации

1. **Измените JWT_SECRET** на уникальный ключ
2. **Настройте firewall** (уже включен в скрипт)
3. **Используйте HTTPS** с валидным SSL сертификатом
4. **Регулярно обновляйте** систему и зависимости
5. **Настройте мониторинг** и логирование

### Firewall

```bash
# Проверить статус
sudo ufw status

# Разрешить дополнительные порты
sudo ufw allow 8080/tcp
```

## 📈 Производительность

### Оптимизация для продакшена

1. **Увеличьте лимиты файлов**:
   ```bash
   echo "* soft nofile 65536" | sudo tee -a /etc/security/limits.conf
   echo "* hard nofile 65536" | sudo tee -a /etc/security/limits.conf
   ```

2. **Настройте swap** (если нужно):
   ```bash
   sudo fallocate -l 1G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   ```

3. **Оптимизируйте nginx**:
   - Увеличьте `worker_processes`
   - Настройте `worker_connections`

## 📞 Поддержка

При возникновении проблем:

1. Проверьте логи сервисов
2. Убедитесь, что все порты открыты
3. Проверьте конфигурацию nginx
4. Создайте issue в репозитории

## 📄 Лицензия

Этот проект распространяется под лицензией MIT.
