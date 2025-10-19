use std::{collections::{HashMap, HashSet}, net::SocketAddr, sync::Arc};

use axum::{
    extract::{State, Query},
    http::StatusCode,
    response::Json,
    routing::{get, post},
    Router,
};
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use futures::{SinkExt, StreamExt};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use tokio::task::JoinHandle;
use tracing::info;
use uuid::Uuid;
use tokio::net::TcpListener;
use sqlx::SqlitePool;

mod auth;
use auth::{AuthService, LoginRequest, RegisterRequest, AuthResponse, UserDto};

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
    target: Option<usize>, // revealed to all only in reveal phase
    select_options: Option<Vec<usize>>, // shown only for cue giver on client side
    players: Vec<PlayerDto>,
    guessed_once: HashSet<Uuid>,
    guessed_twice: HashSet<Uuid>,
    // explicit guesses for both waves
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
    select_options: Option<Vec<usize>>, // candidate cells for cue giver selection
    players: Vec<Player>,
    guessed_once: HashSet<Uuid>,
    guessed_twice: HashSet<Uuid>,
    guess1_cells: HashMap<Uuid, usize>,
    guess2_cells: HashMap<Uuid, usize>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Phase { Lobby, Cue1, Guess1, Cue2, Guess2, Reveal }

#[derive(Default, Debug)]
struct AppState {
    rooms: HashMap<String, RoomState>,
    // map conn -> (room, player_id)
    conns: HashMap<Uuid, (String, Uuid)>,
    // senders for broadcast
    txs: HashMap<Uuid, tokio::sync::mpsc::UnboundedSender<Message>>,
    // auth service
    auth_service: AuthService,
}

type Shared = Arc<Mutex<AppState>>;

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
    // simple non-crypto RNG
    let nanos = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().subsec_nanos();
    (nanos as usize) % total
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt().with_env_filter("info").init();

    // Инициализируем базу данных
    let database_url = "sqlite:./users.db";
    let pool = SqlitePool::connect(database_url)
        .await
        .expect("Failed to connect to database");

    // Создаем таблицы
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            avatar TEXT,
            created_at TEXT NOT NULL
        )
        "#,
    )
    .execute(&pool)
    .await
    .expect("Failed to create users table");

    // Создаем AuthService
    let jwt_secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| "your-secret-key".to_string());
    let auth_service = AuthService::new(pool, jwt_secret);

    let shared: Shared = Arc::new(Mutex::new(AppState {
        rooms: HashMap::new(),
        conns: HashMap::new(),
        txs: HashMap::new(),
        auth_service,
    }));
    
    {
        let mut guard = shared.lock();
        guard.rooms.insert("default".into(), default_room());
    }

    let ws_state = shared.clone();
    let app = Router::new()
        .route("/ws", get(move |ws: WebSocketUpgrade, State(state): State<Shared>| async move {
            ws.on_upgrade(|socket| handle_socket(socket, state))
        }))
        .route("/api/auth/register", post(register))
        .route("/api/auth/login", post(login))
        .route("/api/auth/me", get(get_current_user))
        .with_state(ws_state);

    let addr: SocketAddr = "0.0.0.0:8765".parse().unwrap();
    info!("Server listening on {}", addr);
    let listener = TcpListener::bind(&addr).await.unwrap();
    axum::serve(listener, app.into_make_service()).await.unwrap();
}

async fn handle_socket(socket: WebSocket, state: Shared) {
    let (tx, mut rx) = socket.split();
    let (msg_tx, msg_rx) = tokio::sync::mpsc::unbounded_channel::<Message>();
    let mut tx = tx;

    // forwarder task
    let forward = tokio::spawn(async move {
        let mut msg_rx = tokio_stream::wrappers::UnboundedReceiverStream::new(msg_rx);
        while let Some(msg) = msg_rx.next().await {
            if tx.send(msg).await.is_err() { break; }
        }
    });

    let conn_id = Uuid::new_v4();
    {
        let mut guard = state.lock();
        guard.txs.insert(conn_id, msg_tx.clone());
    }
    // welcome will be sent after Join with the actual player_id

    while let Some(Ok(msg)) = rx.next().await {
        if let Message::Text(text) = msg {
            match serde_json::from_str::<ClientMsg>(&text) {
                Ok(cmd) => handle_client_msg(conn_id, cmd, &state).await,
                Err(e) => {
                    let _ = msg_tx.send(Message::Text(serde_json::to_string(&ServerMsg::Error{ message: format!("bad json: {}", e)}).unwrap()));
                }
            }
        }
    }

    // cleanup
    {
        let mut guard = state.lock();
        guard.txs.remove(&conn_id);
        if let Some((room_name, player_id)) = guard.conns.remove(&conn_id) {
            if let Some(room) = guard.rooms.get_mut(&room_name) {
                room.players.retain(|p| p.id != player_id);
                broadcast_state(room_name, &guard);
            }
        }
    }

    let _ = forward.abort();
}

async fn handle_client_msg(conn_id: Uuid, cmd: ClientMsg, state: &Shared) {
    match cmd {
        ClientMsg::Join { name, room } => {
            let room_name = room.unwrap_or_else(|| "default".into());
            let mut guard = state.lock();
            let room_entry = guard.rooms.entry(room_name.clone()).or_insert_with(|| default_room());
            let player_id = Uuid::new_v4();
            room_entry.players.push(Player { id: player_id, name: name.clone(), score: 0 });
            guard.conns.insert(conn_id, (room_name.clone(), player_id));
            // send welcome with assigned player_id
            if let Some(tx) = guard.txs.get(&conn_id) {
                let _ = tx.send(Message::Text(
                    serde_json::to_string(&ServerMsg::Welcome { id: player_id, room: room_name.clone() }).unwrap()
                ));
            }
            broadcast_state(room_name, &guard);
        }
        ClientMsg::StartGame => {
            let mut guard = state.lock();
            if let Some((room_name, _player_id)) = guard.conns.get(&conn_id).cloned() {
                if let Some(room) = guard.rooms.get_mut(&room_name) {
                    // reset scores and state for a new game
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
                broadcast_state(room_name, &guard);
            }
        }
        ClientMsg::LockCue1 { cue } => {
            let mut guard = state.lock();
            if let Some((room_name, _)) = guard.conns.get(&conn_id).cloned() {
                if let Some(room) = guard.rooms.get_mut(&room_name) {
                    room.cue1 = Some(cue);
                    room.phase = Phase::Guess1;
                    room.guessed_once.clear();
                    room.guess1_cells.clear();
                }
                broadcast_state(room_name, &guard);
            }
        }
        ClientMsg::LockCue2 { cue2 } => {
            let mut guard = state.lock();
            if let Some((room_name, _)) = guard.conns.get(&conn_id).cloned() {
                if let Some(room) = guard.rooms.get_mut(&room_name) {
                    room.cue2 = Some(cue2);
                    room.phase = Phase::Guess2;
                    room.guessed_twice.clear();
                    room.guess2_cells.clear();
                }
                broadcast_state(room_name, &guard);
            }
        }
        ClientMsg::ChooseTarget { index } => {
            let mut guard = state.lock();
            if let Some((room_name, player_id)) = guard.conns.get(&conn_id).cloned() {
                if let Some(room) = guard.rooms.get_mut(&room_name) {
                    let cue_id = room.players.get(room.cue_giver_idx).map(|p| p.id);
                    // Only cue giver can choose and index must be in options
                    if Some(player_id) == cue_id {
                        if let Some(opts) = &room.select_options {
                            if opts.contains(&index) {
                                room.target = Some(index);
                                room.select_options = None;
                            }
                        }
                    }
                }
                broadcast_state(room_name, &guard);
            }
        }
        ClientMsg::Guess { cell } => {
            let mut guard = state.lock();
            if let Some((room_name, player_id)) = guard.conns.get(&conn_id).cloned() {
                if let Some(room) = guard.rooms.get_mut(&room_name) {
                    // record guess only once per phase
                    match room.phase {
                        Phase::Guess1 => { room.guessed_once.insert(player_id); room.guess1_cells.insert(player_id, cell); }
                        Phase::Guess2 => { room.guessed_twice.insert(player_id); room.guess2_cells.insert(player_id, cell); }
                        _ => {}
                    }
                    // when all non-cue players guessed → advance
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
                            // scoring based on second guesses
                            let target = room.target.unwrap_or_else(|| rand_index(room.cols, room.rows));
                            for pl in room.players.iter_mut() {
                                if let Some(&gcell) = room.guess2_cells.get(&pl.id) {
                                    let d = manhattan(gcell, target, room.cols as usize);
                                    let pts = score_by_distance(d);
                                    pl.score += pts;
                                }
                            }
                        }
                    }
                }
                broadcast_state(room_name, &guard);
            }
        }
        ClientMsg::NextRound => {
            let mut guard = state.lock();
            if let Some((room_name, _)) = guard.conns.get(&conn_id).cloned() {
                if let Some(room) = guard.rooms.get_mut(&room_name) {
                    room.round += 1;
                    room.cue_giver_idx = (room.cue_giver_idx + 1) % room.players.len().max(1);
                    room.phase = Phase::Cue1;
                    room.cue1 = None; room.cue2 = None;
                    room.target = None;
                    room.select_options = Some(rand_unique_indices(room.cols, room.rows, 4));
                    room.guessed_once.clear(); room.guessed_twice.clear();
                    room.guess1_cells.clear(); room.guess2_cells.clear();
                }
                broadcast_state(room_name, &guard);
            }
        }
    }
}

fn broadcast_state(room_name: String, guard: &AppState) {
    if let Some(room) = guard.rooms.get(&room_name) {
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
        let msg = Message::Text(serde_json::to_string(&ServerMsg::State{ state: dto }).unwrap());
        for (_cid, (rname, _pid)) in guard.conns.iter() {
            if rname == &room.name {
                if let Some(tx) = guard.txs.get(_cid) { let _ = tx.send(msg.clone()); }
            }
        }
    }
}

fn manhattan(a_idx: usize, b_idx: usize, cols: usize) -> i32 {
    let ar = a_idx / cols; let ac = a_idx % cols;
    let br = b_idx / cols; let bc = b_idx % cols;
    (ar as i32 - br as i32).abs() + (ac as i32 - bc as i32).abs()
}

fn score_by_distance(d: i32) -> i32 {
    if d == 0 { 3 } else if d == 1 { 2 } else if d == 2 { 1 } else { 0 }
}

fn rand_unique_indices(cols: u32, rows: u32, count: usize) -> Vec<usize> {
    use std::collections::HashSet;
    let total = (cols * rows) as usize;
    let mut set: HashSet<usize> = HashSet::new();
    while set.len() < count.min(total) {
        set.insert(rand_index(cols, rows));
    }
    set.into_iter().collect()
}

// API handlers
async fn register(
    State(state): State<Shared>,
    Json(payload): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, Json<serde_json::Value>)> {
    let auth_service = {
        let guard = state.lock();
        guard.auth_service.clone()
    };

    match auth_service.register(payload).await {
        Ok(response) => Ok(Json(response)),
        Err(e) => Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": e })),
        )),
    }
}

async fn login(
    State(state): State<Shared>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, (StatusCode, Json<serde_json::Value>)> {
    let auth_service = {
        let guard = state.lock();
        guard.auth_service.clone()
    };

    match auth_service.login(payload).await {
        Ok(response) => Ok(Json(response)),
        Err(e) => Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": e })),
        )),
    }
}

async fn get_current_user(
    State(state): State<Shared>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<UserDto>, (StatusCode, Json<serde_json::Value>)> {
    let token = params.get("token")
        .ok_or_else(|| (
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": "Token required" })),
        ))?;

    let auth_service = {
        let guard = state.lock();
        guard.auth_service.clone()
    };

    match auth_service.verify_token(token).await {
        Ok(user) => Ok(Json(user)),
        Err(e) => Err((
            StatusCode::UNAUTHORIZED,
            Json(serde_json::json!({ "error": e })),
        )),
    }
}


