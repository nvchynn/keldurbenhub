#!/bin/bash

# Quick Docker deployment script for KeldurbenHub Server
# This script deploys the server using Docker Compose

set -e

echo "🐳 Starting KeldurbenHub Server Docker deployment..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "Run: curl -fsSL https://get.docker.com -o get-docker.sh && sh get-docker.sh"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Create necessary directories
echo "📁 Creating directories..."
mkdir -p data logs ssl

# Copy frontend files
echo "📋 Copying frontend files..."
cp -r ../frontend ./frontend

# Copy nginx configuration
echo "🌐 Setting up nginx configuration..."
cp nginx.conf ./nginx.conf

# Generate a random JWT secret
echo "🔐 Generating JWT secret..."
JWT_SECRET=$(openssl rand -base64 32)
echo "JWT_SECRET=$JWT_SECRET" > .env

# Update docker-compose.yml with the secret
sed -i "s/your-production-secret-key-change-this/$JWT_SECRET/g" docker-compose.yml

# Build and start services
echo "🔨 Building and starting services..."
docker-compose up -d --build

# Wait for services to be ready
echo "⏳ Waiting for services to start..."
sleep 10

# Check if services are running
echo "📊 Checking service status..."
docker-compose ps

# Test the API
echo "🧪 Testing API..."
if curl -f http://localhost:8765/api/auth/me?token=test > /dev/null 2>&1; then
    echo "✅ API is responding"
else
    echo "⚠️ API test failed, but service might still be starting"
fi

echo "✅ Docker deployment completed!"
echo "🌐 Server should be accessible at: http://localhost"
echo "📝 Check logs with: docker-compose logs -f"
echo "🔄 Restart services with: docker-compose restart"
echo "🛑 Stop services with: docker-compose down"
