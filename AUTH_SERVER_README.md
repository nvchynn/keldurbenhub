# KELDURBENHUB - Сервер аутентификации

## Обзор

Теперь аккаунты пользователей хранятся на VDS сервере вместо localStorage. Система включает:

- **База данных SQLite** для хранения пользователей
- **JWT токены** для аутентификации
- **REST API** для регистрации и входа
- **WebSocket сервер** для игр
- **Безопасное хеширование паролей** с bcrypt

## Запуск сервера

### Windows
```bash
start-server.bat
```

### Linux/macOS
```bash
chmod +x start-server.sh
./start-server.sh
```

### Ручной запуск
```bash
cd src-tauri
export JWT_SECRET="your-super-secret-jwt-key-change-this-in-production"
cargo run --bin server
```

## API Endpoints

### Аутентификация

#### POST /api/auth/register
Регистрация нового пользователя

**Запрос:**
```json
{
  "username": "testuser",
  "password": "password123"
}
```

**Ответ:**
```json
{
  "user": {
    "id": "uuid",
    "username": "testuser",
    "avatar": "🐶"
  },
  "token": "jwt-token"
}
```

#### POST /api/auth/login
Вход в систему

**Запрос:**
```json
{
  "username": "testuser",
  "password": "password123"
}
```

**Ответ:**
```json
{
  "user": {
    "id": "uuid",
    "username": "testuser",
    "avatar": "🐶"
  },
  "token": "jwt-token"
}
```

#### GET /api/auth/me?token=jwt-token
Получение информации о текущем пользователе

**Ответ:**
```json
{
  "id": "uuid",
  "username": "testuser",
  "avatar": "🐶"
}
```

### WebSocket

#### WebSocket /ws
Игровой сервер для KELDURBENCOLORS

## База данных

Сервер автоматически создает SQLite базу данных `users.db` со следующей структурой:

```sql
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    avatar TEXT,
    created_at TEXT NOT NULL
);
```

## Безопасность

- **Пароли хешируются** с помощью bcrypt
- **JWT токены** для аутентификации (действуют 30 дней)
- **Валидация входных данных** на сервере
- **Защита от SQL инъекций** через sqlx

## Конфигурация

### Переменные окружения

- `JWT_SECRET` - секретный ключ для JWT токенов (по умолчанию: "your-secret-key")

### Изменение настроек

1. **JWT секрет**: Установите переменную окружения `JWT_SECRET` или измените в коде
2. **База данных**: Измените `database_url` в `server.rs`
3. **Порт**: Измените адрес в функции `main()` (по умолчанию: 8765)

## Развертывание на VDS

1. **Установите Rust** на сервере
2. **Скопируйте проект** на сервер
3. **Установите переменные окружения**:
   ```bash
   export JWT_SECRET="your-production-secret-key"
   ```
4. **Запустите сервер**:
   ```bash
   cargo run --bin server --release
   ```
5. **Настройте reverse proxy** (nginx/apache) для HTTPS
6. **Обновите API_BASE_URL** во фронтенде на адрес вашего сервера

## Мониторинг

Сервер выводит логи через tracing. Для продакшена рекомендуется настроить логирование в файл:

```bash
RUST_LOG=info cargo run --bin server > server.log 2>&1
```
