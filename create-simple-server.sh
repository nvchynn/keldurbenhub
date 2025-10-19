#!/bin/bash

# Простой сервер для KeldurbenHub
# Этот скрипт создает минималистичный сервер без Docker

set -e

echo "🚀 Создание простого KeldurbenHub сервера..."

# Создаем папку проекта
mkdir -p ~/simple-server
cd ~/simple-server

# Создаем простой Rust проект
cargo init --name keldurben-server

echo "✅ Проект создан!"
echo "📁 Расположение: ~/simple-server"
echo "🔧 Теперь нужно настроить зависимости и код"
