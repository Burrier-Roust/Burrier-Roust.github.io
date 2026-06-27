"""
HSK Intelligent Learning System - Backend
===========================================
FastAPI 后端服务，提供课文数据、词汇查询、TTS 音频生成和 AI 问答接口。

核心理念："以课文为中心，以点击为入口，以语境解释为核心，以练习巩固为闭环"
"""
import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

import jieba
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / "data"
AUDIO_DIR = DATA_DIR / "audio"
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

# 加载 HSK 辅导老师 System Prompt
PROMPT_PATH = BASE_DIR / "prompt.md"
if PROMPT_PATH.exists():
    SYSTEM_PROMPT = PROMPT_PATH.read_text(encoding="utf-8").strip()
else:
    SYSTEM_PROMPT = "你是一位专业的汉语教学助手，请用简洁易懂的语言回答学生的问题。"

# 加载 API Key
API_KEY_PATH = BASE_DIR / "API-KEY.txt"
if API_KEY_PATH.exists():
    _api_key_from_file = API_KEY_PATH.read_text(encoding="utf-8").strip()
    if _api_key_from_file:
        os.environ.setdefault("LLM_API_KEY", _api_key_from_file)

# DeepSeek API 默认配置
os.environ.setdefault("LLM_API_BASE", "https://api.deepseek.com/v1")
os.environ.setdefault("LLM_MODEL", "deepseek-v4-pro")


def _init_jieba():
    """启动时将所有课文词汇及注释词加入 jieba 词典，确保不被切碎。"""
    for f in DATA_DIR.glob("lesson_*.json"):
        with open(f, "r", encoding="utf-8") as fp:
            data = json.load(fp)
            # 生词
            for word in data.get("words_data", {}):
                jieba.add_word(word, freq=50000)
            # 注释词（如人名、地名、术语），高优先级确保不被切分
            for note in data.get("notes", []):
                jieba.add_word(note["term"], freq=80000)
            # 注：单字生词不再参与多字词拆分，避免"结束"中的"束"被误拆


@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_jieba()
    yield


app = FastAPI(title="HSK Learning System", version="1.0.0", lifespan=lifespan)


def load_lesson(lesson_id: int) -> dict | None:
    path = DATA_DIR / f"lesson_{lesson_id}.json"
    if not path.exists():
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _split_token_by_vocab(token: str, vocab_words: set[str]) -> list[dict]:
    """将含生词的 token 拆分为子 token，生词部分标记 is_vocab=True。

    例如 '呼啸而过' 含生词 '呼啸' → ['呼啸'(True), '而'(False), '过'(False)]
    例如 '小舟' 含单字词 '舟' → ['小'(False), '舟'(True)]

    对单字生词会做 jieba 重分词验证：若 jieba 将该 token 视为一个整体
    （如'结束'），则不拆分，避免把'束'从已知复合词中误拆出来。
    """
    if not token or len(token) <= 1:
        return [{"text": token, "is_vocab": token in vocab_words}]

    candidates = sorted(
        [w for w in vocab_words if w in token and w != token],
        key=len,
        reverse=True,
    )
    if not candidates:
        return [{"text": token, "is_vocab": False}]

    # 单字生词容易误拆常见复合词（如把"结束"拆成"结"+"束"），
    # 用 jieba 重分词验证：jieba 认为不可拆就不拆
    if all(len(w) == 1 for w in candidates):
        sub_tokens = list(jieba.cut(token, HMM=False))
        if len(sub_tokens) == 1:
            return [{"text": token, "is_vocab": False}]

    result = []
    i = 0
    while i < len(token):
        matched = None
        for cw in candidates:
            if token[i:].startswith(cw):
                matched = cw
                break
        if matched:
            result.append({"text": matched, "is_vocab": True})
            i += len(matched)
        else:
            result.append({"text": token[i], "is_vocab": False})
            i += 1
    return result


def segment_paragraph(text: str, vocab_words: set[str]) -> list[dict]:
    """对段落进行中文分词，标记每个 token 是否为生词。

    jieba 可能将生词合并进更大的组合（如'小舟'含'舟'），本函数通过二次拆分确保
    所有生词都能被正确标记。单字生词的误拆由 _split_token_by_vocab 内的
    jieba 重分词验证来防止。
    """
    tokens = list(jieba.cut(text))
    result = []
    for token in tokens:
        token = token.strip()
        if not token:
            continue
        if token in vocab_words:
            result.append({"text": token, "is_vocab": True})
        elif any(w in token for w in vocab_words if w != token):
            result.extend(_split_token_by_vocab(token, vocab_words))
        else:
            result.append({"text": token, "is_vocab": False})
    return result


# ==================== API Routes ====================

@app.get("/api/lessons")
async def list_lessons():
    """列出所有可用的课文。"""
    lessons = []
    for f in sorted(DATA_DIR.glob("lesson_*.json")):
        with open(f, "r", encoding="utf-8") as fp:
            d = json.load(fp)
            lessons.append({"lesson_id": d["lesson_id"], "title": d["title"]})
    return lessons


@app.get("/api/lessons/{lesson_id}")
async def get_lesson(lesson_id: int):
    """获取完整课文数据（含分词结果）。"""
    lesson = load_lesson(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail=f"Lesson {lesson_id} not found")

    vocab = set(lesson.get("words_data", {}).keys())
    segments = [segment_paragraph(p, vocab) for p in lesson.get("paragraphs", [])]

    return {
        "lesson_id": lesson["lesson_id"],
        "title": lesson["title"],
        "audio_url": lesson.get("audio_url", ""),
        "paragraphs": lesson["paragraphs"],
        "segments": segments,
        "words_data": lesson.get("words_data", {}),
        "notes": lesson.get("notes", []),
        "sentence_patterns": lesson.get("sentence_patterns", []),
    }


@app.get("/api/words/{lesson_id}/{word:path}")
async def get_word(lesson_id: int, word: str):
    """查询某个生词的完整信息。"""
    lesson = load_lesson(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail=f"Lesson {lesson_id} not found")

    wd = lesson.get("words_data", {}).get(word)
    if wd:
        return {"word": word, "found": True, **wd}
    return {
        "word": word,
        "found": False,
        "pinyin": "",
        "pos": "",
        "definition_en": "该词不在本课词汇表中，可以尝试在 AI 问答中了解更多。",
        "context_explanation": "",
        "collocations": [],
        "examples": [],
        "grammar": None,
        "exercises": [],
    }


@app.get("/api/audio/{lesson_id}")
async def get_audio(lesson_id: int):
    """获取课文朗读音频（首次请求时使用 edge-tts 生成并缓存）。"""
    audio_path = AUDIO_DIR / f"lesson_{lesson_id}.mp3"
    if audio_path.exists():
        return FileResponse(audio_path, media_type="audio/mpeg")

    lesson = load_lesson(lesson_id)
    if not lesson:
        raise HTTPException(status_code=404, detail=f"Lesson {lesson_id} not found")

    try:
        import edge_tts

        full_text = "".join(lesson["paragraphs"])
        communicate = edge_tts.Communicate(full_text, "zh-CN-XiaoxiaoNeural")
        await communicate.save(str(audio_path))
        return FileResponse(audio_path, media_type="audio/mpeg")
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="TTS 未安装。请运行: pip install edge-tts",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"音频生成失败: {str(e)}")


@app.post("/api/chat")
async def chat(payload: dict):
    """
    AI 智能问答接口。

    支持 OpenAI 兼容 API（通过环境变量 LLM_API_KEY / LLM_API_BASE / LLM_MODEL 配置）。
    未配置时返回引导提示。
    """
    user_message = payload.get("message", "").strip()
    word = payload.get("word", "")
    lesson_title = payload.get("lesson_title", "")

    if not user_message:
        raise HTTPException(status_code=400, detail="消息不能为空")

    api_key = os.environ.get("LLM_API_KEY") or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return {
            "reply": (
                f"关于「{word}」的问题已收到：{user_message}\n\n"
                "💡 AI 问答功能尚未配置。请在环境变量中设置 LLM_API_KEY 以启用智能问答。\n"
                "支持 OpenAI 兼容 API，可配置 LLM_API_BASE 和 LLM_MODEL。"
            )
        }

    try:
        import httpx

        api_base = os.environ.get("LLM_API_BASE", "https://api.openai.com/v1")
        model = os.environ.get("LLM_MODEL", "gpt-3.5-turbo")

        # 构建当前学习上下文，置入 System Prompt 最前面
        context = (
            f"当前学习信息：\n"
            f"- 课文：《{lesson_title}》\n"
            f"- 学生当前关注的核心词汇：「{word}」\n"
            f"- 学生问题是关于这个词汇或课文内容的，请结合上下文回答。\n"
        )
        system_prompt = context + "\n" + SYSTEM_PROMPT

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{api_base.rstrip('/')}/chat/completions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                    "max_tokens": 500,
                    "temperature": 0.7,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            reply = data["choices"][0]["message"]["content"]
            return {"reply": reply}

    except ImportError:
        return {
            "reply": (
                f"关于「{word}」的问题已收到：{user_message}\n\n"
                "⚠️ 需要安装 httpx 以启用 AI 问答: pip install httpx"
            )
        }
    except Exception as e:
        return {"reply": f"❌ AI 服务暂时不可用: {str(e)}"}


@app.post("/api/exercises/check")
async def check_exercise(payload: dict):
    """校验练习答案。"""
    user_answer = payload.get("answer")
    correct_answer = payload.get("correct_answer")
    exercise_type = payload.get("type", "multiple_choice")

    if user_answer is None or correct_answer is None:
        raise HTTPException(status_code=400, detail="缺少答案或正确答案")

    if exercise_type == "judge":
        user_bool = str(user_answer).lower() in ("true", "yes", "对", "正确", "1")
        correct_bool = bool(correct_answer)
        is_correct = user_bool == correct_bool
    else:
        is_correct = str(user_answer).strip() == str(correct_answer).strip()

    return {"correct": is_correct}


# ==================== Static Files ====================

app.mount("/", StaticFiles(directory="static", html=True), name="static")
