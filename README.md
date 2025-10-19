# KeldurbenHub Server

Простой сервер для игрового хаба KeldurbenHub.

## 🚀 Быстрый запуск

### 1. Скопируйте файлы на сервер
```bash
# Скопируйте все файлы в папку на сервере
scp -r . user@your-server-ip:/home/user/keldurben-server/
```

### 2. Подключитесь к серверу
```bash
ssh user@your-server-ip
cd keldurben-server
```

### 3. Запустите сервер
```bash
# Сделайте скрипт исполняемым
chmod +x start.sh

# Запустите сервер
./start.sh
```

## 📋 Что включено

- ✅ **Rust сервер** с Axum и WebSocket
- ✅ **SQLite база данных** для пользователей
- ✅ **JWT аутентификация** 
- ✅ **Встроенный frontend** с красивым интерфейсом
- ✅ **API endpoints** для регистрации/входа
- ✅ **WebSocket сервер** для игр
- ✅ **Автоматическая инициализация** БД

## 🌐 Доступ

После запуска сервер будет доступен на:
- **HTTP**: `http://your-server-ip:8765`
- **API**: `http://your-server-ip:8765/api/auth/`
- **WebSocket**: `ws://your-server-ip:8765/ws`

## 🔧 API Endpoints

- `POST /api/auth/register` - Регистрация пользователя
- `POST /api/auth/login` - Вход в систему  
- `GET /api/auth/me?token=...` - Информация о пользователе
- `WebSocket /ws` - Игровой сервер

## 🎮 Игры

Сервер поддерживает:
- **KeldurbenStickers** - игра с персонажами
- **Hues & Cues** - игра с цветами и подсказками

## ⚙️ Настройка

### Переменные окружения:
- `RUST_LOG` - уровень логирования (по умолчанию: info)
- `JWT_SECRET` - секретный ключ для JWT (по умолчанию: keldurben-secret-key-2024)

### Изменение порта:
Отредактируйте `src/main.rs` и измените:
```rust
let addr: SocketAddr = "0.0.0.0:8765".parse().unwrap();
```

## 🔒 Безопасность

**ВАЖНО**: Измените JWT_SECRET на уникальный ключ:
```bash
export JWT_SECRET="your-unique-secret-key-here"
```

## 📊 Мониторинг

### Логи:
Сервер выводит логи в консоль. Для продакшена можно перенаправить в файл:
```bash
./start.sh > server.log 2>&1 &
```

### Проверка работы:
```bash
# Проверьте, что сервер отвечает
curl http://localhost:8765

# Проверьте API
curl -X POST http://localhost:8765/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"123"}'
```

## 🛠️ Устранение неполадок

### Сервер не запускается:
1. Проверьте, что порт 8765 свободен: `netstat -tlnp | grep 8765`
2. Проверьте логи на ошибки
3. Убедитесь, что Rust установлен: `cargo --version`

### База данных:
База данных SQLite создается автоматически в файле `users.db`. Для резервного копирования:
```bash
cp users.db users_backup.db
```

## 🔄 Обновление

```bash
# Остановите сервер (Ctrl+C)
# Обновите код
git pull  # если используете git
# Перезапустите
./start.sh
```

## 📞 Поддержка

При проблемах:
1. Проверьте логи сервера
2. Убедитесь в правильности конфигурации
3. Проверьте сетевые настройки
4. Создайте issue в репозитории

---

**Простой, надежный, работает!** 🎯