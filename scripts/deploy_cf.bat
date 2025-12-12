@echo off
setlocal EnableDelayedExpansion

rem -------------------------------------------------
rem ATRI Cloudflare Worker One-Click Deploy (Windows)
rem -------------------------------------------------

echo ========================================
echo   ATRI Cloudflare Worker Deploy
echo ========================================
echo.

rem Calculate project root and worker directories
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%.."
set "ROOT_DIR=%CD%"
set "WORKER_DIR=%ROOT_DIR%\worker"
set "WRANGLER_FILE=%WORKER_DIR%\wrangler.toml"

echo Project root: %ROOT_DIR%
echo Worker dir:   %WORKER_DIR%
echo.

rem Check if worker directory exists
if not exist "%WORKER_DIR%" (
    echo [ERROR] Worker directory not found: %WORKER_DIR%
    echo Please run this script from the correct location.
    pause
    exit /b 1
)

rem Check Node.js
echo Checking environment...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js 18+
    echo Download: https://nodejs.org/
    pause
    exit /b 1
)
echo   - Node.js: OK

rem Check npm
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] npm not found. Please reinstall Node.js
    pause
    exit /b 1
)
echo   - npm: OK

rem Check Python (Windows usually has 'python' or 'py', not 'python3')
set "PYTHON_CMD="
where py >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON_CMD=py"
    goto :python_found
)
where python >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON_CMD=python"
    goto :python_found
)
where python3 >nul 2>&1
if %errorlevel% equ 0 (
    set "PYTHON_CMD=python3"
    goto :python_found
)

echo [ERROR] Python not found. Please install Python 3.8+
echo Download: https://www.python.org/downloads/
pause
exit /b 1

:python_found
echo   - Python: OK (%PYTHON_CMD%)
echo.

echo [1/7] Installing Worker dependencies...
cd /d "%WORKER_DIR%"
if %errorlevel% neq 0 (
    echo [ERROR] Cannot enter worker directory
    pause
    exit /b 1
)
call npm install
echo Dependencies installed.
echo.

echo [2/7] Syncing prompts...
cd /d "%ROOT_DIR%"
%PYTHON_CMD% "%ROOT_DIR%\scripts\sync_shared.py"
echo Prompts synced.
echo.

echo [3/7] Login to Cloudflare (browser will open)...
cd /d "%WORKER_DIR%"
call npx wrangler login
echo Login complete.
echo.

rem User input for configuration
echo ========================================
echo   Resource Names (press Enter for defaults)
echo ========================================
echo.

set "WORKER_NAME=atri-worker"
set /p "WORKER_NAME=Worker name [default: atri-worker]: "

set "D1_NAME=atri_diary"
set /p "D1_NAME=D1 database name [default: atri_diary]: "

set "R2_NAME=atri-media"
set /p "R2_NAME=R2 bucket name [default: atri-media]: "

set "VEC_NAME=atri-memories"
set /p "VEC_NAME=Vectorize index name [default: atri-memories]: "

echo.
echo ========================================
echo   API URLs (press Enter for defaults)
echo ========================================
echo.

set "OPENAI_API_URL=https://api.openai.com/v1"
set /p "OPENAI_API_URL=Chat API URL [default: https://api.openai.com/v1]: "

set "DIARY_API_URL=%OPENAI_API_URL%"
set /p "DIARY_API_URL=Diary API URL [default: same as chat]: "

set "EMBEDDINGS_API_URL=%OPENAI_API_URL%"
set /p "EMBEDDINGS_API_URL=Embeddings API URL [default: same as chat]: "

set "DIARY_MODEL=gpt-4"
set /p "DIARY_MODEL=Diary model [default: gpt-4]: "

set "EMBEDDINGS_MODEL=BAAI/bge-m3"
set /p "EMBEDDINGS_MODEL=Embeddings model [default: BAAI/bge-m3]: "

echo.
echo [4/7] Creating Cloudflare resources...
cd /d "%WORKER_DIR%"

echo.
echo - Creating D1 database: %D1_NAME%
call npx wrangler d1 create "%D1_NAME%" 2>&1
echo.

set "D1_ID="
echo If database_id was shown above, copy and paste it below:
set /p "D1_ID=database_id (or press Enter to skip): "

echo.
echo - Initializing D1 tables...
call npx wrangler d1 execute "%D1_NAME%" --file=db/schema.sql --remote 2>&1
echo.

echo - Creating R2 bucket: %R2_NAME%
call npx wrangler r2 bucket create "%R2_NAME%" 2>&1
echo.

echo - Creating Vectorize index: %VEC_NAME%
call npx wrangler vectorize create "%VEC_NAME%" --dimensions=1024 --metric=cosine 2>&1
echo.

echo Resources created.
echo.

echo [5/7] Writing config to wrangler.toml...

rem Use PowerShell to replace config values
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$file = '%WRANGLER_FILE%';" ^
  "$c = Get-Content $file -Raw -Encoding UTF8;" ^
  "$c = $c -replace '(?m)^name\s*=\s*\"[^\"]*\"', 'name = \"%WORKER_NAME%\"';" ^
  "$c = $c -replace '(?m)^OPENAI_API_URL\s*=\s*\"[^\"]*\"', 'OPENAI_API_URL = \"%OPENAI_API_URL%\"';" ^
  "$c = $c -replace '(?m)^DIARY_API_URL\s*=\s*\"[^\"]*\"', 'DIARY_API_URL = \"%DIARY_API_URL%\"';" ^
  "$c = $c -replace '(?m)^DIARY_MODEL\s*=\s*\"[^\"]*\"', 'DIARY_MODEL = \"%DIARY_MODEL%\"';" ^
  "$c = $c -replace '(?m)^EMBEDDINGS_API_URL\s*=\s*\"[^\"]*\"', 'EMBEDDINGS_API_URL = \"%EMBEDDINGS_API_URL%\"';" ^
  "$c = $c -replace '(?m)^EMBEDDINGS_MODEL\s*=\s*\"[^\"]*\"', 'EMBEDDINGS_MODEL = \"%EMBEDDINGS_MODEL%\"';" ^
  "$c = $c -replace '(?m)^index_name\s*=\s*\"[^\"]*\"', 'index_name = \"%VEC_NAME%\"';" ^
  "$c = $c -replace '(?m)^bucket_name\s*=\s*\"[^\"]*\"', 'bucket_name = \"%R2_NAME%\"';" ^
  "$c = $c -replace '(?m)^preview_bucket_name\s*=\s*\"[^\"]*\"', 'preview_bucket_name = \"%R2_NAME%\"';" ^
  "$c = $c -replace '(?m)^database_name\s*=\s*\"[^\"]*\"', 'database_name = \"%D1_NAME%\"';" ^
  "if ('%D1_ID%'.Trim().Length -gt 0) { $c = $c -replace '(?m)^database_id\s*=\s*\"[^\"]*\"', 'database_id = \"%D1_ID%\"' };" ^
  "Set-Content -Path $file -Value $c -Encoding UTF8 -NoNewline;"

if %errorlevel% neq 0 (
    echo [WARNING] Config write may have failed. Check worker/wrangler.toml
) else (
    echo Config written.
)
echo.

echo [6/7] Setting Secrets...
cd /d "%WORKER_DIR%"

echo.
echo ========================================
echo   API Keys
echo ========================================
echo.

:input_api_key
set "OPENAI_API_KEY="
set /p "OPENAI_API_KEY=Enter OPENAI_API_KEY (required): "
if "%OPENAI_API_KEY%"=="" (
    echo [ERROR] OPENAI_API_KEY cannot be empty!
    goto :input_api_key
)
echo %OPENAI_API_KEY%| call npx wrangler secret put OPENAI_API_KEY
echo.

set "DIARY_API_KEY="
set /p "DIARY_API_KEY=Enter DIARY_API_KEY (optional, press Enter to skip): "
if not "%DIARY_API_KEY%"=="" (
    echo %DIARY_API_KEY%| call npx wrangler secret put DIARY_API_KEY
)

set "EMBEDDINGS_API_KEY="
set /p "EMBEDDINGS_API_KEY=Enter EMBEDDINGS_API_KEY (optional, press Enter to skip): "
if not "%EMBEDDINGS_API_KEY%"=="" (
    echo %EMBEDDINGS_API_KEY%| call npx wrangler secret put EMBEDDINGS_API_KEY
)

set "APP_TOKEN="
set /p "APP_TOKEN=Enter APP_TOKEN (optional, protects API): "
if not "%APP_TOKEN%"=="" (
    echo %APP_TOKEN%| call npx wrangler secret put APP_TOKEN
)

echo.
echo Secrets configured.
echo.

echo [7/7] Deploying Worker...
cd /d "%WORKER_DIR%"
call npx wrangler deploy

echo.
echo ========================================
echo   Deploy Complete!
echo ========================================
echo.
echo Look for your Worker URL above, like:
echo   https://atri-worker.your-subdomain.workers.dev
echo.
echo Enter this URL in the ATRI app settings to start chatting!
echo.
pause

endlocal
