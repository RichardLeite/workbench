@echo off
set "ROOT=%~dp0.."
if exist "%ROOT%\.venv\Scripts\python.exe" (
  set "PYTHONUTF8=1"
  set "PYTHONIOENCODING=utf-8"
  "%ROOT%\.venv\Scripts\python.exe" -m workbench %*
  exit /b %ERRORLEVEL%
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap.ps1" %*
exit /b %ERRORLEVEL%
