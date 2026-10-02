@echo off
chcp 65001 >nul
title Jukebox Pix
cd /d "%~dp0"

if not exist "node_modules" (
  echo Instalando dependencias...
  call npm install || goto erro
)
if not exist "frontend\dist\index.html" (
  echo Preparando o app...
  call npm --prefix frontend install || goto erro
  call npm run build || goto erro
)

:iniciar
echo [%date% %time%] Iniciando a jukebox...
node backend\server.js
echo.
echo [%date% %time%] A jukebox parou (codigo %errorlevel%). Reiniciando em 5 segundos... (feche esta janela para sair)
timeout /t 5 /nobreak >nul
goto iniciar

:erro
echo.
echo Falha na preparacao. Leia as mensagens acima.
pause
