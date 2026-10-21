/* custom_mode.js */
ssReady(() => {
  const CP_KEY          = 'studySyncActivePlan';
  const CUSTOM_PLAN_KEY = 'studySyncCustomPlan';
  const CUSTOM_TIMER_KEY = 'studySyncCustomTimer';
  const NOTES_KEY       = 'studySyncCustomNotes';
  const TREE_KEY        = 'studySyncTree_custom';

  function _readCustomPlan() {
    const shared = JSON.parse(localStorage.getItem(CP_KEY) || 'null');
    if (shared && shared.mode === 'custom') return shared;
    return JSON.parse(localStorage.getItem(CUSTOM_PLAN_KEY) || 'null');
  }

  /* ── Helpers ── */
  function esc(s) { return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function $(id) { return document.getElementById(id); }

  /* ── Create Plan Modal ── */
  let _selectedMins = 60;
  let _selectedGoal = 'deep-work';

  const cpOverlay  = $('cp-overlay');
  const cpError    = $('cp-error');

  function closeModal() { cpOverlay.classList.add('hidden'); }

  const existing = _readCustomPlan();
  if (!existing || !existing.subject || parseFloat(existing.hours) <= 0 || existing.mode !== 'custom') {
    cpOverlay.classList.remove('hidden');
  }

  $('cp-close').addEventListener('click', closeModal);

  document.querySelectorAll('.cp-chip:not(.cp-goal-chips .cp-chip)').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.cp-chips .cp-chip').forEach(c => c.classList.remove('cp-chip-active'));
      chip.classList.add('cp-chip-active');
      const val = chip.dataset.min;
      if (val === 'custom') {
        $('cp-custom-row').classList.remove('hidden');
        _selectedMins = null;
      } else {
        $('cp-custom-row').classList.add('hidden');
        _selectedMins = parseInt(val, 10);
      }
    });
  });

  document.querySelectorAll('.cp-goal-chips .cp-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.cp-goal-chips .cp-chip').forEach(c => c.classList.remove('cp-chip-active'));
      chip.classList.add('cp-chip-active');
      _selectedGoal = chip.dataset.goal;
    });
  });

  $('cp-start-btn').addEventListener('click', () => {
    const subject = $('cp-subject').value.trim();
    const topic   = $('cp-topic').value.trim();
    if (!subject) { cpError.classList.remove('hidden'); return; }
    cpError.classList.add('hidden');

    let mins = _selectedMins;
    if (mins === null) {
      const h = parseInt($('cp-hr').value || 1, 10);
      const m = parseInt($('cp-min').value || 0, 10);
      mins = h * 60 + m;
    }
    const hours = mins / 60;
    const plan = { mode: 'custom', subject, topic, hours, goal: _selectedGoal };
    localStorage.setItem(CP_KEY, JSON.stringify(plan));
    localStorage.setItem(CUSTOM_PLAN_KEY, JSON.stringify(plan));
    localStorage.removeItem(CUSTOM_TIMER_KEY); // fresh plan = fresh timer
    closeModal();
    initPage(plan);
  });

  /* ── Init page from existing plan ── */
  function initPage(plan) {
    const cap = plan.subject.charAt(0).toUpperCase() + plan.subject.slice(1);
    $('cm-heading').textContent = cap;
    $('cm-sub').textContent = (plan.topic ? plan.topic + ' · ' : '') + (plan.goal || 'Custom').replace('-', ' ');
    $('prog-goal').textContent = plan.hours >= 1 ? plan.hours + 'h' : (plan.hours * 60 | 0) + 'm';
    initTimer(plan.hours * 3600);
    // Restore timer state if the user navigated away while a session was running
    const wasRunning = restoreCustomTimer();
    renderRing();
    if (wasRunning) startCustomTimer();
    if (window.StudyTree) window.StudyTree.update(loadTreeSessions(), cap);
  }

  const currentPlan = _readCustomPlan();
  if (currentPlan && currentPlan.subject && currentPlan.mode === 'custom') initPage(currentPlan);

  /* ── Ring Timer ── */
  const RING_CIRC = 327;
  let totalSecs   = 3600;
  let timeLeft    = 3600;
  let timerActive = false;
  let elapsed     = 0;
  let timerInt    = null;
  let sessionsDone = 0;
  let _pausedByVisibility = false;

  function saveCustomTimer() {
    localStorage.setItem(CUSTOM_TIMER_KEY, JSON.stringify({
      timeLeft, elapsed, timerActive, totalSecs, savedAt: Date.now(),
    }));
  }

  function restoreCustomTimer() {
    try {
      const s = JSON.parse(localStorage.getItem(CUSTOM_TIMER_KEY));
      if (!s || s.totalSecs !== totalSecs) return false;
      let tl = s.timeLeft, el = s.elapsed;
      if (s.timerActive) {
        const gone = Math.floor((Date.now() - s.savedAt) / 1000);
        tl = Math.max(0, tl - gone);
        el += gone;
      }
      timeLeft = tl; elapsed = el;
      return s.timerActive && tl > 0;
    } catch (_) { return false; }
  }

  function initTimer(secs) {
    totalSecs = secs;
    timeLeft  = secs;
    elapsed   = 0;
    timerActive = false;
    clearInterval(timerInt);
    renderRing();
  }

  function fmtTime(s) {
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    if (h) return h + ':' + String(m).padStart(2,'0') + ':' + String(ss).padStart(2,'0');
    return String(m).padStart(2,'0') + ':' + String(ss).padStart(2,'0');
  }

  function renderRing() {
    $('cm-ring-time').textContent = fmtTime(timeLeft);
    const pct = totalSecs > 0 ? (timeLeft / totalSecs) : 0;
    $('cm-ring-fill').style.strokeDashoffset = RING_CIRC - pct * RING_CIRC;
    $('prog-elapsed').textContent = fmtTime(elapsed);
  }

  function onTimerFinish() {
    clearInterval(timerInt);
    timerActive = false;
    localStorage.removeItem(CUSTOM_TIMER_KEY);
    sessionsDone++;
    saveTreeSessions(sessionsDone);
    const plan = _readCustomPlan() || {};
    if (window.StudyTree) window.StudyTree.update(sessionsDone, plan.subject || 'Study');
    $('prog-tree').textContent = sessionsDone + '/5';
    const hist = JSON.parse(localStorage.getItem('studySyncSessionHistory') || '[]');
    hist.push({ date: new Date().toISOString().split('T')[0], subject: plan.subject || 'Study', hours: totalSecs / 3600, mode: 'custom' });
    localStorage.setItem('studySyncSessionHistory', JSON.stringify(hist));
    timeLeft = totalSecs; elapsed = 0;
    renderRing();
    setTimeout(() => showTreeGrowthOverlay(hist.length), 600);
  }

  const TREE_STAGE_LABELS = ['', 'Sprout', 'Sapling', 'Young Tree', 'Grown Tree', 'Full Canopy'];
  const TREE_STAGE_FACTS  = [
    '',
    'A seed of knowledge planted. Your tree just sprouted its first leaves.',
    'Two sessions strong — your sapling is reaching for the light.',
    'Halfway there. Your tree stands taller, and so does your understanding.',
    'Four sessions done — your tree is flourishing. One more push.',
    'Your tree has reached full canopy. Five sessions complete — you did it.',
  ];

  function showTreeGrowthOverlay(totalSessions) {
    const overlay = $('tree-growth-overlay');
    if (!overlay) return;
    const stage = ((totalSessions - 1) % 5) + 1;
    const titleEl = $('tg-title'), stageEl = $('tg-stage'), factEl = $('tg-fact');
    if (titleEl) titleEl.textContent = stage === 5 ? 'Tree fully grown! 🌳' : 'Session complete! 🌿';
    if (stageEl) stageEl.textContent = TREE_STAGE_LABELS[stage] || '';
    if (factEl)  factEl.textContent  = '';
    overlay.querySelectorAll('.tree-growth-pip').forEach(pip => {
      pip.classList.toggle('done', parseInt(pip.dataset.s) <= stage);
    });
    overlay.classList.remove('hidden');
    const canvas = $('tg-canvas');
    if (!canvas || !window.StudyTree) return;
    let s = 0;
    function animateStage() {
      window.StudyTree.drawToCanvas(canvas, s);
      if (stageEl) stageEl.textContent = TREE_STAGE_LABELS[s] || '';
      if (s < stage) { s++; setTimeout(animateStage, 520); }
      else if (factEl) setTimeout(() => { factEl.textContent = TREE_STAGE_FACTS[stage] || ''; }, 300);
    }
    setTimeout(animateStage, 300);
  }

  $('tg-continue-btn') && $('tg-continue-btn').addEventListener('click', () => {
    $('tree-growth-overlay').classList.add('hidden');
  });

  function startCustomTimer() {
    timerActive = true;
    timerInt = setInterval(() => {
      timeLeft--; elapsed++;
      renderRing();
      saveCustomTimer();
      if (timeLeft <= 0) onTimerFinish();
    }, 1000);
  }

  $('cm-start-btn').addEventListener('click', () => {
    if (timerActive) return;
    startCustomTimer();
  });

  $('cm-pause-btn').addEventListener('click', () => {
    timerActive = false;
    clearInterval(timerInt);
    saveCustomTimer();
  });

  $('cm-reset-btn').addEventListener('click', () => {
    timerActive = false;
    clearInterval(timerInt);
    timeLeft = totalSecs; elapsed = 0;
    localStorage.removeItem(CUSTOM_TIMER_KEY);
    renderRing();
  });

  window.addEventListener('beforeunload', () => { if (timerActive) saveCustomTimer(); });

  // Auto-pause when tab/window is hidden, resume when visible
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (timerActive) {
        timerActive = false;
        clearInterval(timerInt);
        saveCustomTimer();
        _pausedByVisibility = true;
      }
    } else if (_pausedByVisibility) {
      _pausedByVisibility = false;
      startCustomTimer();
    }
  });

  /* ── Tree sessions ── */
  function loadTreeSessions() {
    const d = JSON.parse(localStorage.getItem(TREE_KEY) || '{"date":"","count":0}');
    if (d.date !== new Date().toDateString()) return 0;
    return d.count || 0;
  }
  function saveTreeSessions(n) {
    localStorage.setItem(TREE_KEY, JSON.stringify({ date: new Date().toDateString(), count: n }));
  }
  sessionsDone = loadTreeSessions();
  $('prog-tree').textContent = sessionsDone + '/5';

  /* ── Notes ── */
  let notes = JSON.parse(localStorage.getItem(NOTES_KEY) || '[]');
  function saveNotes() { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); }

  function renderNotes() {
    const list = $('cm-notes-list');
    list.innerHTML = '';
    notes.forEach((n, i) => {
      const el = document.createElement('div');
      el.className = 'cm-note-item';
      el.innerHTML = `${esc(n)}<button class="cm-note-del" data-idx="${i}" title="Delete">✕</button>`;
      el.querySelector('.cm-note-del').addEventListener('click', () => {
        notes.splice(i, 1); saveNotes(); renderNotes();
        $('prog-notes').textContent = notes.length;
      });
      list.appendChild(el);
    });
  }

  $('cm-notes-area').addEventListener('input', function() {
    $('cm-notes-count').textContent = this.value.length + ' chars';
  });

  $('cm-save-notes-btn').addEventListener('click', () => {
    const txt = $('cm-notes-area').value.trim();
    if (!txt) return;
    notes.push(txt);
    saveNotes();
    renderNotes();
    $('cm-notes-area').value = '';
    $('cm-notes-count').textContent = '0 chars';
    $('prog-notes').textContent = notes.length;
  });

  renderNotes();
  $('prog-notes').textContent = notes.length;

  /* ── AI Questions ── */
  $('cm-gen-q-btn').addEventListener('click', async () => {
    const material = $('cm-q-material').value.trim();
    if (!material) return;
    const output = $('cm-q-output');
    output.classList.remove('hidden');
    output.textContent = 'Generating questions…';
    try {
      const resp = await fetch('/api/generate-questions/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
        body: JSON.stringify({ material })
      });
      const data = await resp.json();
      output.textContent = data.questions || data.error || 'No output.';
    } catch (e) {
      output.textContent = 'Error: ' + e.message;
    }
  });

  function getCookie(name) {
    const v = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
    return v ? v.pop() : '';
  }
});
