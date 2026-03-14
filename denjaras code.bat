@echo off
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit
)
cd /d "%~dp0"
npx @anthropic-ai/claude-code --dangerously-skip-permissions