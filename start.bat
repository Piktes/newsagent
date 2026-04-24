@echo off
title Haberajani - Haber Ajani
echo.
echo  ⚡ Haberajani - Sosyal Medya Haber Ajani
echo  ========================================
echo.

:: Start backend
echo  [1/2] Backend baslatiliyor...
cd /d "%~dp0backend"
start "Haberajani Backend" cmd /k "..\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000"

:: Wait for backend to start
timeout /t 3 /nobreak >nul

:: Start frontend
echo  [2/2] Frontend baslatiliyor...
cd /d "%~dp0frontend"
start "Haberajani Frontend" cmd /k "npm run dev"

echo.
echo  ✅ Haberajani baslatildi!
echo  Backend:  http://localhost:8000
echo  Frontend: http://localhost:5173
echo  API Docs: http://localhost:8000/docs
echo.
pause
