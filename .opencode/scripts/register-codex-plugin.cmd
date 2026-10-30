@echo off
REM Register WG Workbench as a Codex CLI plugin
REM Execute from .workbench root
echo Registering WG Workbench plugin with Codex CLI...
echo.
codex plugin marketplace add %~dp0..\..\.agents\plugins
echo.
echo Done! Restart Codex CLI for the plugin to take effect.
echo To verify: codex plugin list
