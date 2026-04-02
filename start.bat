@echo off
title Meejahse - Haber Ajani
echo.
echo  ⚡ Meejahse - Sosyal Medya Haber Ajani
echo  ========================================
echo.

:: Start backend
echo  [1/2] Backend baslatiliyor...
cd /d "%~dp0backend"
start "Meejahse Backend" cmd /k "py -m uvicorn main:app --reload --port 8000"

:: Wait for backend to start
timeout /t 3 /nobreak >nul

:: Start frontend
echo  [2/2] Frontend baslatiliyor...
cd /d "%~dp0frontend"
start "Meejahse Frontend" cmd /k "npm run dev"

echo.
echo  ✅ Meejahse baslatildi!
echo  Backend:  http://localhost:8000
echo  Frontend: http://localhost:5173
echo  API Docs: http://localhost:8000/docs
echo.
pause
