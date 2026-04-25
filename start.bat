@echo off
title Haberajani - Haber Ajani
echo.
echo  Haberajani - Sosyal Medya Haber Ajani
echo  ========================================
echo.

:: Proje kok dizini (bat dosyasinin bulundugu yer)
set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"

:: Virtual environment kontrolu
if exist "%ROOT%.venv\Scripts\python.exe" (
    set "PYTHON=%ROOT%.venv\Scripts\python.exe"
) else if exist "%BACKEND%\.venv\Scripts\python.exe" (
    set "PYTHON=%BACKEND%\.venv\Scripts\python.exe"
) else (
    set "PYTHON=python"
)

echo  Python: %PYTHON%
echo.

:: Backend
echo  [1/2] Backend baslatiliyor...
cd /d "%BACKEND%"
start "Haberajani Backend" cmd /k "%PYTHON% -m uvicorn main:app --reload --port 8000"

timeout /t 3 /nobreak >nul

:: Frontend
echo  [2/2] Frontend baslatiliyor...
cd /d "%FRONTEND%"
start "Haberajani Frontend" cmd /k "npm run dev"

echo.
echo  Haberajani baslatildi!
echo  Backend:  http://localhost:8000
echo  Frontend: http://localhost:5173
echo  API Docs: http://localhost:8000/docs
echo.
pause
