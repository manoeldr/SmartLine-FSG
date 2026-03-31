@echo off
title SmartLine Server

echo Iniciando SmartLine...
echo.

:: Ativa o venv e sobe o backend na porta 5000
start "Backend - SmartLine API" cmd /k "cd /d "%~dp0" && venv\Scripts\activate && python -m uvicorn backend.main:app --host 0.0.0.0 --port 5000 --reload"

:: Aguarda 2 segundos para o backend subir antes do frontend
timeout /t 2 /nobreak > nul

:: Sobe o frontend na porta 5500
start "Frontend - SmartLine UI" cmd /k "cd /d "%~dp0" && python -m http.server 5500 --directory frontend"

:: Aguarda mais 2 segundos e abre o browser
timeout /t 2 /nobreak > nul
start http://127.0.0.1:5500

echo.
echo Servidores iniciados!
echo Backend: http://127.0.0.1:5000
echo Frontend: http://127.0.0.1:5500
echo.
pause