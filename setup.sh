#!/bin/bash
set -e

echo "========================================"
echo "Knowledge OS - Quick Setup Script"
echo "========================================"
echo ""

echo "[1/5] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found. Please install Node.js 20+"
    exit 1
fi
node -v
echo ""

echo "[2/5] Checking Docker..."
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker not found. Please install Docker"
    exit 1
fi
docker --version
echo ""

echo "[3/5] Installing dependencies..."
npm install
echo "Dependencies installed successfully"
echo ""

echo "[4/5] Starting Docker containers..."
docker-compose up -d
echo "Waiting for containers to be healthy (10 seconds)..."
sleep 10
echo ""

echo "[5/5] Initializing database..."
npm run db:push
npm run db:seed
echo ""

echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo ""
echo "IMPORTANT: Before running, add your Gemini API key to .env:"
echo "  GEMINI_API_KEY=your_key_here"
echo ""
echo "Get your API key at: https://aistudio.google.com/apikey"
echo ""
echo "To start the application:"
echo "  Terminal 1: npm run dev"
echo "  Terminal 2: npm run worker"
echo ""
echo "Then visit: http://localhost:3000"
echo ""
echo "Demo accounts:"
echo "  admin@local / admin123"
echo "  hr@local / hr123456"
echo "  dev@local / dev123456"
echo ""
