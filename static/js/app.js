/**
 * 智读桥 - 前端交互逻辑
 * ====================================
 * 核心理念："以课文为中心，以点击为入口，以语境解释为核心，以练习巩固为闭环"
 */

// ==================== 全局状态 ====================
const state = {
    currentLessonId: 33,
    lessonData: null,
    lessonList: [],
    selectedWord: null,
    audioPlaying: false,
};

// ==================== DOM 引用 ====================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
    // Dropdown
    lessonDropdownBtn: $("#lesson-dropdown-btn"),
    lessonDropdownMenu: $("#lesson-dropdown-menu"),
    lessonDropdownList: $("#lesson-dropdown-list"),
    currentLessonLabel: $("#current-lesson-label"),
    dropdownChevron: $("#dropdown-chevron"),
    // Lesson
    lessonTitle: $("#lesson-title"),
    textContainer: $("#text-container"),
    readingArea: $("#reading-area"),
    audioPlayer: $("#audio-player"),
    playBtn: $("#play-btn"),
    playIcon: $("#play-icon"),
    audioStatus: $("#audio-status"),
    sidebarEmpty: $("#sidebar-empty"),
    sidebarWordDetail: $("#sidebar-word-detail"),
    readingNotes: $("#reading-notes"),
    notesList: $("#notes-list"),
    // Word detail fields
    wdWord: $("#wd-word"),
    wdPos: $("#wd-pos"),
    wdPinyin: $("#wd-pinyin"),
    wdDefinition: $("#wd-definition"),
    wdContextText: $("#wd-context-text"),
    wdCollocations: $("#wd-collocations"),
    wdExamples: $("#wd-examples"),
    wdGrammar: $("#wd-grammar"),
    wdExercises: $("#wd-exercises"),
    // Sections
    sectionCollocations: $("#section-collocations"),
    sectionGrammar: $("#section-grammar"),
    sectionExercises: $("#section-exercises"),
    // Chat
    chatMessages: $("#chat-messages"),
    chatInput: $("#chat-input"),
    chatSendBtn: $("#chat-send-btn"),
    chatWordRef: $("#chat-word-ref"),
};

// ==================== API 调用 ====================
const api = {
    async get(path) {
        const resp = await fetch(path);
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ detail: resp.statusText }));
            throw new Error(err.detail || `HTTP ${resp.status}`);
        }
        return resp.json();
    },

    async post(path, body) {
        const resp = await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ detail: resp.statusText }));
            throw new Error(err.detail || `HTTP ${resp.status}`);
        }
        return resp.json();
    },

    listLessons() { return this.get("/api/lessons"); },
    getLesson(id) { return this.get(`/api/lessons/${id}`); },
    getWord(lessonId, word) { return this.get(`/api/words/${lessonId}/${encodeURIComponent(word)}`); },
    chat(message, word, lessonTitle) { return this.post("/api/chat", { message, word, lesson_title: lessonTitle }); },
    checkExercise(answer, correctAnswer, type) { return this.post("/api/exercises/check", { answer, correct_answer: correctAnswer, type }); },
};

// ==================== 初始化 ====================
async function init() {
    initMarkdown();
    await loadLessonList();
    await loadLesson(state.currentLessonId);
    bindEvents();
}

async function loadLessonList() {
    try {
        const lessons = await api.listLessons();
        state.lessonList = lessons;
        renderLessonDropdown();
    } catch (e) {
        dom.lessonSelector.innerHTML = '<option value="">加载失败</option>';
        console.error("Failed to load lesson list:", e);
    }
}

function renderLessonDropdown() {
    const lessons = state.lessonList || [];
    const currentId = state.currentLessonId;
    const currentLesson = lessons.find(l => l.lesson_id === currentId);

    // 更新按钮标签
    if (currentLesson) {
        dom.currentLessonLabel.textContent = `第${currentLesson.lesson_id}课 · ${currentLesson.title}`;
    }

    // 渲染下拉列表
    dom.lessonDropdownList.innerHTML = lessons.length === 0
        ? '<div class="px-4 py-3 text-sm text-gray-400 text-center">暂无课文</div>'
        : lessons.map(l => `
            <div class="lesson-dropdown-item ${l.lesson_id === currentId ? 'active' : ''}"
                 data-lesson-id="${l.lesson_id}">
                <span class="lesson-num">第${l.lesson_id}课</span>
                <span class="lesson-title-text">${escapeHtml(l.title)}</span>
                ${l.lesson_id === currentId ? '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>' : ''}
            </div>
        `).join("");

    // 绑定点击事件
    dom.lessonDropdownList.querySelectorAll('.lesson-dropdown-item').forEach(item => {
        item.addEventListener('click', async () => {
            const newId = parseInt(item.dataset.lessonId);
            if (newId !== state.currentLessonId) {
                closeLessonDropdown();
                await loadLesson(newId);
                renderLessonDropdown();
            } else {
                closeLessonDropdown();
            }
        });
    });
}

async function loadLesson(lessonId) {
    state.currentLessonId = lessonId;
    state.selectedWord = null;
    dom.textContainer.innerHTML = '<div class="flex items-center justify-center py-12"><div class="loading-spinner"></div></div>';
    showSidebarEmpty();

    try {
        state.lessonData = await api.getLesson(lessonId);
    } catch (e) {
        dom.textContainer.innerHTML = `<div class="text-red-500 text-center py-12">课文加载失败: ${e.message}</div>`;
        return;
    }

    renderLesson(state.lessonData);
    setupAudio(state.lessonData.audio_url);
}

// ==================== 渲染课文 ====================
function renderLesson(lesson) {
    dom.lessonTitle.textContent = lesson.title;
    document.title = `${lesson.title} - 智读桥`;

    const vocabWords = new Set(Object.keys(lesson.words_data || {}));

    let html = "";
    for (let pi = 0; pi < lesson.paragraphs.length; pi++) {
        const para = lesson.paragraphs[pi];
        const segs = lesson.segments[pi] || [];
        html += '<p class="paragraph-reading leading-loose" data-para="' + pi + '">';
        for (const token of segs) {
            const text = escapeHtml(token.text);
            if (token.is_vocab && vocabWords.has(token.text)) {
                html += `<span class="vocab-token key-vocab" data-word="${text}" title="点击查看「${text}」详情">${text}</span>`;
            } else {
                html += text;
            }
        }
        html += "</p>";
    }

    dom.textContainer.innerHTML = html;

    // 渲染注释
    renderNotes(lesson.notes || []);

    // 绑定词汇点击事件
    dom.textContainer.querySelectorAll(".vocab-token.key-vocab").forEach((el) => {
        el.addEventListener("click", () => onWordClick(el.dataset.word, el));
    });
}

function renderNotes(notes) {
    if (!notes || notes.length === 0) {
        dom.readingNotes.classList.add("hidden");
        return;
    }

    const itemsHtml = notes.map((n, i) =>
        `<div class="flex gap-3 text-sm" id="note-item-${i}">
            <span class="text-amber-600 font-bold shrink-0 mt-0.5">${escapeHtml(n.ref)}</span>
            <div>
                <span class="font-semibold text-gray-700">${escapeHtml(n.term)}</span>
                <p class="text-gray-500 mt-0.5 leading-relaxed">${escapeHtml(n.content)}</p>
            </div>
        </div>`
    ).join("");

    dom.notesList.innerHTML = itemsHtml;
    dom.readingNotes.classList.remove("hidden");

    // 在正文中为每个注释词插入角标
    insertFootnoteMarkers(notes);
}

function insertFootnoteMarkers(notes) {
    if (!notes || notes.length === 0) return;
    if (!state.lessonData || !state.lessonData.paragraphs) return;

    const paragraphs = dom.textContainer.querySelectorAll(".paragraph-reading");

    notes.forEach(function(note, i) {
        const searchText = note.matchText || note.term;

        // 找到包含该注释词的段落
        for (var pi = 0; pi < state.lessonData.paragraphs.length; pi++) {
            var paraText = state.lessonData.paragraphs[pi];
            var termIndex = paraText.indexOf(searchText);
            if (termIndex === -1) continue;

            var termEnd = termIndex + searchText.length;
            var pEl = paragraphs[pi];
            if (!pEl) continue;

            // 用 TreeWalker 遍历文本节点，定位注释插入位置
            var walker = document.createTreeWalker(pEl, NodeFilter.SHOW_TEXT);
            var charCount = 0;
            var targetNode = null;
            var targetOffset = 0;

            while (walker.nextNode()) {
                var node = walker.currentNode;
                // 跳过脚注标记内的文本
                if (node.parentElement && node.parentElement.classList.contains("footnote-marker")) {
                    continue;
                }
                var len = node.textContent.length;
                if (charCount + len >= termEnd) {
                    targetNode = node;
                    targetOffset = termEnd - charCount;
                    break;
                }
                charCount += len;
            }

            if (targetNode) {
                var marker = document.createElement("sup");
                marker.className = "footnote-marker";
                marker.textContent = note.ref;
                marker.title = note.term + ": " + note.content;

                // 用闭包保留当前 note 的索引
                (function(noteIndex) {
                    marker.addEventListener("click", function(e) {
                        e.stopPropagation();
                        var noteItem = document.getElementById("note-item-" + noteIndex);
                        if (noteItem) {
                            noteItem.scrollIntoView({ behavior: "smooth", block: "center" });
                            noteItem.classList.add("note-highlight");
                            setTimeout(function() {
                                noteItem.classList.remove("note-highlight");
                            }, 2000);
                        }
                    });
                })(i);

                // 在文本节点的指定偏移处切开，插入角标
                var afterText = targetNode.splitText(targetOffset);
                targetNode.parentNode.insertBefore(marker, afterText);
            }

            break; // 每个注释只插在第一处匹配段落
        }
    });
}

function escapeHtml(text) {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return text.replace(/[&<>"']/g, (c) => map[c]);
}

// ==================== 词汇点击交互 ====================
async function onWordClick(word, element) {
    // 取消上一個高亮
    const prev = dom.textContainer.querySelector(".vocab-token.active");
    if (prev) prev.classList.remove("active");

    // 高亮当前词
    element.classList.add("active");
    state.selectedWord = word;

    // 滚动到可见区域（如果需要）
    element.scrollIntoView({ behavior: "smooth", block: "center" });

    // 请求词汇详情
    try {
        const data = await api.getWord(state.currentLessonId, word);
        renderSidebar(data);
    } catch (e) {
        showSidebarEmpty();
        console.error("Failed to load word:", e);
    }
}

// ==================== 侧边栏渲染 ====================
function showSidebarEmpty() {
    dom.sidebarEmpty.classList.remove("hidden");
    dom.sidebarWordDetail.classList.add("hidden");
}

function renderSidebar(data) {
    dom.sidebarEmpty.classList.add("hidden");
    dom.sidebarWordDetail.classList.remove("hidden");

    // 1. 词汇详情
    dom.wdWord.textContent = data.word;
    dom.wdPos.textContent = data.pos || "";
    dom.wdPinyin.textContent = data.pinyin || "";
    dom.wdDefinition.textContent = data.definition_en || "";
    dom.wdContextText.textContent = data.context_explanation || "暂无课文语境说明";

    // 2. 搭配与例句
    const collocations = data.collocations || [];
    const examples = data.examples || [];
    if (collocations.length > 0 || examples.length > 0) {
        dom.sectionCollocations.classList.remove("hidden");
        dom.wdCollocations.innerHTML = collocations
            .map((c) => `<span class="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full border border-blue-200">${escapeHtml(c)}</span>`)
            .join("");
        dom.wdExamples.innerHTML = examples
            .map((e) => `<div class="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">${escapeHtml(e)}</div>`)
            .join("");
    } else {
        dom.sectionCollocations.classList.add("hidden");
    }

    // 3. 语法点
    if (data.grammar) {
        dom.sectionGrammar.classList.remove("hidden");
        dom.wdGrammar.textContent = data.grammar;
    } else {
        dom.sectionGrammar.classList.add("hidden");
    }

    // 4. 即时练习
    const exercises = data.exercises || [];
    if (exercises.length > 0) {
        dom.sectionExercises.classList.remove("hidden");
        renderExercises(exercises);
    } else {
        dom.sectionExercises.classList.add("hidden");
    }

    // 5. AI 问答引用词
    dom.chatWordRef.textContent = data.word;
    dom.chatInput.value = "";

    // 滚动侧边栏到顶部
    dom.sidebarWordDetail.parentElement.scrollTop = 0;
}

// ==================== 练习渲染与交互 ====================
function renderExercises(exercises) {
    dom.wdExercises.innerHTML = exercises
        .map((ex, i) => renderExerciseItem(ex, i))
        .join("");

    // 绑定选项点击
    dom.wdExercises.querySelectorAll(".exercise-option").forEach((opt) => {
        opt.addEventListener("click", async function () {
            const index = parseInt(this.dataset.exerciseIndex);
            const exercise = exercises[index];
            const type = exercise.type;

            if (type === "judge") {
                handleJudgeAnswer(this, exercise, index);
            } else if (type === "fill_blank") {
                // 填空通过输入处理
            } else {
                // 选择题
                handleChoiceAnswer(this, exercise, index);
            }
        });
    });

    // 绑定填空提交
    dom.wdExercises.querySelectorAll(".fill-blank-input").forEach((input) => {
        input.addEventListener("keydown", async function (e) {
            if (e.key === "Enter") {
                const index = parseInt(this.dataset.exerciseIndex);
                const exercise = exercises[index];
                await handleFillBlankAnswer(this, exercise, index);
            }
        });
    });

    dom.wdExercises.querySelectorAll(".fill-blank-btn").forEach((btn) => {
        btn.addEventListener("click", async function () {
            const index = parseInt(this.dataset.exerciseIndex);
            const exercise = exercises[index];
            const input = dom.wdExercises.querySelector(`.fill-blank-input[data-exercise-index="${index}"]`);
            await handleFillBlankAnswer(input, exercise, index);
        });
    });
}

function renderExerciseItem(ex, index) {
    let questionHtml = `<p class="text-sm text-gray-700 font-medium mb-2">${index + 1}. ${escapeHtml(ex.question)}</p>`;
    let answerHtml = "";

    if (ex.type === "multiple_choice") {
        answerHtml = '<div class="space-y-1">' +
            (ex.options || []).map((opt) =>
                `<button class="exercise-option w-full text-left text-sm px-3 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-amber-300 transition-colors"
                    data-exercise-index="${index}" data-value="${escapeHtml(opt)}">
                    ${escapeHtml(opt)}
                </button>`
            ).join("") +
            '</div>';
    } else if (ex.type === "fill_blank") {
        answerHtml = `<div class="flex gap-2">
            <input class="fill-blank-input flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
                data-exercise-index="${index}" placeholder="输入答案...">
            <button class="fill-blank-btn text-sm px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
                data-exercise-index="${index}">确定</button>
        </div>`;
    } else if (ex.type === "judge") {
        answerHtml = `<div class="flex gap-2">
            <button class="exercise-option text-sm px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-amber-300 transition-colors"
                data-exercise-index="${index}" data-value="true">对 ✓</button>
            <button class="exercise-option text-sm px-4 py-2 rounded-lg border border-gray-200 bg-white text-gray-600 hover:border-amber-300 transition-colors"
                data-exercise-index="${index}" data-value="false">错 ✗</button>
        </div>`;
    }

    return `<div class="bg-white border border-gray-200 rounded-xl p-4 exercise-item" data-exercise-index="${index}">
        ${questionHtml}
        ${answerHtml}
        <div class="exercise-feedback mt-2 hidden text-xs"></div>
    </div>`;
}

async function handleChoiceAnswer(clickedBtn, exercise, index) {
    // 清除同题其他选项状态
    const siblings = clickedBtn.parentElement.querySelectorAll(".exercise-option");
    siblings.forEach((s) => {
        s.classList.remove("selected", "correct", "wrong");
        s.disabled = true;
    });

    const userAnswer = clickedBtn.dataset.value;
    clickedBtn.classList.add("selected");

    const result = await api.checkExercise(userAnswer, exercise.answer, exercise.type);
    const feedback = dom.wdExercises.querySelector(`.exercise-item[data-exercise-index="${index}"] .exercise-feedback`);

    if (result.correct) {
        clickedBtn.classList.add("correct");
        feedback.textContent = "✓ 正确！" + (exercise.explanation ? " " + exercise.explanation : "");
        feedback.className = "exercise-feedback mt-2 text-xs text-green-600";
    } else {
        clickedBtn.classList.add("wrong");
        // 高亮正确答案
        siblings.forEach((s) => {
            if (s.dataset.value === exercise.answer) s.classList.add("correct");
        });
        feedback.textContent = "✗ 错误。" + (exercise.explanation ? " " + exercise.explanation : "");
        feedback.className = "exercise-feedback mt-2 text-xs text-red-600";
    }
    feedback.classList.remove("hidden");
}

async function handleJudgeAnswer(clickedBtn, exercise, index) {
    const siblings = clickedBtn.parentElement.querySelectorAll(".exercise-option");
    siblings.forEach((s) => {
        s.classList.remove("selected", "correct", "wrong");
        s.disabled = true;
    });

    const userAnswer = clickedBtn.dataset.value;
    clickedBtn.classList.add("selected");

    const result = await api.checkExercise(userAnswer, exercise.answer, exercise.type);
    const feedback = dom.wdExercises.querySelector(`.exercise-item[data-exercise-index="${index}"] .exercise-feedback`);

    if (result.correct) {
        clickedBtn.classList.add("correct");
        feedback.textContent = "✓ 判断正确！" + (exercise.explanation ? " " + exercise.explanation : "");
        feedback.className = "exercise-feedback mt-2 text-xs text-green-600";
    } else {
        clickedBtn.classList.add("wrong");
        const correctBtn = Array.from(siblings).find((s) =>
            (s.dataset.value === "true") === Boolean(exercise.answer)
        );
        if (correctBtn) correctBtn.classList.add("correct");
        feedback.textContent = "✗ 判断错误。" + (exercise.explanation ? " " + exercise.explanation : "");
        feedback.className = "exercise-feedback mt-2 text-xs text-red-600";
    }
    feedback.classList.remove("hidden");
}

async function handleFillBlankAnswer(input, exercise, index) {
    const userAnswer = input.value.trim();
    if (!userAnswer) return;

    const result = await api.checkExercise(userAnswer, exercise.answer, exercise.type);
    const feedback = dom.wdExercises.querySelector(`.exercise-item[data-exercise-index="${index}"] .exercise-feedback`);

    if (result.correct) {
        input.classList.add("border-green-400", "bg-green-50");
        feedback.textContent = "✓ 正确！" + (exercise.explanation ? " " + exercise.explanation : "");
        feedback.className = "exercise-feedback mt-2 text-xs text-green-600";
    } else {
        input.classList.add("border-red-400", "bg-red-50");
        feedback.textContent = `✗ 正确答案是「${exercise.answer}」。` + (exercise.explanation ? " " + exercise.explanation : "");
        feedback.className = "exercise-feedback mt-2 text-xs text-red-600";
    }
    feedback.classList.remove("hidden");
    input.disabled = true;
    const btn = dom.wdExercises.querySelector(`.fill-blank-btn[data-exercise-index="${index}"]`);
    if (btn) btn.disabled = true;
}

// ==================== 音频播放 ====================
function setupAudio(audioUrl) {
    dom.audioPlayer.src = audioUrl || "";
    dom.audioPlayer.load();
    dom.audioStatus.textContent = audioUrl ? "" : "无音频";
    dom.playBtn.disabled = !audioUrl;
}

// ==================== AI 聊天 ====================

// 全局初始化 marked（仅一次）
function initMarkdown() {
    if (typeof marked !== 'undefined') {
        marked.setOptions({
            breaks: true,    // 换行 → <br>
            gfm: true,       // GitHub Flavored Markdown（表格、复选框等）
        });
    }
}

function renderMarkdown(text) {
    if (!text) return '';
    if (typeof marked !== 'undefined') {
        try {
            return marked.parse(text);
        } catch (e) {
            console.warn('Markdown parse error:', e);
        }
    }
    // 兜底：纯文本换行处理
    return '<p>' + escapeHtml(text).replace(/\n/g, '<br>') + '</p>';
}

async function sendChatMessage() {
    const message = dom.chatInput.value.trim();
    if (!message) return;

    const word = state.selectedWord || "";
    const lessonTitle = state.lessonData?.title || "";

    // 显示用户消息
    appendChatMessage("user", message);
    dom.chatInput.value = "";

    // 显示加载状态
    const loadingDiv = appendChatMessage("assistant", '<span class="text-gray-400">思考中...</span>');

    try {
        const result = await api.chat(message, word, lessonTitle);
        // 始终通过 Markdown 渲染，确保格式统一
        loadingDiv.innerHTML = renderMarkdown(result.reply);
    } catch (e) {
        loadingDiv.innerHTML = `<span class="text-red-500">发送失败: ${e.message}</span>`;
    }

    // 滚动到底部
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

function appendChatMessage(role, content) {
    // 移除空状态提示
    const emptyHint = dom.chatMessages.querySelector(".text-gray-400.text-center");
    if (emptyHint) emptyHint.remove();

    const div = document.createElement("div");
    if (role === "user") {
        div.className = "text-right text-indigo-700 bg-indigo-50 rounded-lg px-3 py-1.5 ml-8";
        div.textContent = content;
    } else {
        div.className = "chat-message-assistant text-left text-gray-700 bg-white rounded-lg px-3 py-2 mr-8 border border-gray-100";
        div.innerHTML = content;
    }
    dom.chatMessages.appendChild(div);
    return div;
}

// ==================== 课文下拉框交互 ====================
function toggleLessonDropdown() {
    const isOpen = !dom.lessonDropdownMenu.classList.contains("hidden");
    if (isOpen) {
        closeLessonDropdown();
    } else {
        openLessonDropdown();
    }
}

function openLessonDropdown() {
    dom.lessonDropdownMenu.classList.remove("hidden");
    dom.dropdownChevron.style.transform = "rotate(180deg)";
}

function closeLessonDropdown() {
    dom.lessonDropdownMenu.classList.add("hidden");
    dom.dropdownChevron.style.transform = "rotate(0deg)";
}

// 点击外部关闭下拉框
document.addEventListener("click", (e) => {
    if (!e.target.closest("#lesson-dropdown")) {
        closeLessonDropdown();
    }
});

// ==================== 事件绑定 ====================
function bindEvents() {
    // 下拉框按钮
    dom.lessonDropdownBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleLessonDropdown();
    });

    dom.playBtn.addEventListener("click", () => {
        if (dom.audioPlayer.paused) {
            dom.audioPlayer.play().catch(() => {
                dom.audioStatus.textContent = "播放失败";
            });
        } else {
            dom.audioPlayer.pause();
        }
    });

    dom.audioPlayer.addEventListener("play", () => {
        dom.playIcon.innerHTML = '<path d="M18 10a1 1 0 01-2 0V6a1 1 0 012 0v4zM12 6a1 1 0 00-2 0v4a1 1 0 002 0V6zM6 10a1 1 0 01-2 0V6a1 1 0 012 0v4z"/>';
        dom.audioStatus.textContent = "播放中...";
    });

    dom.audioPlayer.addEventListener("pause", () => {
        dom.playIcon.innerHTML = '<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"/>';
        dom.audioStatus.textContent = "";
    });

    dom.audioPlayer.addEventListener("ended", () => {
        dom.audioStatus.textContent = "播放完毕";
    });

    dom.audioPlayer.addEventListener("error", () => {
        dom.audioStatus.textContent = "音频加载失败";
    });

    dom.chatSendBtn.addEventListener("click", sendChatMessage);
    dom.chatInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") sendChatMessage();
    });

    // 键盘导航：Esc 取消选中
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            const prev = dom.textContainer.querySelector(".vocab-token.active");
            if (prev) prev.classList.remove("active");
            state.selectedWord = null;
            showSidebarEmpty();
        }
    });
}

// ==================== 启动 ====================
init();
