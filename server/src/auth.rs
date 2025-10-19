use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use bcrypt::{hash, verify, DEFAULT_COST};
use jsonwebtoken::{encode, decode, Header, Algorithm, Validation, EncodingKey, DecodingKey};
use chrono::{Duration, Utc};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub password_hash: String,
    pub avatar: Option<String>,
    pub created_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UserDto {
    pub id: Uuid,
    pub username: String,
    pub avatar: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct AuthResponse {
    pub user: UserDto,
    pub token: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // user id
    pub username: String,
    pub exp: i64,
}

#[derive(Clone)]
pub struct AuthService {
    pool: SqlitePool,
    jwt_secret: String,
}

impl AuthService {
    pub fn new(pool: SqlitePool, jwt_secret: String) -> Self {
        Self { pool, jwt_secret }
    }

    pub async fn register(&self, req: RegisterRequest) -> Result<AuthResponse, String> {
        // Проверяем, что пользователь не существует
        let existing_user = sqlx::query_as!(
            User,
            "SELECT * FROM users WHERE username = ?",
            req.username
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?;

        if existing_user.is_some() {
            return Err("User already exists".to_string());
        }

        // Хешируем пароль
        let password_hash = hash(&req.password, DEFAULT_COST)
            .map_err(|e| format!("Password hashing error: {}", e))?;

        // Создаем пользователя
        let user_id = Uuid::new_v4();
        let avatar = generate_avatar_from_username(&req.username);

        sqlx::query!(
            "INSERT INTO users (id, username, password_hash, avatar, created_at) VALUES (?, ?, ?, ?, ?)",
            user_id,
            req.username,
            password_hash,
            avatar,
            Utc::now()
        )
        .execute(&self.pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?;

        // Создаем JWT токен
        let token = self.create_token(&user_id, &req.username)?;

        Ok(AuthResponse {
            user: UserDto {
                id: user_id,
                username: req.username,
                avatar: Some(avatar),
            },
            token,
        })
    }

    pub async fn login(&self, req: LoginRequest) -> Result<AuthResponse, String> {
        // Находим пользователя
        let user = sqlx::query_as!(
            User,
            "SELECT * FROM users WHERE username = ?",
            req.username
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .ok_or("Invalid username or password")?;

        // Проверяем пароль
        verify(&req.password, &user.password_hash)
            .map_err(|_| "Invalid username or password")?;

        // Создаем JWT токен
        let token = self.create_token(&user.id, &user.username)?;

        Ok(AuthResponse {
            user: UserDto {
                id: user.id,
                username: user.username,
                avatar: user.avatar,
            },
            token,
        })
    }

    pub async fn verify_token(&self, token: &str) -> Result<UserDto, String> {
        let claims = decode::<Claims>(
            token,
            &DecodingKey::from_secret(self.jwt_secret.as_ref()),
            &Validation::new(Algorithm::HS256),
        )
        .map_err(|_| "Invalid token")?
        .claims;

        // Проверяем, что пользователь все еще существует
        let user = sqlx::query_as!(
            User,
            "SELECT * FROM users WHERE id = ?",
            claims.sub
        )
        .fetch_optional(&self.pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .ok_or("User not found")?;

        Ok(UserDto {
            id: user.id,
            username: user.username,
            avatar: user.avatar,
        })
    }

    fn create_token(&self, user_id: &Uuid, username: &str) -> Result<String, String> {
        let expiration = Utc::now() + Duration::days(30); // Токен действует 30 дней
        
        let claims = Claims {
            sub: user_id.to_string(),
            username: username.to_string(),
            exp: expiration.timestamp(),
        };

        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.jwt_secret.as_ref()),
        )
        .map_err(|e| format!("Token creation error: {}", e))
    }
}

fn generate_avatar_from_username(username: &str) -> String {
    let avatars = [
        "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯",
        "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🐤", "🐣",
        "🦆", "🦅", "🦉", "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🐛",
        "🦋", "🐌", "🐞", "🐜", "🦟", "🦗", "🕷", "🕸", "🦂", "🐢",
        "🐍", "🦎", "🦖", "🦕", "🐙", "🦑", "🦐", "🦞", "🦀", "🐡",
        "🐠", "🐟", "🐬", "🐳", "🐋", "🦈", "🐊", "🐅", "🐆", "🦓",
        "🦍", "🦧", "🐘", "🦛", "🦏", "🐪", "🐫", "🦒", "🦘", "🐃",
        "🐂", "🐄", "🐎", "🐖", "🐏", "🐑", "🦙", "🐐", "🦏", "🦌",
        "🐕", "🐩", "🦮", "🐕‍🦺", "🐈", "🐓", "🦃", "🦚", "🦜", "🦢",
        "🦩", "🕊", "🐇", "🦝", "🦨", "🦡", "🦦", "🦥", "🐁", "🐀",
        "🐿", "🦔", "🐾", "🐉", "🐲", "🌵", "🎄", "🌲", "🌳", "🌴",
        "🌱", "🌿", "☘️", "🍀", "🎍", "🎋", "🍃", "🍂", "🍁", "🍄",
        "🐚", "🌾", "💐", "🌷", "🌹", "🥀", "🌺", "🌸", "🌼", "🌻",
        "🌞", "🌝", "🌛", "🌜", "🌚", "🌕", "🌖", "🌗", "🌘", "🌑",
        "🌒", "🌓", "🌔", "🌙", "⭐", "🌟", "💫", "✨", "☄️", "💥",
        "🔥", "💢", "💯", "💢", "💥", "💫", "💦", "💨", "🕳️", "💣",
        "💤", "💨", "💦", "💧", "🌊", "☔", "⛈️", "🌩️", "⚡", "🔥",
        "❄️", "☃️", "⛄", "🌨️", "🌧️", "🌦️", "🌤️", "⛅", "🌥️", "☁️",
        "🌦️", "🌤️", "⛅", "🌥️", "☁️", "🌦️", "🌤️", "⛅", "🌥️", "☁️",
    ];
    
    let hash = username.chars().fold(0u32, |acc, c| acc.wrapping_add(c as u32));
    let index = (hash as usize) % avatars.len();
    avatars[index].to_string()
}
