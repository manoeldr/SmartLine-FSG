@echo off
title Parando SmartLine

echo Parando servidores SmartLine...
:: Parando Backend na porta 5000
FOR /F "tokens=5" %%a IN ('netstat -aon ^| find ":5000" ^| find "LISTENING"') DO (
    taskkill /F /PID %%a >nul 2>&1
)

:: Parando Frontend na porta 5500
FOR /F "tokens=5" %%a IN ('netstat -aon ^| find ":5500" ^| find "LISTENING"') DO (
    taskkill /F /PID %%a >nul 2>&1
)

echo Servidores parados.
pause