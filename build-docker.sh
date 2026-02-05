#!/bin/bash

# Cable Manager Docker Build Script

set -e

echo "🐳 Building Cable Manager Docker Image..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Build the image
echo "📦 Building Docker image..."
docker build -t cable-manager:latest .

# Tag with version if provided
if [ ! -z "$1" ]; then
    echo "🏷️  Tagging with version: $1"
    docker tag cable-manager:latest cable-manager:$1
fi

echo "✅ Docker image built successfully!"
echo ""
echo "🚀 To run the container:"
echo "   docker run -d -p 3000:3000 -v cable-uploads:/app/uploads cable-manager:latest"
echo ""
echo "📋 Or use docker-compose:"
echo "   docker-compose up -d"
echo ""
echo "🔧 For Unraid:"
echo "   1. Copy the image to your Unraid server"
echo "   2. Use the template in docker/unraid-template.xml"
echo "   3. Configure ports and volumes as needed"