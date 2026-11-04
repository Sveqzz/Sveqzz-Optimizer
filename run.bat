@echo off
:: Abre VELOX como administrador (necesario para cambiar ajustes del sistema)
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando dependencias, solo la primera vez...
  call npm install
)
call npm start
