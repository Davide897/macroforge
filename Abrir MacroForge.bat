@echo off
rem Abre o MacroForge num servidor local (necessario para instalar como app e funcionar offline).
cd /d "%~dp0"
start "" http://localhost:8765/
python serve.py 8765
