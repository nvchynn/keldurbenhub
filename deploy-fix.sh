#!/bin/bash
# Скрипт для быстрого деплоя исправления на VDS

VDS_IP="185.177.219.234"
VDS_USER="root"
VDS_PATH="/opt/keldurben/app/server"

echo "=== Останавливаем старый сервер ==="
ssh ${VDS_USER}@${VDS_IP} "pkill -f keldurben-server || true"
sleep 2

echo "=== Загружаем новый бинарник ==="
scp server/target/release/keldurben-server ${VDS_USER}@${VDS_IP}:${VDS_PATH}/target/release/

echo "=== Запускаем новый сервер ==="
ssh ${VDS_USER}@${VDS_IP} "cd ${VDS_PATH} && nohup env DATABASE_URL=sqlite:///opt/keldurben/app/data/keldurben.db STATIC_DIR=/opt/keldurben/app/frontend JWT_SECRET=\$(openssl rand -hex 32) ADMIN_SECRET=\$(openssl rand -hex 32) BIND=0.0.0.0:8765 ./target/release/keldurben-server >/var/log/keldurben.log 2>&1 & echo \$! > /var/run/keldurben.pid"

sleep 3

echo "=== Проверяем запуск ==="
ssh ${VDS_USER}@${VDS_IP} "ss -lntp | grep 8765"
ssh ${VDS_USER}@${VDS_IP} "tail -n 20 /var/log/keldurben.log"

echo ""
echo "✅ ДЕПЛОЙ ЗАВЕРШЁН!"
echo "Теперь проверьте игру с двух устройств - игроки должны видеть друг друга в комнате 'colors'"

