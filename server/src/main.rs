use std::{collections::{HashMap, HashSet}, net::SocketAddr, sync::Arc};

use axum::{
    extract::{State, ws::{Message, WebSocket, WebSocketUpgrade}},
    http::{HeaderValue, Method, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::net::TcpListener;
use tokio_stream::wrappers::UnboundedReceiverStream;
use tower_http::{cors::CorsLayer, services::{ServeDir, ServeFile}, compression::CompressionLayer, trace::TraceLayer};
use tracing::info;
use uuid::Uuid;

use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};

// ===================== Config =====================
#[derive(Clone)]
struct AppConfig {
    bind_addr: SocketAddr,
    jwt_secret: String,
    admin_secret: String,
    static_dir: String,
}

impl AppConfig {
    fn from_env() -> anyhow::Result<Self> {
        let bind = std::env::var("BIND").unwrap_or_else(|_| "0.0.0.0:8765".into());
        let bind_addr: SocketAddr = bind.parse()?;
        let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "dev-secret-change-me".into());
        let admin_secret = std::env::var("ADMIN_SECRET").unwrap_or_else(|_| "dev-admin-change-me".into());
        let static_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| "frontend".into());
        Ok(Self { bind_addr, jwt_secret, admin_secret, static_dir })
    }
}

// ===================== Auth Models =====================
#[derive(Deserialize)]
struct AuthPayload { username: String, password: String }

#[derive(Serialize)]
struct AuthResponse { token: String, user: PublicUser }

#[derive(Serialize, Deserialize, Clone)]
struct PublicUser { id: Uuid, username: String, avatar: Option<String> }

#[derive(sqlx::FromRow)]
struct UserRow { id: String, username: String, pwd_hash: String, avatar: Option<String> }

// ===================== WS Models (match frontend) =====================
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ClientMsg {
    Join { name: String, room: Option<String> },
    StartGame,
    LockCue1 { cue: String },
    LockCue2 { cue2: String },
    Guess { cell: usize },
    NextRound,
    ChooseTarget { index: usize },
    // Admin (optional)
    AdminReset { secret: String },
    AdminKick { secret: String, player: Uuid },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ServerMsg {
    Welcome { id: Uuid, room: String },
    State { state: GameStateDto },
    Error { message: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PlayerDto { id: Uuid, name: String, score: i32 }

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GameStateDto {
    room: String,
    round: u32,
    cols: u32,
    rows: u32,
    cue_giver: Option<Uuid>,
    phase: String,
    cue1: Option<String>,
    cue2: Option<String>,
    target: Option<usize>,
    select_options: Option<Vec<usize>>,
    players: Vec<PlayerDto>,
    guessed_once: HashSet<Uuid>,
    guessed_twice: HashSet<Uuid>,
    guesses1: Vec<(Uuid, usize)>,
    guesses2: Vec<(Uuid, usize)>,
    last_guesses: Vec<(Uuid, usize)>,
}

#[derive(Debug)]
struct Player { id: Uuid, name: String, score: i32 }

#[derive(Debug)]
struct RoomState {
    name: String,
    round: u32,
    cols: u32,
    rows: u32,
    cue_giver_idx: usize,
    phase: Phase,
    cue1: Option<String>,
    cue2: Option<String>,
    target: Option<usize>,
    select_options: Option<Vec<usize>>,
    players: Vec<Player>,
    guessed_once: HashSet<Uuid>,
    guessed_twice: HashSet<Uuid>,
    guess1_cells: HashMap<Uuid, usize>,
    guess2_cells: HashMap<Uuid, usize>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase { Lobby, Cue1, Guess1, Cue2, Guess2, Reveal }

#[derive(Default, Debug)]
struct WsHub {
    rooms: HashMap<String, RoomState>,
    conns: HashMap<Uuid, (String, Uuid)>,
    txs: HashMap<Uuid, tokio::sync::mpsc::UnboundedSender<Message>>, 
}

type SharedHub = Arc<tokio::sync::Mutex<WsHub>>;

fn default_room() -> RoomState {
    RoomState {
        name: "default".to_string(),
        round: 0,
        cols: 30,
        rows: 18,
        cue_giver_idx: 0,
        phase: Phase::Lobby,
        cue1: None,
        cue2: None,
        target: None,
        select_options: None,
        players: vec![],
        guessed_once: HashSet::new(),
        guessed_twice: HashSet::new(),
        guess1_cells: HashMap::new(),
        guess2_cells: HashMap::new(),
    }
}

fn rand_index(cols: u32, rows: u32) -> usize {
    let total = (cols * rows) as usize;
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .subsec_nanos();
    (nanos as usize) % total
}

fn rand_unique_indices(cols: u32, rows: u32, count: usize) -> Vec<usize> {
    let mut set: HashSet<usize> = HashSet::new();
    while set.len() < count.min((cols * rows) as usize) { set.insert(rand_index(cols, rows)); }
    set.into_iter().collect()
}

fn manhattan(a_idx: usize, b_idx: usize, cols: usize) -> i32 {
    let ar = a_idx / cols; let ac = a_idx % cols;
    let br = b_idx / cols; let bc = b_idx % cols;
    (ar as i32 - br as i32).abs() + (ac as i32 - bc as i32).abs()
}

fn score_by_distance(d: i32) -> i32 { if d == 0 { 3 } else if d == 1 { 2 } else if d == 2 { 1 } else { 0 } }

// ===================== Global State =====================
#[derive(Clone)]
struct AppState {
    cfg: AppConfig,
    db: SqlitePool,
    hub: SharedHub,
}

// ===================== Main =====================
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().with_env_filter("info").init();

    let cfg = AppConfig::from_env()?;

    // DB
    let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite://data/keldurben.db".into());
    tokio::fs::create_dir_all("data").await.ok();
    let db = SqlitePoolOptions::new().max_connections(5).connect(&database_url).await?;
    migrate(&db).await?;

    // WS hub
    let hub: SharedHub = Arc::new(tokio::sync::Mutex::new(WsHub::default()));
    {
        let mut guard = hub.lock().await;
        guard.rooms.insert("default".into(), default_room());
    }

    let state = AppState { cfg: cfg.clone(), db, hub };

    let cors = CorsLayer::new()
        .allow_origin(HeaderValue::from_static("*"))
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([axum::http::header::CONTENT_TYPE, axum::http::header::AUTHORIZATION]);

    let static_dir = cfg.static_dir.clone();
    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/api/auth/register", post(register))
        .route("/api/auth/login", post(login))
        .route("/api/me", get(me))
        .route("/api/debug/state", get(debug_state))
        .route("/api/admin/reset", post(admin_reset))
        .route("/api/admin/kick", post(admin_kick))
        .fallback_service({
            let file_service = ServeDir::new(static_dir.clone())
                .append_index_html_on_directories(true)
                .fallback(ServeFile::new(format!("{}/index.html", static_dir)));
            axum::routing::get_service(file_service)
        })
        .layer(cors)
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = TcpListener::bind(&cfg.bind_addr).await?;
    info!("server listening on {}", cfg.bind_addr);
    axum::serve(listener, app.into_make_service()).await?;
    Ok(())
}

// static error handled inline in router

// ===================== REST: Auth =====================
#[derive(Deserialize)]
struct Claims { sub: String, exp: usize }

async fn register(State(app): State<AppState>, Json(payload): Json<AuthPayload>) -> impl IntoResponse {
    if payload.username.trim().is_empty() || payload.password.len() < 4 {
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error":"invalid input"}))).into_response();
    }
    let id = Uuid::new_v4();
    let hash = hash_password(&payload.password).unwrap_or_default();
    let res = sqlx::query("INSERT INTO users (id, username, pwd_hash, avatar) VALUES (?1, ?2, ?3, ?4)")
        .bind(id.to_string())
        .bind(&payload.username)
        .bind(hash)
        .bind(Option::<String>::None)
        .execute(&app.db).await;
    if let Err(e) = res {
        let msg = if e.to_string().contains("UNIQUE") { "username_taken" } else { "db_error" };
        return (StatusCode::BAD_REQUEST, Json(serde_json::json!({"error": msg}))).into_response();
    }
    let token = issue_jwt(&app.cfg.jwt_secret, id);
    let user = PublicUser { id, username: payload.username, avatar: None };
    (StatusCode::OK, Json(AuthResponse { token, user })).into_response()
}

async fn login(State(app): State<AppState>, Json(payload): Json<AuthPayload>) -> impl IntoResponse {
    let row_res = sqlx::query_as::<_, UserRow>("SELECT id, username, pwd_hash, avatar FROM users WHERE username = ?1")
        .bind(&payload.username)
        .fetch_optional(&app.db).await;
    let row = match row_res {
        Ok(Some(row)) => row,
        _ => return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"invalid_credentials"}))).into_response(),
    };
    if !verify_password(&payload.password, &row.pwd_hash) {
        return (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"invalid_credentials"}))).into_response();
    }
    let id = Uuid::parse_str(&row.id).unwrap_or_else(|_| Uuid::nil());
    let token = issue_jwt(&app.cfg.jwt_secret, id);
    let user = PublicUser { id, username: row.username, avatar: row.avatar };
    (StatusCode::OK, Json(AuthResponse { token, user })).into_response()
}

async fn me(State(app): State<AppState>, auth: AuthBearer) -> impl IntoResponse {
    match auth_user(&app, &auth.0).await {
        Ok(user) => (StatusCode::OK, Json(user)).into_response(),
        Err(_) => (StatusCode::UNAUTHORIZED, Json(serde_json::json!({"error":"unauthorized"}))).into_response(),
    }
}

async fn debug_state(State(app): State<AppState>) -> impl IntoResponse {
    let hub = app.hub.lock().await;
    let mut rooms = serde_json::Map::new();
    for (name, room) in hub.rooms.iter() {
        rooms.insert(name.clone(), serde_json::json!({
            "round": room.round,
            "phase": match room.phase { Phase::Lobby=>"lobby", Phase::Cue1=>"cue1", Phase::Guess1=>"guess1", Phase::Cue2=>"cue2", Phase::Guess2=>"guess2", Phase::Reveal=>"reveal" },
            "players": room.players.iter().map(|p| { serde_json::json!({"id": p.id, "name": p.name, "score": p.score}) }).collect::<Vec<_>>()
        }));
    }
    let conns = hub.conns.len();
    (StatusCode::OK, Json(serde_json::json!({"rooms": rooms, "conns": conns}))).into_response()
}

// ===================== REST: Admin =====================
#[derive(Deserialize)]
struct AdminResetPayload { secret: String }

#[derive(Deserialize)]
struct AdminKickPayload { secret: String, player: Uuid }

async fn admin_reset(State(app): State<AppState>, Json(payload): Json<AdminResetPayload>) -> impl IntoResponse {
    if payload.secret != app.cfg.admin_secret { return StatusCode::FORBIDDEN.into_response(); }
    let mut hub = app.hub.lock().await;
    if let Some(room) = hub.rooms.get_mut("default") {
        *room = default_room();
    }
    broadcast_state("default".into(), &mut hub);
    StatusCode::OK.into_response()
}

async fn admin_kick(State(app): State<AppState>, Json(payload): Json<AdminKickPayload>) -> impl IntoResponse {
    if payload.secret != app.cfg.admin_secret { return StatusCode::FORBIDDEN.into_response(); }
    let mut hub = app.hub.lock().await;
    if let Some(room) = hub.rooms.get_mut("default") {
        room.players.retain(|p| p.id != payload.player);
    }
    broadcast_state("default".into(), &mut hub);
    StatusCode::OK.into_response()
}

// ===================== WS =====================
async fn ws_handler(ws: WebSocketUpgrade, State(app): State<AppState>) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, app))
}

async fn handle_socket(socket: WebSocket, app: AppState) {
    let (tx, mut rx) = socket.split();
    let (msg_tx, msg_rx) = tokio::sync::mpsc::unbounded_channel::<Message>();
    let mut tx = tx;

    let forward = tokio::spawn(async move {
        let mut msg_rx = UnboundedReceiverStream::new(msg_rx);
        while let Some(msg) = tokio_stream::StreamExt::next(&mut msg_rx).await {
            if tx.send(msg).await.is_err() { break; }
        }
    });

    let conn_id = Uuid::new_v4();
    {
        let mut hub = app.hub.lock().await;
        hub.txs.insert(conn_id, msg_tx.clone());
    }

    while let Some(Ok(msg)) = futures_util::StreamExt::next(&mut rx).await {
        if let Message::Text(text) = msg {
            match serde_json::from_str::<ClientMsg>(&text) {
                Ok(cmd) => handle_client_msg(conn_id, cmd, &app).await,
                Err(e) => {
                    let _ = msg_tx.send(Message::Text(serde_json::to_string(&ServerMsg::Error{ message: format!("bad json: {}", e)}).unwrap()));
                }
            }
        }
    }

    // cleanup
    {
        let mut hub = app.hub.lock().await;
        hub.txs.remove(&conn_id);
        if let Some((room_name, player_id)) = hub.conns.remove(&conn_id) {
            if let Some(room) = hub.rooms.get_mut(&room_name) {
                room.players.retain(|p| p.id != player_id);
                broadcast_state(room_name, &mut hub);
            }
        }
    }

    let _ = forward.abort();
}

async fn handle_client_msg(conn_id: Uuid, cmd: ClientMsg, app: &AppState) {
    match cmd {
        ClientMsg::Join { name, room } => {
            // Используем явную комнату или 'default' — БЕЗ хитрой логики группировки
            let room_name = room.unwrap_or_else(|| "default".into());
            let player_id = Uuid::new_v4();
            
            let mut hub = app.hub.lock().await;
            let room_entry = hub.rooms.entry(room_name.clone()).or_insert_with(|| default_room());
            room_entry.players.push(Player { id: player_id, name: name.clone(), score: 0 });
            let total_players = room_entry.players.len();
            hub.conns.insert(conn_id, (room_name.clone(), player_id));
            
            tracing::info!(target: "keldurben_server", event="join", name=%name, room=%room_name, player_id=%player_id, total_players=%total_players);
            if let Some(tx) = hub.txs.get(&conn_id) {
                let _ = tx.send(Message::Text(
                    serde_json::to_string(&ServerMsg::Welcome { id: player_id, room: room_name.clone() }).unwrap()
                ));
            }
            broadcast_state(room_name, &mut hub);
        }
        ClientMsg::StartGame => {
            let mut hub = app.hub.lock().await;
            if let Some((room_name, _)) = hub.conns.get(&conn_id).cloned() {
                if let Some(room) = hub.rooms.get_mut(&room_name) {
                    for pl in room.players.iter_mut() { pl.score = 0; }
                    room.round = 1;
                    room.cue_giver_idx = 0;
                    room.phase = Phase::Cue1;
                    room.cue1 = None; room.cue2 = None;
                    room.target = None;
                    room.select_options = Some(rand_unique_indices(room.cols, room.rows, 4));
                    room.guessed_once.clear(); room.guessed_twice.clear();
                    room.guess1_cells.clear(); room.guess2_cells.clear();
                }
                broadcast_state(room_name, &mut hub);
            }
        }
        ClientMsg::LockCue1 { cue } => {
            let mut hub = app.hub.lock().await;
            if let Some((room_name, _)) = hub.conns.get(&conn_id).cloned() {
                if let Some(room) = hub.rooms.get_mut(&room_name) {
                    room.cue1 = Some(cue);
                    room.phase = Phase::Guess1;
                    room.guessed_once.clear();
                    room.guess1_cells.clear();
                }
                broadcast_state(room_name, &mut hub);
            }
        }
        ClientMsg::LockCue2 { cue2 } => {
            let mut hub = app.hub.lock().await;
            if let Some((room_name, _)) = hub.conns.get(&conn_id).cloned() {
                if let Some(room) = hub.rooms.get_mut(&room_name) {
                    room.cue2 = Some(cue2);
                    room.phase = Phase::Guess2;
                    room.guessed_twice.clear();
                    room.guess2_cells.clear();
                }
                broadcast_state(room_name, &mut hub);
            }
        }
        ClientMsg::ChooseTarget { index } => {
            let mut hub = app.hub.lock().await;
            if let Some((room_name, player_id)) = hub.conns.get(&conn_id).cloned() {
                if let Some(room) = hub.rooms.get_mut(&room_name) {
                    let cue_id = room.players.get(room.cue_giver_idx).map(|p| p.id);
                    if Some(player_id) == cue_id {
                        if let Some(opts) = &room.select_options {
                            if opts.contains(&index) { room.target = Some(index); room.select_options = None; }
                        }
                    }
                }
                broadcast_state(room_name, &mut hub);
            }
        }
        ClientMsg::Guess { cell } => {
            let mut hub = app.hub.lock().await;
            if let Some((room_name, player_id)) = hub.conns.get(&conn_id).cloned() {
                if let Some(room) = hub.rooms.get_mut(&room_name) {
                    match room.phase {
                        Phase::Guess1 => { room.guessed_once.insert(player_id); room.guess1_cells.insert(player_id, cell); }
                        Phase::Guess2 => { room.guessed_twice.insert(player_id); room.guess2_cells.insert(player_id, cell); }
                        _ => {}
                    }
                    let cue_giver_id = room.players.get(room.cue_giver_idx).map(|p| p.id);
                    let eligible: Vec<Uuid> = room.players.iter().filter(|p| Some(p.id) != cue_giver_id).map(|p| p.id).collect();
                    let all_done = match room.phase {
                        Phase::Guess1 => eligible.iter().all(|id| room.guessed_once.contains(id)),
                        Phase::Guess2 => eligible.iter().all(|id| room.guessed_twice.contains(id)),
                        _ => false,
                    };
                    if all_done {
                        room.phase = match room.phase { Phase::Guess1 => Phase::Cue2, Phase::Guess2 => Phase::Reveal, x => x };
                        if matches!(room.phase, Phase::Reveal) {
                            let target = room.target.unwrap_or_else(|| rand_index(room.cols, room.rows));
                            let cue_giver_id = room.players.get(room.cue_giver_idx).map(|p| p.id);
                            for pl in room.players.iter_mut() {
                                if Some(pl.id) == cue_giver_id { continue; }
                                let gcell_opt = room.guess2_cells.get(&pl.id).copied()
                                    .or_else(|| room.guess1_cells.get(&pl.id).copied());
                                if let Some(gcell) = gcell_opt {
                                    let d = manhattan(gcell, target, room.cols as usize);
                                    let pts = score_by_distance(d);
                                    pl.score += pts;
                                }
                            }
                        }
                    }
                }
                broadcast_state(room_name, &mut hub);
            }
        }
        ClientMsg::NextRound => {
            let mut hub = app.hub.lock().await;
            if let Some((room_name, _)) = hub.conns.get(&conn_id).cloned() {
                if let Some(room) = hub.rooms.get_mut(&room_name) {
                    room.round += 1;
                    room.cue_giver_idx = (room.cue_giver_idx + 1) % room.players.len().max(1);
                    room.phase = Phase::Cue1;
                    room.cue1 = None; room.cue2 = None;
                    room.target = None;
                    room.select_options = Some(rand_unique_indices(room.cols, room.rows, 4));
                    room.guessed_once.clear(); room.guessed_twice.clear();
                    room.guess1_cells.clear(); room.guess2_cells.clear();
                }
                broadcast_state(room_name, &mut hub);
            }
        }
        ClientMsg::AdminReset { secret } => {
            if secret != app.cfg.admin_secret { return; }
            let mut hub = app.hub.lock().await;
            if let Some(room) = hub.rooms.get_mut("default") { *room = default_room(); }
            broadcast_state("default".into(), &mut hub);
        }
        ClientMsg::AdminKick { secret, player } => {
            if secret != app.cfg.admin_secret { return; }
            let mut hub = app.hub.lock().await;
            if let Some(room) = hub.rooms.get_mut("default") { room.players.retain(|p| p.id != player); }
            broadcast_state("default".into(), &mut hub);
        }
    }
}

fn broadcast_state(room_name: String, hub: &mut WsHub) {
    if let Some(room) = hub.rooms.get(&room_name) {
        let dto = GameStateDto {
            room: room.name.clone(),
            round: room.round,
            cols: room.cols,
            rows: room.rows,
            cue_giver: room.players.get(room.cue_giver_idx).map(|p| p.id),
            phase: match room.phase { Phase::Lobby=>"lobby", Phase::Cue1=>"cue1", Phase::Guess1=>"guess1", Phase::Cue2=>"cue2", Phase::Guess2=>"guess2", Phase::Reveal=>"reveal" }.into(),
            cue1: room.cue1.clone(),
            cue2: room.cue2.clone(),
            target: if matches!(room.phase, Phase::Reveal) { room.target } else { None },
            select_options: room.select_options.clone(),
            players: room.players.iter().map(|p| PlayerDto{ id: p.id, name: p.name.clone(), score: p.score }).collect(),
            guessed_once: room.guessed_once.clone(),
            guessed_twice: room.guessed_twice.clone(),
            guesses1: room.guess1_cells.iter().map(|(k,v)| (*k, *v)).collect(),
            guesses2: room.guess2_cells.iter().map(|(k,v)| (*k, *v)).collect(),
            last_guesses: room.guess2_cells.iter().map(|(k,v)| (*k, *v)).collect(),
        };
        let msg = Message::Text(serde_json::to_string(&ServerMsg::State{ state: dto.clone() }).unwrap());
        tracing::info!(target="keldurben_server", event="broadcast_state", room=%room.name, players=%room.players.len(), phase=%room.phase as u8, round=%room.round);
        for (_cid, (rname, _pid)) in hub.conns.iter() {
            if rname == &room.name {
                if let Some(tx) = hub.txs.get(_cid) { let _ = tx.send(msg.clone()); }
            }
        }
    }
}

// ===================== Auth utils =====================
fn hash_password(password: &str) -> Result<String, argon2::password_hash::Error> {
    use argon2::{Argon2, PasswordHasher};
    use argon2::password_hash::SaltString;
    let salt = SaltString::generate(&mut rand::thread_rng());
    let argon = Argon2::default();
    let hash = argon.hash_password(password.as_bytes(), &salt)?;
    Ok(hash.to_string())
}

fn verify_password(password: &str, pwd_hash: &str) -> bool {
    use argon2::{Argon2, PasswordVerifier};
    use argon2::password_hash::PasswordHash;
    match PasswordHash::new(pwd_hash) {
        Ok(parsed) => Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok(),
        Err(_) => false,
    }
}

fn issue_jwt(secret: &str, user_id: Uuid) -> String {
    use jsonwebtoken::{encode, EncodingKey, Header};
    use time::{Duration, OffsetDateTime};
    let exp = (OffsetDateTime::now_utc() + Duration::days(30)).unix_timestamp() as usize;
    let claims = serde_json::json!({ "sub": user_id.to_string(), "exp": exp });
    encode(&Header::default(), &claims, &EncodingKey::from_secret(secret.as_bytes())).unwrap_or_default()
}

struct AuthBearer(String);
#[axum::async_trait]
impl<S> axum::extract::FromRequestParts<S> for AuthBearer
where S: Send + Sync {
    type Rejection = (StatusCode, String);
    async fn from_request_parts(parts: &mut axum::http::request::Parts, _state: &S) -> Result<Self, Self::Rejection> {
        if let Some(val) = parts.headers.get(axum::http::header::AUTHORIZATION) {
            if let Ok(s) = val.to_str() { if let Some(t) = s.strip_prefix("Bearer ") { return Ok(AuthBearer(t.to_string())); } }
        }
        Err((StatusCode::UNAUTHORIZED, "missing bearer".into()))
    }
}

async fn auth_user(app: &AppState, token: &str) -> anyhow::Result<PublicUser> {
    use jsonwebtoken::{decode, DecodingKey, Validation, Algorithm};
    let data = decode::<Claims>(token, &DecodingKey::from_secret(app.cfg.jwt_secret.as_bytes()), &Validation::new(Algorithm::HS256))?;
    let uid = Uuid::parse_str(&data.claims.sub)?;
    let row = sqlx::query_as::<_, UserRow>("SELECT id, username, pwd_hash, avatar FROM users WHERE id = ?1")
        .bind(uid.to_string())
        .fetch_one(&app.db).await?;
    Ok(PublicUser { id: uid, username: row.username, avatar: row.avatar })
}

// ===================== Migration =====================
async fn migrate(db: &SqlitePool) -> anyhow::Result<()> {
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            pwd_hash TEXT NOT NULL,
            avatar TEXT NULL
        );
        "#
    ).execute(db).await?;
    Ok(())
}


