@echo off
chcp 65001 > nul

:: This batch bootstraps PowerShell for the real build
set CARGO_HOME=D:\Apps\rust\.cargo
set RUSTUP_HOME=D:\Apps\rust\.rustup
set "PATH=%CARGO_HOME%\bin;%PATH%"
call "D:\Apps\micro\VC\Auxiliary\Build\vcvarsall.bat" x64 > nul 2>&1

cd /d D:\aiproject\claude-prism

powershell -ExecutionPolicy Bypass -File "%~dp0build-windows.ps1"
pause
