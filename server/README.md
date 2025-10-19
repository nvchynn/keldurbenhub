Keldurben Server (Axum)
=======================

Features:
- WebSocket game hub at /ws (KELDURBENCOLORS)
- Auth REST API under /api: POST /auth/register, POST /auth/login, GET /me (Bearer token)
- Admin endpoints: POST /api/admin/reset, POST /api/admin/kick
- Static site hosting from ../frontend
- CORS enabled, gzip/br compression, tracing

Run locally (Windows PowerShell):

    cd server
    set DATABASE_URL=sqlite://../data/keldurben.db
    set JWT_SECRET=change_me_secret
    set ADMIN_SECRET=change_me_admin
    set STATIC_DIR=../frontend
    cargo run

Run locally (Linux/macOS):

    cd server
    export DATABASE_URL=sqlite://../data/keldurben.db
    export JWT_SECRET=change_me_secret
    export ADMIN_SECRET=change_me_admin
    export STATIC_DIR=../frontend
    cargo run --release

Systemd service example (Ubuntu):

    [Unit]
    Description=Keldurben Server
    After=network.target

    [Service]
    WorkingDirectory=/opt/keldurben/server
    ExecStart=/opt/keldurben/server/target/release/keldurben-server
    Environment=DATABASE_URL=sqlite:///opt/keldurben/data/keldurben.db
    Environment=JWT_SECRET=strong_random_secret
    Environment=ADMIN_SECRET=another_strong_secret
    Environment=STATIC_DIR=/opt/keldurben/frontend
    Restart=on-failure
    User=www-data
    Group=www-data

    [Install]
    WantedBy=multi-user.target

Admin usage:
- Reset room: POST /api/admin/reset { secret }
- Kick player: POST /api/admin/kick { secret, player }

Notes:
- Frontend uses dynamic API base (/api) and WS URL (/ws) bound to current origin.
- KELDURBENSTICKERS is served statically at /games/keldurbenstickers/.


