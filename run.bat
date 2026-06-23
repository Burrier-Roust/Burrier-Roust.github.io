@echo off
title HSK 智能学习系统

echo.
echo   ========================================
echo     HSK 智能学习系统
echo   ========================================
echo.

python --version >nul 2>&1
if errorlevel 1 (
    echo   [错误] 未找到 Python
    echo   请安装 Python 3.10+ : https://www.python.org/downloads/
    echo   安装时务必勾选 "Add Python to PATH"
    pause
    exit
)

echo   [1/3] 检查环境...
if not exist ".venv\Scripts\python.exe" (
    echo         正在创建虚拟环境，请稍候...
    python -m venv .venv
)
echo         环境就绪
echo.

echo   [2/3] 安装依赖...
call .venv\Scripts\activate.bat
pip install -r requirements.txt -q
echo         依赖就绪
echo.

echo   [3/3] 启动服务...
echo   ========================================
echo.
echo   浏览器即将打开 http://localhost:8000
echo   如未自动打开，请手动访问该地址
echo   按 Ctrl+C 停止服务
echo.
echo   ========================================
echo.

start http://localhost:8000
python -m uvicorn main:app --host 0.0.0.0 --port 8000
pause
