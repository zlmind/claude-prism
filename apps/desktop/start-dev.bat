@echo off
chcp 65001 > nul

call "D:\Apps\micro\VC\Auxiliary\Build\vcvarsall.bat" x64 > nul 2>&1

set CARGO_HOME=D:\Apps\rust\.cargo
set RUSTUP_HOME=D:\Apps\rust\.rustup
set "PATH=%CARGO_HOME%\bin;%PATH%"

cd /d D:\aiproject\claude-prism\apps\desktop

echo ========================================
echo   ClaudePrism Tauri Dev Starting...
echo ========================================
echo.
echo Checking tools...
call rustc --version
call cargo --version
echo.
echo Starting pnpm tauri dev...
echo.

pnpm tauri dev

echo.
echo Tauri dev exited with code %errorlevel%
pause
