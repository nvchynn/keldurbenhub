#!/bin/bash

# Script to copy frontend files to deploy directory
# This ensures the frontend is included in the server deployment

echo "📋 Copying frontend files to deploy directory..."

# Create frontend directory in deploy if it doesn't exist
mkdir -p deploy/frontend

# Copy frontend files
cp -r frontend/* deploy/frontend/

echo "✅ Frontend files copied successfully!"
echo "📁 Frontend files are now in deploy/frontend/"
