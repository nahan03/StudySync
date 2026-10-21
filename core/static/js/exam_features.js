/* exam_features.js — Flashcards + Practice Questions for Exam Mode */
ssReady(function () {
  if (!document.getElementById('fc-deck')) return;

  const $ = id => document.getElementById(id);

  function escHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Prefer exam-specific key; fall back to shared key for backward compat
  const _sharedPlan = JSON.parse(localStorage.getItem('studySyncActivePlan') || 'null');
  const plan = (_sharedPlan && _sharedPlan.mode === 'exam')
    ? _sharedPlan
    : (JSON.parse(localStorage.getItem('studySyncExamPlan') || 'null') || _sharedPlan);
  const planSubject = (plan && plan.subject) ? plan.subject.toLowerCase() : 'general';

  /* ══════════════════════════════════════════
     SHARED SOURCES (files + URLs, used by flashcards + practice)
  ══════════════════════════════════════════ */
  let uploadedFiles = [];
  let uploadedUrls  = [];

  function buildContentContext() {
    const fileParts = uploadedFiles.map(f => `FILE — ${f.name}:\n${f.content}`);
    const urlParts  = uploadedUrls.map(u => `REFERENCE URL: ${u}`);
    return [...fileParts, ...urlParts].join('\n\n---\n\n');
  }

  function updateSourceCount() {
    const el = $('fc-sources-count');
    if (el) el.textContent = `${uploadedFiles.length} file${uploadedFiles.length !== 1 ? 's' : ''} · ${uploadedUrls.length} URL${uploadedUrls.length !== 1 ? 's' : ''}`;
    const ctx = $('practice-context');
    if (ctx) ctx.textContent = (uploadedFiles.length + uploadedUrls.length) > 0
      ? `${uploadedFiles.length + uploadedUrls.length} source${uploadedFiles.length + uploadedUrls.length !== 1 ? 's' : ''} loaded`
      : '0 sources loaded';
  }

  const uploadZone = $('practice-upload-zone');
  const fileInput  = $('practice-file-input');
  const fileListEl = $('practice-file-list');
  const uploadBtn  = $('practice-upload-btn');
  const urlListEl  = $('fc-url-list');

  if (uploadBtn) uploadBtn.addEventListener('click', e => { e.stopPropagation(); fileInput.click(); });
  if (uploadZone) {
    uploadZone.addEventListener('click', e => { if (e.target === uploadZone) fileInput.click(); });
    uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
    uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
    uploadZone.addEventListener('drop', e => {
      e.preventDefault(); uploadZone.classList.remove('drag-over');
      readFiles(Array.from(e.dataTransfer.files));
    });
  }
  if (fileInput) fileInput.addEventListener('change', () => { readFiles(Array.from(fileInput.files)); fileInput.value = ''; });

  function readFiles(files) {
    files.forEach(async file => {
      if (uploadedFiles.find(f => f.name === file.name)) return;
      try {
        let content = '';
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'pdf') content = await readPdf(file);
        else if (ext === 'docx') content = await readDocx(file);
        else content = await readTextFile(file);
        uploadedFiles.push({ name: file.name, content });
        renderFileList();
        updateSourceCount();
      } catch (err) {
        if (window.showGlobalAlert) window.showGlobalAlert(`Could not read "${file.name}": ${err.message}`, 'error');
      }
    });
  }

  function readTextFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result);
      reader.onerror = () => reject(new Error('File read failed'));
      reader.readAsText(file);
    });
  }

  async function readPdf(file) {
    const waitForPdfJs = () => new Promise((resolve, reject) => {
      let attempts = 0;
      const check = () => {
        if (window._pdfjsLib) return resolve(window._pdfjsLib);
        if (++attempts > 40) return reject(new Error('pdf.js did not load'));
        setTimeout(check, 150);
      };
      check();
    });
    const pdfjs = await waitForPdfJs();
    const ab  = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: ab }).promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      pages.push(content.items.map(item => item.str).join(' '));
    }
    return pages.join('\n');
  }

  async function readDocx(file) {
    if (!window.mammoth) throw new Error('mammoth.js did not load');
    const ab     = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer: ab });
    return result.value;
  }

  function renderFileList() {
    if (!fileListEl) return;
    fileListEl.innerHTML = '';
    uploadedFiles.forEach((f, i) => {
      const chip = document.createElement('span');
      chip.className = 'dm-file-chip';
      chip.innerHTML = `📄 ${escHtml(f.name)} <button class="dm-file-chip-remove" data-i="${i}" title="Remove">✕</button>`;
      fileListEl.appendChild(chip);
    });
    fileListEl.querySelectorAll('.dm-file-chip-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        uploadedFiles.splice(Number(btn.dataset.i), 1);
        renderFileList();
        updateSourceCount();
      });
    });
  }

  function renderUrlList() {
    if (!urlListEl) return;
    urlListEl.innerHTML = '';
    uploadedUrls.forEach((url, i) => {
      const chip = document.createElement('span');
      chip.className = 'dm-file-chip dm-file-chip-url';
      chip.innerHTML = `🔗 <a href="${escHtml(url)}" target="_blank" rel="noopener" class="dm-file-chip-link">${escHtml(url.replace(/^https?:\/\//, '').substring(0, 50))}${url.length > 60 ? '…' : ''}</a> <button class="dm-file-chip-remove" data-i="${i}" title="Remove">✕</button>`;
      urlListEl.appendChild(chip);
    });
    urlListEl.querySelectorAll('.dm-file-chip-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        uploadedUrls.splice(Number(btn.dataset.i), 1);
        renderUrlList();
        updateSourceCount();
      });
    });
  }

  // URL add button
  const srcUrlInput = $('fc-src-url');
  const srcUrlAdd   = $('fc-src-url-add');
  if (srcUrlAdd) srcUrlAdd.addEventListener('click', () => {
    const url = srcUrlInput ? srcUrlInput.value.trim() : '';
    if (!url || uploadedUrls.includes(url)) { if (srcUrlInput) srcUrlInput.value = ''; return; }
    try { new URL(url); } catch { if (window.showGlobalAlert) window.showGlobalAlert('Enter a valid URL.', 'warning'); return; }
    uploadedUrls.push(url);
    if (srcUrlInput) srcUrlInput.value = '';
    renderUrlList();
    updateSourceCount();
  });
  if (srcUrlInput) srcUrlInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); srcUrlAdd && srcUrlAdd.click(); }
  });

  updateSourceCount();

  /* ══════════════════════════════════════════
     PRACTICE QUESTIONS
  ══════════════════════════════════════════ */
  let generatedQuestions = [];

  const genBtn = $('generate-questions-btn');
  if (genBtn) genBtn.addEventListener('click', generateQuestions);

  async function generateQuestions() {
    const context = buildContentContext();
    if (!context.trim()) {
      if (window.showGlobalAlert) window.showGlobalAlert('Upload a file to generate questions from.', 'warning');
      return;
    }
    const types = Array.from(document.querySelectorAll('.dm-practice-types input[type="checkbox"]:checked')).map(cb => cb.value);
    if (!types.length) {
      if (window.showGlobalAlert) window.showGlobalAlert('Select at least one question type.', 'warning');
      return;
    }
    const numQ = $('practice-count').value;
    $('practice-loading').classList.remove('hidden');
    $('practice-questions-output').classList.add('hidden');
    $('practice-score-banner').classList.add('hidden');
    try {
      const csrf = document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || '';
      const res = await fetch('/api/generate-questions/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
        body: JSON.stringify({ context, num_questions: numQ, types }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Server error ${res.status}`); }
      const data = await res.json();
      generatedQuestions = data.questions || [];
      if (!generatedQuestions.length) throw new Error('No questions returned.');
      renderQuestions(generatedQuestions);
      $('practice-questions-output').classList.remove('hidden');
    } catch (err) {
      if (window.showGlobalAlert) window.showGlobalAlert(`Could not generate questions: ${err.message}`, 'error');
    } finally {
      $('practice-loading').classList.add('hidden');
    }
  }

  function renderQuestions(questions) {
    const list = $('practice-questions-list');
    list.innerHTML = '';
    $('practice-q-count').textContent = `${questions.length} question${questions.length !== 1 ? 's' : ''} generated`;
    questions.forEach((q, i) => {
      const card = document.createElement('div');
      card.className = 'dm-question-card';
      card.dataset.index = i;
      card.innerHTML = `
        <div class="dm-q-meta">
          <span class="dm-q-num">Q${i + 1}</span>
          <span class="dm-q-type-badge">${typeLabel(q.type)}</span>
        </div>
        <p class="dm-q-text">${escHtml(q.question)}</p>
        ${renderAnswerArea(q, i)}
      `;
      list.appendChild(card);
    });
    list.querySelectorAll('.dm-mcq-option').forEach(btn => {
      btn.addEventListener('click', function () {
        const card = this.closest('.dm-question-card');
        const idx = Number(card.dataset.index);
        const q = generatedQuestions[idx];
        if (card.dataset.answered) return;
        card.dataset.answered = '1';
        const chosen = this.dataset.value;
        const correct = chosen === q.answer;
        card.querySelectorAll('.dm-mcq-option').forEach(o => {
          o.disabled = true;
          if (o.dataset.value === q.answer) o.classList.add('correct');
          else if (o.dataset.value === chosen && !correct) o.classList.add('wrong');
        });
        card.classList.add(correct ? 'answered-correct' : 'answered-wrong');
        showExplanation(card, q);
      });
    });
    list.querySelectorAll('.dm-tf-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const card = this.closest('.dm-question-card');
        const idx = Number(card.dataset.index);
        const q = generatedQuestions[idx];
        if (card.dataset.answered) return;
        card.dataset.answered = '1';
        const chosen = this.dataset.value;
        const correct = chosen.toLowerCase() === q.answer.toLowerCase();
        card.querySelectorAll('.dm-tf-btn').forEach(b => {
          b.disabled = true;
          if (b.dataset.value.toLowerCase() === q.answer.toLowerCase()) b.classList.add('correct');
          else if (b.dataset.value === chosen && !correct) b.classList.add('wrong');
        });
        card.classList.add(correct ? 'answered-correct' : 'answered-wrong');
        showExplanation(card, q);
      });
    });
    list.querySelectorAll('.dm-reveal-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const card = this.closest('.dm-question-card');
        card.dataset.answered = '1';
        this.style.display = 'none';
        const checkBtn = card.querySelector('.dm-check-btn');
        if (checkBtn) checkBtn.style.display = 'none';
        showExplanation(card, generatedQuestions[Number(card.dataset.index)]);
      });
    });
    list.querySelectorAll('.dm-check-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        const card = this.closest('.dm-question-card');
        const idx = Number(card.dataset.index);
        const q = generatedQuestions[idx];
        if (card.dataset.answered) return;
        card.dataset.answered = '1';
        this.style.display = 'none';
        const revealBtn = card.querySelector('.dm-reveal-btn');
        if (revealBtn) revealBtn.style.display = 'none';
        const input = card.querySelector('.dm-q-input');
        const guess = input ? input.value.trim() : '';
        const verdict = judgeAnswer(guess, q.answer);
        const feedback = card.querySelector('.dm-check-feedback');
        if (feedback) {
          feedback.classList.remove('hidden');
          if (verdict === 'correct') {
            feedback.className = 'dm-check-feedback correct';
            feedback.textContent = '✓ Correct!';
            card.classList.add('answered-correct');
          } else if (verdict === 'partial') {
            feedback.className = 'dm-check-feedback partial';
            feedback.textContent = '🤔 Almost there!';
            card.classList.add('answered-correct');
          } else {
            feedback.className = 'dm-check-feedback wrong';
            feedback.textContent = '✗ Not quite';
            card.classList.add('answered-wrong');
          }
        }
        showExplanation(card, q);
      });
    });
  }

  function renderAnswerArea(q) {
    if (q.type === 'mcq') {
      return `<div class="dm-mcq-options">${(q.options || []).map(o => `<button class="dm-mcq-option" data-value="${escHtml(o)}">${escHtml(o)}</button>`).join('')}</div>`;
    }
    if (q.type === 'truefalse') {
      return `<div class="dm-tf-options"><button class="dm-tf-btn" data-value="True">True</button><button class="dm-tf-btn" data-value="False">False</button></div>`;
    }
    if (q.type === 'fillinblank') {
      return `<div class="dm-text-answer"><input class="dm-q-input" placeholder="Fill in the blank…"><div class="dm-text-actions"><button class="dm-check-btn">Check</button><button class="dm-reveal-btn">Reveal Answer</button></div><div class="dm-check-feedback hidden"></div></div>`;
    }
    return `<div class="dm-text-answer"><textarea class="dm-q-input" rows="3" placeholder="Write your answer…"></textarea><div class="dm-text-actions"><button class="dm-check-btn">Check</button><button class="dm-reveal-btn">Reveal Answer</button></div><div class="dm-check-feedback hidden"></div></div>`;
  }

  function showExplanation(card, q) {
    if (card.querySelector('.dm-answer-reveal')) return;
    const div = document.createElement('div');
    div.className = 'dm-answer-reveal';
    div.innerHTML = `<strong>Answer:</strong> ${escHtml(q.answer)}` +
      (q.explanation ? `<p class="dm-explanation">${escHtml(q.explanation)}</p>` : '');
    card.appendChild(div);
  }

  function typeLabel(type) {
    return { mcq: 'MCQ', truefalse: 'True / False', shortanswer: 'Short Answer', fillinblank: 'Fill in Blank' }[type] || type;
  }

  const scoreBtnEl = $('practice-score-btn');
  if (scoreBtnEl) scoreBtnEl.addEventListener('click', () => {
    let correct = 0, total = 0;
    document.querySelectorAll('.dm-question-card').forEach((card, i) => {
      const q = generatedQuestions[i];
      if (!q || q.type === 'shortanswer') return;
      total++;
      if (card.classList.contains('answered-correct')) correct++;
    });
    const banner = $('practice-score-banner');
    banner.classList.remove('hidden');
    const pct = total ? Math.round((correct / total) * 100) : 0;
    banner.innerHTML = `<strong>${correct}/${total} correct (${pct}%)</strong> ${pct >= 80 ? '🌟 Excellent!' : pct >= 50 ? '💪 Keep going!' : '📚 Keep studying!'}`;
  });

  const retryBtnEl = $('practice-retry-btn');
  if (retryBtnEl) retryBtnEl.addEventListener('click', () => {
    $('practice-questions-output').classList.add('hidden');
    $('practice-score-banner').classList.add('hidden');
    $('practice-questions-list').innerHTML = '';
    generatedQuestions = [];
  });

  /* ══════════════════════════════════════════
     FLASHCARDS
  ══════════════════════════════════════════ */
  const FLASHCARD_KEY = 'studySyncFlashcards';
  let flashcards  = JSON.parse(localStorage.getItem(FLASHCARD_KEY) || '[]');
  let studyQueue  = [];
  let studyIndex  = 0;
  let studyResult = { known: 0, unknown: 0, skipped: 0 };
  let dueOnlyMode = false;
  let fcMode      = 'guess';

  function saveFlashcards() { localStorage.setItem(FLASHCARD_KEY, JSON.stringify(flashcards)); }
  function todayStr()       { return new Date().toISOString().split('T')[0]; }
  function isDue(card)      { return !card.nextReview || card.nextReview <= todayStr(); }
  function dueCount()       { return flashcards.filter(isDue).length; }

  function updateDueBadge() {
    const badge = $('fc-due-badge'), reviewBtn = $('fc-review-due-btn');
    if (!badge || !reviewBtn) return;
    const count = dueCount();
    badge.textContent = count;
    badge.classList.toggle('hidden', count === 0);
    reviewBtn.classList.toggle('hidden', count === 0);
    if (count > 0) reviewBtn.textContent = `📅 Review Due (${count})`;
  }

  function scheduleReview(cardId, verdict) {
    const days = { known: 7, skipped: 3, unknown: 1 }[verdict] || 1;
    const date = new Date(); date.setDate(date.getDate() + days);
    const idx = flashcards.findIndex(c => c.id === cardId);
    if (idx !== -1) { flashcards[idx].nextReview = date.toISOString().split('T')[0]; saveFlashcards(); }
  }

  function renderDeck() {
    const deck = $('fc-deck'), empty = $('fc-empty');
    deck.innerHTML = '';
    if (!flashcards.length) { empty.classList.remove('hidden'); $('fc-study-btn').disabled = true; updateDueBadge(); return; }
    empty.classList.add('hidden');
    $('fc-study-btn').disabled = false;
    flashcards.forEach(c => {
      const due = isDue(c);
      const tile = document.createElement('div');
      tile.className = 'dm-fc-preview' + (due ? ' dm-fc-preview-due' : '');
      tile.innerHTML = `
        <div class="dm-fc-preview-front">${escHtml(c.front)}</div>
        <div class="dm-fc-preview-back">${escHtml(c.back)}</div>
        ${due ? '<span class="dm-fc-due-dot" title="Due for review">●</span>' : ''}
        <button class="dm-fc-preview-del" data-id="${c.id}" title="Delete">✕</button>`;
      tile.querySelector('.dm-fc-preview-del').addEventListener('click', () => {
        flashcards = flashcards.filter(x => x.id !== c.id); saveFlashcards(); renderDeck();
      });
      deck.appendChild(tile);
    });
    updateDueBadge();
  }

  function _clearAddForm() {
    $('fc-add-form').classList.add('hidden');
    $('fc-front-input').value = '';
    $('fc-back-input').value = '';
  }

  $('fc-add-btn').addEventListener('click', () => $('fc-add-form').classList.toggle('hidden'));
  $('fc-cancel-btn').addEventListener('click', _clearAddForm);
  $('fc-save-btn').addEventListener('click', () => {
    const front = $('fc-front-input').value.trim(), back = $('fc-back-input').value.trim();
    if (!front || !back) { if (window.showGlobalAlert) window.showGlobalAlert('Fill in both sides of the card.', 'warning'); return; }
    flashcards.push({ id: Date.now().toString(), front, back, subject: planSubject, createdAt: Date.now() });
    saveFlashcards(); renderDeck();
    _clearAddForm();
  });

  $('fc-generate-btn').addEventListener('click', async () => {
    const context = buildContentContext();
    if (!context.trim()) { if (window.showGlobalAlert) window.showGlobalAlert('Upload a file first to generate flashcards.', 'warning'); return; }
    $('fc-generate-loading').classList.remove('hidden');
    $('fc-generate-btn').disabled = true;
    try {
      const csrf = document.cookie.split(';').find(c => c.trim().startsWith('csrftoken='))?.split('=')[1] || '';
      const res  = await fetch('/api/generate-flashcards/', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
        body: JSON.stringify({ context }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `Error ${res.status}`); }
      const data = await res.json();
      const newCards = (data.cards || []).map(c => ({
        id: Date.now().toString() + Math.random().toString(36).slice(2),
        front: c.front, back: c.back, subject: planSubject, createdAt: Date.now(),
      }));
      flashcards.push(...newCards); saveFlashcards(); renderDeck();
      if (window.showGlobalAlert) window.showGlobalAlert(`${newCards.length} flashcards generated!`, 'info');
    } catch (err) {
      if (window.showGlobalAlert) window.showGlobalAlert(`Could not generate flashcards: ${err.message}`, 'error');
    } finally {
      $('fc-generate-loading').classList.add('hidden'); $('fc-generate-btn').disabled = false;
    }
  });

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function judgeAnswer(guess, correct) {
    const norm = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const stopWords = new Set(['the','and','for','are','but','not','with','this','that','have','from','they','which','what','were','when','been','also','its','was','can','will','than','into','over']);
    const guessN = norm(guess), correctN = norm(correct);
    if (!guessN) return 'wrong';
    if (guessN === correctN) return 'correct';
    const keywords = correctN.split(/\s+/).filter(w => w.length > 3 && !stopWords.has(w));
    if (!keywords.length) return guessN.length > 2 && correctN.includes(guessN) ? 'correct' : 'wrong';
    const hits = keywords.filter(w => guessN.includes(w));
    const score = hits.length / keywords.length;
    return score >= 0.65 ? 'correct' : score >= 0.3 ? 'partial' : 'wrong';
  }

  const FEEDBACK = {
    correct: { avatars: ['🎊','🌟','🏆','🥳','💫'], msg: 'Correct!',      cls: 'correct', avatarClass: 'fc-avatar-correct' },
    partial: { avatars: ['🤔','💡','🧐','📖','💭'], msg: 'Almost there!', cls: 'partial', avatarClass: 'fc-avatar-partial' },
    wrong:   { avatars: ['😮','💪','🌱','📚','🔁'], msg: 'Not quite…',    cls: 'wrong',   avatarClass: 'fc-avatar-wrong'   },
  };

  function showFeedback(verdict, correctAnswer) {
    const f = FEEDBACK[verdict];
    const fb = $('fc-feedback');
    fb.className = `dm-fc-feedback ${f.cls}`;
    const emojiEl = $('fc-feedback-emoji');
    emojiEl.textContent = f.avatars[Math.floor(Math.random() * f.avatars.length)];
    emojiEl.className = `dm-fc-feedback-emoji ${f.avatarClass}`;
    $('fc-feedback-msg').textContent = f.msg;
    $('fc-feedback-answer').textContent = verdict === 'correct' ? '' : `Answer: ${correctAnswer}`;
    fb.classList.remove('hidden');
    const inp = $('fc-guess-input');
    inp.classList.remove('correct-glow', 'wrong-glow');
    inp.classList.add(verdict === 'correct' ? 'correct-glow' : 'wrong-glow');
  }

  let maybeNudgeTimer = null;

  function showShuffleAnimation(msg, sub, callback) {
    const overlay = $('fc-shuffle-overlay');
    $('fc-shuffle-msg').textContent = msg;
    $('fc-shuffle-sub').textContent = sub;
    overlay.querySelectorAll('.fc-shuffle-card').forEach(c => { c.style.animation = 'none'; c.offsetHeight; c.style.animation = ''; });
    overlay.classList.remove('hidden');
    setTimeout(() => { overlay.classList.add('hidden'); if (callback) callback(); }, 2000);
  }

  function showReadyPrompt() {
    $('fc-study').classList.add('hidden'); $('fc-deck-section').classList.add('hidden');
    $('fc-ready-overlay').classList.remove('hidden');
    clearTimeout(maybeNudgeTimer);
  }

  function checkAnswer() {
    const guess = $('fc-guess-input').value.trim();
    if (!guess) { $('fc-guess-input').focus(); return; }
    const correct = $('fc-back-text').textContent;
    const verdict = judgeAnswer(guess, correct);
    showFeedback(verdict, correct);
    $('fc-guess-area').classList.add('hidden');

    if (verdict === 'correct') {
      // Auto-advance as known after short delay — no button needed
      $('fc-answer-btns').classList.add('hidden');
      setTimeout(() => onAnswer('known'), 1400);
    } else if (verdict === 'wrong') {
      // Show both buttons so user can mark as known after seeing the answer
      $('fc-answer-btns').classList.remove('hidden');
      $('fc-known').disabled   = false;
      $('fc-unknown').disabled = false;
    } else {
      // Partial — user self-assesses
      $('fc-answer-btns').classList.remove('hidden');
      $('fc-known').disabled   = false;
      $('fc-unknown').disabled = false;
    }
  }

  function getCardSides(c) {
    const showTermFirst = Math.random() < 0.5;
    return {
      clue: showTermFirst ? c.front : c.back, clueLabel: showTermFirst ? 'TERM' : 'DEFINITION',
      answer: showTermFirst ? c.back : c.front, answerLabel: showTermFirst ? 'DEFINITION' : 'TERM',
      hint: showTermFirst ? 'Explain in your own words' : 'One or two words',
    };
  }

  function enterStudyArea(mode, dueOnly) {
    fcMode = mode; dueOnlyMode = !!dueOnly;
    const pool = dueOnly ? flashcards.filter(isDue) : flashcards;
    if (pool.length === 0) { if (window.showGlobalAlert) window.showGlobalAlert('No cards due for review today!', 'info'); return; }
    studyQueue = shuffle(pool); studyIndex = 0; studyResult = { known: 0, unknown: 0, skipped: 0 };
    $('fc-deck-section').classList.add('hidden'); $('fc-study').classList.remove('hidden');
    $('fc-results').classList.add('hidden'); showCard(0);
  }

  function showCard(idx) {
    if (idx >= studyQueue.length) {
      if (fcMode === 'guess') { showResults(); return; }
      $('fc-progress-bar').style.width = '100%'; showReadyPrompt(); return;
    }
    const c = studyQueue[idx];
    if (fcMode === 'guess') {
      const sides = getCardSides(c);
      $('fc-front-text').textContent = sides.clue; $('fc-back-text').textContent = sides.answer;
      $('fc-flipper').querySelector('.dm-fc-front .dm-fc-label').textContent = sides.clueLabel;
      $('fc-flipper').querySelector('.dm-fc-back .dm-fc-label').textContent  = sides.answerLabel;
      $('fc-flipper').classList.remove('flipped'); $('fc-feedback').className = 'dm-fc-feedback hidden';
      $('fc-guess-input').value = ''; $('fc-guess-input').className = 'dm-fc-guess-input';
      $('fc-guess-input').placeholder = `${sides.hint}…`;
      $('fc-known').disabled = false; $('fc-unknown').disabled = false;
      $('fc-guess-area').classList.remove('hidden'); $('fc-answer-btns').classList.add('hidden');
      $('fc-study-nav').classList.add('hidden');
      setTimeout(() => $('fc-guess-input').focus(), 50);
    } else {
      $('fc-front-text').textContent = c.front; $('fc-back-text').textContent = c.back;
      $('fc-flipper').querySelector('.dm-fc-front .dm-fc-label').textContent = 'TERM';
      $('fc-flipper').querySelector('.dm-fc-back .dm-fc-label').textContent  = 'DEFINITION';
      $('fc-flipper').classList.remove('flipped'); $('fc-feedback').className = 'dm-fc-feedback hidden';
      $('fc-guess-area').classList.add('hidden'); $('fc-answer-btns').classList.add('hidden');
      $('fc-study-nav').classList.remove('hidden'); $('fc-prev-btn').disabled = (idx === 0);
    }
    const pct = ((idx + 1) / studyQueue.length) * 100;
    $('fc-progress-bar').style.width = pct + '%';
    $('fc-progress-text').textContent = `Card ${idx + 1} of ${studyQueue.length}`;
  }

  function onAnswer(result) {
    if (fcMode === 'guess') scheduleReview(studyQueue[studyIndex].id, result);
    studyResult[result]++; studyIndex++; showCard(studyIndex);
  }

  function showResults() {
    $('fc-answer-btns').classList.add('hidden'); $('fc-guess-area').classList.add('hidden');
    $('fc-study-nav').classList.add('hidden'); $('fc-results').classList.remove('hidden');
    $('fc-progress-bar').style.width = '100%';
    const total = studyQueue.length, pct = Math.round((studyResult.known / total) * 100);
    $('fc-results-score').textContent = `${studyResult.known} / ${total} known (${pct}%)`;
    $('fc-results-sub').textContent = pct === 100 ? '🎉 Perfect!' : pct >= 70 ? '🌟 Great — review the ones you missed.' : '💪 Keep studying — you\'ll get there!';
    if (fcMode === 'guess') {
      const prev = JSON.parse(localStorage.getItem('studySyncFcStats') || '{"known":0,"unknown":0,"skipped":0}');
      prev.known += studyResult.known; prev.unknown += studyResult.unknown; prev.skipped += studyResult.skipped;
      localStorage.setItem('studySyncFcStats', JSON.stringify(prev));
    }
    updateDueBadge();
  }

  $('fc-study-btn').addEventListener('click', () => enterStudyArea('study'));
  if ($('fc-review-due-btn')) $('fc-review-due-btn').addEventListener('click', () => showShuffleAnimation('Reviewing due cards…', 'Cards you need to revisit!', () => enterStudyArea('guess', true)));
  $('fc-guessit-btn').addEventListener('click', () => showShuffleAnimation('Shuffling your deck…', 'Get ready to test yourself!', () => enterStudyArea('guess')));
  $('fc-ready-yes').addEventListener('click', () => { $('fc-ready-overlay').classList.add('hidden'); showShuffleAnimation('Shuffling your deck…', "Let's see what you know!", () => enterStudyArea('guess')); });
  $('fc-ready-later').addEventListener('click', () => {
    $('fc-ready-overlay').classList.add('hidden'); $('fc-deck-section').classList.remove('hidden');
    clearTimeout(maybeNudgeTimer);
    maybeNudgeTimer = setTimeout(() => { $('fc-ready-overlay').classList.remove('hidden'); $('fc-ready-title') && ($('fc-ready-title').textContent = 'Still up for it?'); }, 2 * 60 * 1000);
  });
  $('fc-flipper').addEventListener('click', () => { if (fcMode === 'study') $('fc-flipper').classList.toggle('flipped'); });
  document.addEventListener('keydown', e => {
    if ($('fc-study').classList.contains('hidden')) return;
    if (fcMode === 'study' && e.code === 'Space') { e.preventDefault(); $('fc-flipper').classList.toggle('flipped'); }
    if (fcMode === 'study' && e.key === 'ArrowRight') { studyIndex++; showCard(studyIndex); }
    if (fcMode === 'study' && e.key === 'ArrowLeft')  { if (studyIndex > 0) { studyIndex--; showCard(studyIndex); } }
  });
  $('fc-prev-btn').addEventListener('click', () => { if (studyIndex > 0) { studyIndex--; showCard(studyIndex); } });
  $('fc-next-btn').addEventListener('click', () => { studyIndex++; showCard(studyIndex); });
  $('fc-check-btn').addEventListener('click', checkAnswer);
  $('fc-guess-input').addEventListener('keydown', e => { if (e.key === 'Enter') checkAnswer(); });
  $('fc-skip').addEventListener('click', () => onAnswer('skipped'));
  $('fc-known').addEventListener('click',   () => onAnswer('known'));
  $('fc-unknown').addEventListener('click', () => onAnswer('unknown'));
  $('fc-restart-btn').addEventListener('click', () => enterStudyArea(fcMode));
  $('fc-back-deck-btn').addEventListener('click', () => { $('fc-study').classList.add('hidden'); $('fc-deck-section').classList.remove('hidden'); });
  $('fc-exit-study').addEventListener('click', () => { $('fc-study').classList.add('hidden'); $('fc-deck-section').classList.remove('hidden'); });

  renderDeck();
});


