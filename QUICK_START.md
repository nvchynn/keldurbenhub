# 🚀 Быстрое развертывание KeldurbenHub Server на Ubuntu VDS

## Шаг 1: Подготовка сервера

```bash
# Обновите систему
sudo apt update && sudo apt upgrade -y

# Установите необходимые пакеты
sudo apt install -y git curl wget
```

## Шаг 2: Клонирование проекта

```bash
# Клонируйте репозиторий
git clone <your-repo-url>
cd keldurbenhub

# Сделайте скрипты исполняемыми
chmod +x deploy-server.sh copy-frontend.sh deploy/deploy.sh deploy/deploy-docker.sh
```

## Шаг 3: Развертывание

### Вариант A: Docker (Рекомендуется)
```bash
./deploy-server.sh docker
```

### Вариант B: Нативная установка
```bash
./deploy-server.sh native
```

## Шаг 4: Настройка домена (опционально)

```bash
# Установите certbot для SSL
sudo apt install certbot python3-certbot-nginx

# Получите SSL сертификат
sudo certbot --nginx -d your-domain.com

# Обновите nginx конфигурацию
sudo nano deploy/nginx.conf
# Замените your-domain.com на ваш домен
```

## Шаг 5: Проверка работы

```bash
# Проверьте статус сервисов
sudo systemctl status keldurben-server
sudo systemctl status nginx

# Проверьте логи
sudo journalctl -u keldurben-server -f
```

## 🌐 Доступ к серверу

После успешного развертывания сервер будет доступен по адресу:
- **HTTP**: `http://your-server-ip`
- **HTTPS**: `https://your-domain.com` (если настроен SSL)

## 🔧 Управление

```bash
# Перезапуск сервера
sudo systemctl restart keldurben-server

# Просмотр логов
sudo journalctl -u keldurben-server -f

# Остановка сервера
sudo systemctl stop keldurben-server
```

## ⚠️ Важно!

1. **Измените JWT_SECRET** в конфигурации на уникальный ключ
2. **Настройте SSL** для продакшена
3. **Регулярно обновляйте** систему и зависимости

## 📞 Проблемы?

Проверьте:
- Логи сервисов: `sudo journalctl -u keldurben-server -f`
- Статус портов: `sudo netstat -tlnp | grep 8765`
- Конфигурацию nginx: `sudo nginx -t`
