#!/bin/bash

# AutoQA Pilot Development Environment Setup Script
# This script sets up the complete development environment

set -e

echo "🚀 Setting up AutoQA Pilot development environment..."

# Check prerequisites
echo "📋 Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 20+ first."
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js version must be 20 or higher. Current version: $(node -v)"
    exit 1
fi

echo "✅ Prerequisites check passed"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Set up environment variables
echo "🔧 Setting up environment variables..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env file from template"
    echo "⚠️  Please edit .env file with your configuration before continuing"
else
    echo "✅ .env file already exists"
fi

# Set up Git hooks
echo "🪝 Setting up Git hooks..."
npx husky install
chmod +x .husky/pre-commit
chmod +x .husky/pre-push
echo "✅ Git hooks configured"

# Start Docker services
echo "🐳 Starting Docker services..."
docker-compose up -d postgres redis minio

# Wait for services to be ready
echo "⏳ Waiting for services to be ready..."
sleep 10

# Check service health
echo "🏥 Checking service health..."
docker-compose ps

# Run initial database setup
echo "🗄️ Setting up database..."
# This will be implemented when we create the database migration scripts

echo "🎉 Development environment setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your configuration"
echo "2. Run 'npm run dev' to start development servers"
echo "3. Visit http://localhost:3000 to see the application"
echo ""
echo "Available commands:"
echo "- npm run dev          # Start development servers"
echo "- npm run test         # Run all tests"
echo "- npm run lint         # Run linting"
echo "- npm run docker:up    # Start Docker services"
echo "- npm run docker:down  # Stop Docker services"