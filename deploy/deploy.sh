#!/bin/bash

# KeldurbenHub Server Deployment Script for Ubuntu 24.04
# This script sets up the server environment and installs dependencies

set -e

echo "🚀 Starting KeldurbenHub Server deployment..."

# Update system packages
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install required packages
echo "🔧 Installing dependencies..."
sudo apt install -y \
    curl \
    build-essential \
    pkg-config \
    libssl-dev \
    sqlite3 \
    nginx \
    ufw \
    git

# Install Rust
echo "🦀 Installing Rust..."
if ! command -v rustc &> /dev/null; then
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source $HOME/.cargo/env
else
    echo "Rust is already installed"
fi

# Create system user
echo "👤 Creating system user..."
sudo useradd -r -s /bin/false -d /opt/keldurben-server keldurben || echo "User already exists"

# Create application directory
echo "📁 Creating application directory..."
sudo mkdir -p /opt/keldurben-server
sudo chown keldurben:keldurben /opt/keldurben-server

# Copy server files
echo "📋 Copying server files..."
sudo cp -r server/* /opt/keldurben-server/
sudo chown -R keldurben:keldurben /opt/keldurben-server

# Build the server
echo "🔨 Building server..."
cd /opt/keldurben-server
sudo -u keldurben cargo build --release

# Copy binary to proper location
sudo cp target/release/server /opt/keldurben-server/server
sudo chmod +x /opt/keldurben-server/server

# Install systemd service
echo "⚙️ Installing systemd service..."
sudo cp deploy/keldurben-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable keldurben-server

# Configure firewall
echo "🔥 Configuring firewall..."
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8765/tcp
sudo ufw --force enable

# Configure nginx
echo "🌐 Configuring nginx..."
sudo cp deploy/nginx.conf /etc/nginx/sites-available/keldurben-server
sudo ln -sf /etc/nginx/sites-available/keldurben-server /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
sudo nginx -t

# Start services
echo "🚀 Starting services..."
sudo systemctl start keldurben-server
sudo systemctl restart nginx

# Check status
echo "📊 Checking service status..."
sudo systemctl status keldurben-server --no-pager

echo "✅ Deployment completed successfully!"
echo "🌐 Server should be accessible at: http://your-server-ip"
echo "📝 Check logs with: sudo journalctl -u keldurben-server -f"
echo "🔄 Restart service with: sudo systemctl restart keldurben-server"
