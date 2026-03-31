@echo off
title Parando SmartLine

echo Parando servidores SmartLine...
taskkill /FI "WINDOWTITLE eq Backend - SmartLine API" /T /F
taskkill /FI "WINDOWTITLE eq Frontend - SmartLine UI" /T /F
echo Servidores parados.
pause