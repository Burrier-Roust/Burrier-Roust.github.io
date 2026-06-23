# HSK 智能学习系统

面向 HSK6 级备考者的智能汉语学习系统。以课文为中心，点击生词即可查看词汇详情、例句搭配和即时练习。

## 环境要求

- Python 3.10 或更高版本
- 网络连接（用于 AI 问答功能）

## 快速启动

### Windows 用户

双击 `run.bat`，浏览器会自动打开。

> 如果浏览器显示"无法访问 / localhost 拒绝连接"，请参考下方 [常见问题](#常见问题)。

### macOS / Linux 用户

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

打开浏览器访问 `http://localhost:8000`

---

## 常见问题

### Q: 双击 run.bat 后浏览器显示"无法访问"

1. **查看 run.bat 窗口的错误信息**——不要关掉黑色窗口，里面会有具体报错
2. 最常见原因是 **Python 没装或没勾选 PATH**：
   - 打开cmd，输入 `python --version`
   - 如果显示"不是内部命令"，请重装 Python 并勾选 `Add Python to PATH`
3. 如果 run.bat 一闪而过看不到错误：
   - 在程序文件夹的地址栏输入 `cmd` 回车
   - 然后手动输入 `python -m uvicorn main:app --host 0.0.0.0 --port 8000` 看报错

### Q: 提示端口被占用

- 修改端口：`python -m uvicorn main:app --host 0.0.0.0 --port 8080`
- 然后访问 `http://localhost:8080`

### Q: AI 问答不能用

- 检查 `API-KEY.txt` 文件是否存在且包含有效的 API Key
- 确保网络能访问 `api.deepseek.com`

## 功能说明

| 功能 | 说明 |
|------|------|
| 课文阅读 | 左栏显示课文，生词以橙色虚线标注 |
| 词汇点击 | 点击任意生词，右侧显示拼音、释义、语境解释 |
| 例句搭配 | 每个生词配有常见搭配和真实例句 |
| 即时练习 | 选择题/填空题/判断题，做完即时反馈 |
| AI 问答 | 内置 DeepSeek AI 辅导老师，可自由提问 |
| 课文朗读 | 首次播放自动生成音频（需 edge-tts） |

## 自定义配置

如需修改 AI 服务配置，编辑 `main.py` 中的默认设置：

```python
os.environ.setdefault("LLM_API_BASE", "https://api.deepseek.com/v1")
os.environ.setdefault("LLM_MODEL", "deepseek-v4-pro")
```

或设置环境变量 `LLM_API_KEY`、`LLM_API_BASE`、`LLM_MODEL`。

## 文件结构

```
├── main.py               # FastAPI 后端
├── requirements.txt      # Python 依赖
├── prompt.md             # AI 辅导老师系统提示词
├── API-KEY.txt           # DeepSeek API 密钥
├── run.bat               # Windows 一键启动
├── data/
│   ├── lesson_33.json    # 怀念慢生活
│   ├── lesson_34.json    # 为文物而生的人
│   ├── lesson_35.json    # 走进木版年画
│   ├── lesson_36.json    # 中国古代书院
│   └── audio/            # 课文朗读音频
└── static/
    ├── index.html        # 前端页面
    ├── css/style.css     # 样式
    └── js/app.js         # 交互逻辑
```
