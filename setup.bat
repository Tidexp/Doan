@echo off
echo ========================================
echo Knowledge OS - Quick Setup Script
echo ========================================
echo.

echo [1/5] Checking Node.js...
node -v > nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Please install Node.js 20+
    pause
    exit /b 1
)
node -v
echo.

echo [2/5] Checking Docker...
docker --version > nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker not found. Please install Docker Desktop
    pause
    exit /b 1
)
docker --version
echo.

echo [3/5] Installing dependencies...
call npm install
if errorlevel 1 (
    echo ERROR: npm install failed
    pause
    exit /b 1
)
echo Dependencies installed successfully
echo.

echo [4/5] Starting Docker containers...
docker-compose up -d
if errorlevel 1 (
    echo ERROR: Failed to start Docker containers
    pause
    exit /b 1
)
echo Waiting for containers to be healthy (10 seconds)...
timeout /t 10 /nobreak > nul
echo.

echo [5/5] Initializing database...
call npm run db:push
if errorlevel 1 (
    echo ERROR: Database push failed
    pause
    exit /b 1
)
call npm run db:seed
if errorlevel 1 (
    echo ERROR: Database seed failed
    pause
    exit /b 1
)
echo.

echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo IMPORTANT: Before running, add your Gemini API key to .env:
echo   GEMINI_API_KEY=your_key_here
echo.
echo Get your API key at: https://aistudio.google.com/apikey
echo.
echo To start the application:
echo   Terminal 1: npm run dev
echo   Terminal 2: npm run worker
echo.
echo Then visit: http://localhost:3000
echo.
echo Demo accounts:
echo   admin@local / admin123
echo   hr@local / hr123456
echo   dev@local / dev123456
echo.
pause
