@echo off
title SmartLine — Build .exe

echo ============================================
echo  SmartLine — Gerando executavel...
echo ============================================
echo.

cd /d "%~dp0"
call venv\Scripts\activate

if exist dist rmdir /s /q dist
if exist build rmdir /s /q build

pyinstaller smartline.spec --clean

:: Copia o frontend para a pasta dist
if exist dist\SmartLine.exe (
    echo.
    echo Copiando frontend...
    xcopy /E /I /Y frontend dist\frontend
    echo.
    echo ============================================
    echo  Sucesso! Distribuicao em: dist\
    echo  - SmartLine.exe
    echo  - frontend\
    echo ============================================
) else (
    echo  Erro ao gerar executavel.
)
echo.
pause