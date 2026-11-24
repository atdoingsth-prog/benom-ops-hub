@echo off
chcp 65001 >nul
title benom Operations Hub - Server
cd /d "%~dp0app"

echo ============================================================
echo   benom Operations Hub (Sidecar Mode - Kohnan Viet Nam)
echo ============================================================
echo.

for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /i "IPv4"') do (
  set "LAN_IP=%%a"
  goto :found_ip
)
:found_ip
set "LAN_IP=%LAN_IP: =%"

echo   [Desktop] Truy cap tren may tinh:  http://localhost:3005
if not "%LAN_IP%"=="" (
  echo   [Mobile]  KTV truy cap cung Wi-Fi: http://%LAN_IP%:3005
)
echo.
echo   Luu y: Giu cua so nay mo khi dang su dung App.
echo   Nhan Ctrl+C de dung server.
echo ============================================================
echo.

start "" "http://localhost:3005"
node server/index.mjs
pause
