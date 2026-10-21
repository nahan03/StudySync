/* focus.js — Exam Mode */
ssReady(() => {

  const CP_KEY       = 'studySyncActivePlan';
  const EXAM_PLAN_KEY = 'studySyncExamPlan';
  const EC_KEY       = 'studySyncExamCountdown';
  const TREE_KEY     = 'studySyncTree_exam';
  const POMO_KEY     = 'studySyncPomoState';

  function _readExamPlan() {
    const shared = JSON.parse(localStorage.getItem(CP_KEY) || 'null');
    if (shared && shared.mode === 'exam') return shared;
    return JSON.parse(localStorage.getItem(EXAM_PLAN_KEY) || 'null');
  }
  const $ = id => document.getElementById(id);

  /* ── Drizzle / Sea / Thunder ── */

  function createDrizzle() {
    const el = document.getElementById('em-drizzle');
    if (!el || el.children.length) return;
    // Foreground drops — larger, faster, more opaque
    for (let i = 0; i < 35; i++) {
      const d = document.createElement('div');
      d.className = 'drizzle-drop -fg';
      const w = 1.5 + Math.random() * 1.5;
      const h = 14 + Math.random() * 22;
      d.style.cssText =
        `left:${Math.random()*100}vw;` +
        `width:${w.toFixed(1)}px;` +
        `height:${h.toFixed(1)}px;` +
        `animation-delay:${(Math.random()*5).toFixed(2)}s;` +
        `animation-duration:${(0.4 + Math.random()*0.35).toFixed(2)}s;`;
      el.appendChild(d);
    }
    // Background drops — thinner, slower, more transparent
    for (let i = 0; i < 25; i++) {
      const d = document.createElement('div');
      d.className = 'drizzle-drop -bg';
      const w = 0.8 + Math.random() * 0.7;
      const h = 6 + Math.random() * 10;
      d.style.cssText =
        `left:${Math.random()*100}vw;` +
        `width:${w.toFixed(1)}px;` +
        `height:${h.toFixed(1)}px;` +
        `animation-delay:${(Math.random()*6).toFixed(2)}s;` +
        `animation-duration:${(0.7 + Math.random()*0.5).toFixed(2)}s;`;
      el.appendChild(d);
    }
  }
  // Wave-line top positions: 0 cycles → near timer (~26%), drops each cycle
  const SEA_LEVELS = ['26%', '42%', '57%', '71%', '85%'];

  function setSeaLevel(done) {
    const waves = document.getElementById('em-waves');
    if (waves) waves.style.top = SEA_LEVELS[Math.min(done, 4)];
  }

  function triggerThunder() {
    const f   = document.getElementById('em-thunder-flash');
    const box = document.getElementById('em-lightning');
    const svg = document.getElementById('em-bolt-svg');
    if (!box || !svg) return;

    // Build a jagged bolt path from (x%, 0) down to (x%±rand, 60vh)
    function boltPath(startPct, roughness, segs) {
      const vw = window.innerWidth, vh = window.innerHeight;
      const x0 = (startPct / 100) * vw;
      const x1 = x0 + (Math.random() - 0.5) * vw * 0.12;
      const endY = vh * (0.45 + Math.random() * 0.25);
      const pts  = [[x0, 0]];
      for (let i = 1; i < segs; i++) {
        const t  = i / segs;
        const jx = (Math.random() - 0.5) * roughness;
        pts.push([x0 + (x1 - x0) * t + jx, endY * t]);
      }
      pts.push([x1, endY]);
      return { d: 'M' + pts.map(p => `${p[0].toFixed(0)},${p[1].toFixed(0)}`).join('L'), mid: pts[Math.floor(segs / 2)] };
    }

    svg.innerHTML = '';
    const ns = 'http://www.w3.org/2000/svg';
    const origin = 20 + Math.random() * 60;

    // Main bolt
    const main = boltPath(origin, 55, 11);
    const mp = document.createElementNS(ns, 'path');
    mp.setAttribute('d', main.d); mp.setAttribute('class', 'em-bolt-main');
    svg.appendChild(mp);

    // 2–3 branches off the midpoint
    const branches = 2 + Math.floor(Math.random() * 2);
    for (let b = 0; b < branches; b++) {
      const br = boltPath(
        (main.mid[0] / window.innerWidth) * 100 + (Math.random() - 0.5) * 5,
        28, 6
      );
      const bp = document.createElementNS(ns, 'path');
      bp.setAttribute('d', br.d); bp.setAttribute('class', 'em-bolt-branch');
      svg.appendChild(bp);
    }

    // Flash sequence: bright → off → dimmer → fade
    const show = (o, trans) => { box.style.transition = trans; box.style.opacity = o; };
    const sf   = (o, trans) => { if (f) { f.style.transition = trans; f.style.opacity = o; } };

    show('1',   'opacity 0.04s');   sf('0.85', 'opacity 0.04s');
    setTimeout(() => { show('0','opacity 0.05s'); sf('0','opacity 0.06s'); },  70);
    setTimeout(() => { show('0.6','opacity 0.03s'); sf('0.4','opacity 0.03s'); }, 170);
    setTimeout(() => { show('0','opacity 0.3s'); sf('0','opacity 0.28s'); },      240);
  }

  /* ── helpers ── */
  function fmtTime(s) {
    const m = Math.floor(s / 60), ss = s % 60;
    return String(m).padStart(2,'0') + ':' + String(ss).padStart(2,'0');
  }

  /* ── Create Plan Modal ── */
  const cpOverlay  = $('cp-overlay');
  const cpClose    = $('cp-close');
  const cpStartBtn = $('cp-start-btn');
  const cpError    = $('cp-error');

  function openPlanModal() { cpOverlay.classList.remove('hidden'); }
  function closePlanModal() { cpOverlay.classList.add('hidden'); }

  // Show modal unless the user is mid-cycle (timer was running with time remaining)
  const _savedPomo = JSON.parse(localStorage.getItem(POMO_KEY) || 'null');
  const _savedMax  = (_savedPomo && _savedPomo.maxCycles) || 4;
  const _hasMidSession = _savedPomo
    && _savedPomo.cyclesDone < _savedMax
    && (_savedPomo.timeLeft > 0 || _savedPomo.isBreak);
  if (!_hasMidSession) openPlanModal();

  if ($('em-change-btn')) $('em-change-btn').addEventListener('click', openPlanModal);

  // Preset card selection
  document.querySelectorAll('.cp-preset').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.cp-preset').forEach(c => c.classList.remove('cp-preset-active'));
      card.classList.add('cp-preset-active');
      const isCustom = !card.dataset.focus;
      const ct = $('cp-custom-timer');
      if (ct) ct.classList.toggle('hidden', !isCustom);
    });
  });

  if (cpStartBtn) {
    cpStartBtn.addEventListener('click', () => {
      const subject  = $('cp-subject').value.trim();
      const examDate = $('cp-exam-date') ? $('cp-exam-date').value : '';
      const examTime = $('cp-exam-time') ? ($('cp-exam-time').value || '09:00') : '09:00';
      if (!subject) { cpError.classList.remove('hidden'); return; }
      cpError.classList.add('hidden');

      const activePreset = document.querySelector('.cp-preset.cp-preset-active');
      let focusMins, breakMins, maxCycles;
      if (activePreset && activePreset.dataset.focus) {
        focusMins = parseInt(activePreset.dataset.focus, 10);
        breakMins = parseInt(activePreset.dataset.break, 10);
        maxCycles = parseInt(activePreset.dataset.cycles, 10);
      } else {
        // Custom
        focusMins = Math.max(5,  parseInt($('cp-focus-min') ? $('cp-focus-min').value : 25, 10) || 25);
        breakMins = Math.max(1,  parseInt($('cp-break-min') ? $('cp-break-min').value : 5,  10) || 5);
        maxCycles = Math.max(1,  parseInt($('cp-cycles-num') ? $('cp-cycles-num').value : 4, 10) || 4);
      }
      const plan = { mode: 'exam', subject, deadline: examDate, focusMins, breakMins, maxCycles };
      localStorage.setItem(CP_KEY, JSON.stringify(plan));
      localStorage.setItem(EXAM_PLAN_KEY, JSON.stringify(plan));

      // Also save exam countdown with time
      if (examDate) {
        localStorage.setItem(EC_KEY, JSON.stringify({ subject, date: examDate, time: examTime }));
      }

      closePlanModal();
      initTimer();       // reset timer fresh for the new plan
      examSessions = 0;
      saveTreeSessions(0);
      applyPlan(plan);
      showOnlyStart();   // always start with just the Start button
      initCountdown();
    });
  }

  /* ── Apply plan to page (display only — does not reset timer state) ── */
  function applyPlan(plan) {
    if (!plan) return;
    const cap = plan.subject.charAt(0).toUpperCase() + plan.subject.slice(1);
    if ($('em-heading')) $('em-heading').textContent = cap;
    const sub = $('em-subject-line');
    if (sub) {
      const parts = [plan.subject];
      if (plan.deadline) parts.push('Exam ' + plan.deadline);
      sub.textContent = parts.join(' · ');
      sub.classList.remove('hidden');
    }
    // Update tree (display only)
    const sessions = loadTreeSessions();
    if (window.StudyTree) {
      if (window.StudyTree.setMaxSessions) window.StudyTree.setMaxSessions(plan.maxCycles || 4);
      window.StudyTree.update(sessions, plan.subject);
    }
  }

  /* ── Focus Timer (Pomodoro) ── */
  const RING_CIRC = 427.3;
  let FOCUS_SECS  = 25 * 60;
  let BREAK_SECS  = 5 * 60;
  let MAX_CYCLES  = 4;

  // Apply on load
  const activePlan = _readExamPlan();
  const examPlan = activePlan && activePlan.mode === 'exam' ? activePlan : null;
  if (examPlan) applyPlan(examPlan);

  function applyTimerConfig(plan) {
    FOCUS_SECS = ((plan && plan.focusMins) || 25) * 60;
    BREAK_SECS = ((plan && plan.breakMins) || 5) * 60;
    MAX_CYCLES = (plan && plan.maxCycles)  || 4;
  }
  applyTimerConfig(examPlan);

  let timeLeft    = FOCUS_SECS;
  let timerActive = false;
  let timerInt    = null;
  let isBreak     = false;
  let cyclesDone  = 0;
  let _pausedByVisibility = false;

  function savePomoState() {
    localStorage.setItem(POMO_KEY, JSON.stringify({
      timeLeft, timerActive, isBreak, cyclesDone,
      maxCycles: MAX_CYCLES, focusSecs: FOCUS_SECS, breakSecs: BREAK_SECS,
      savedAt: Date.now(),
    }));
  }

  function restorePomoState() {
    try {
      const s = JSON.parse(localStorage.getItem(POMO_KEY));
      if (!s) return false;

      // Restore timer config from saved state
      if (s.maxCycles)  MAX_CYCLES  = s.maxCycles;
      if (s.focusSecs)  FOCUS_SECS  = s.focusSecs;
      if (s.breakSecs)  BREAK_SECS  = s.breakSecs;

      let tl = s.timeLeft;
      let br = s.isBreak;
      let cd = s.cyclesDone;

      if (s.timerActive) {
        // Simulate all phases that elapsed while the user was away
        let elapsed = Math.floor((Date.now() - s.savedAt) / 1000);
        while (elapsed > 0 && cd < MAX_CYCLES) {
          if (elapsed < tl) {
            tl -= elapsed;
            elapsed = 0;
          } else {
            elapsed -= tl;
            if (!br) { cd++; br = true; tl = BREAK_SECS; }
            else      { br = false;      tl = FOCUS_SECS; }
          }
        }
      }

      isBreak    = br;
      cyclesDone = cd;
      timeLeft   = cd >= MAX_CYCLES ? 0 : tl;

      if (cd >= MAX_CYCLES) {
        setChangeBtnState(false);
        return false;
      }
      return s.timerActive;
    } catch (_) { return false; }
  }

  function initTimer() {
    applyTimerConfig(_readExamPlan());
    timeLeft    = FOCUS_SECS;
    timerActive = false;
    isBreak     = false;
    cyclesDone  = 0;
    clearInterval(timerInt);
    localStorage.removeItem(POMO_KEY);
    renderTimer();
    updatePips();
  }

  function renderTimer() {
    const el = $('focus-display');
    if (el) el.textContent = fmtTime(timeLeft);
    const modeEl = $('em-ring-mode');
    if (modeEl) modeEl.textContent = isBreak ? 'break' : 'focus';
    // Ring: count down from current phase duration
    const phaseDur = isBreak ? BREAK_SECS : FOCUS_SECS;
    const pct = timeLeft / phaseDur;
    const ring = $('em-ring-fill');
    if (ring) ring.style.strokeDashoffset = RING_CIRC - pct * RING_CIRC;
  }

  function updatePips() {
    const pipsEl = document.querySelector('.em-pips');
    if (pipsEl) {
      // Rebuild pips if count changed
      if (pipsEl.children.length !== MAX_CYCLES) {
        pipsEl.innerHTML = '';
        for (let i = 1; i <= MAX_CYCLES; i++) {
          const pip = document.createElement('span');
          pip.className = 'em-pip';
          pip.id = 'em-pip-' + i;
          pipsEl.appendChild(pip);
        }
      }
      for (let i = 1; i <= MAX_CYCLES; i++) {
        const pip = $('em-pip-' + i);
        if (pip) pip.classList.toggle('done', i <= cyclesDone);
      }
    }
    const ct = $('em-cycle-text');
    if (ct) ct.textContent = cyclesDone >= MAX_CYCLES
      ? '🎉 All cycles complete!'
      : 'Cycle ' + (cyclesDone + 1) + ' of ' + MAX_CYCLES;
  }

  function onPhaseEnd() {
    clearInterval(timerInt);
    timerActive = false;

    if (!isBreak) {
      // Focus done → count session
      cyclesDone++;
      updatePips();
      recordSession();
      // Sea drops + thunder on every session complete
      setSeaLevel(cyclesDone);
      setTimeout(triggerThunder, 350);
      if (window.showGlobalAlert) window.showGlobalAlert('Cycle complete! Take a break. ☕', 'success');
      // Switch to break
      if (cyclesDone < MAX_CYCLES) {
        isBreak = true;
        timeLeft = BREAK_SECS;
        renderTimer();
        setTimeout(() => {
          if (!timerActive) autoStart(); // auto-start break
        }, 800);
      } else {
        // All cycles done — unlock change session
        timeLeft = 0; renderTimer();
        examSessionStarted = false;
        setChangeBtnState(false);
        showOnlyStart();
        localStorage.removeItem(POMO_KEY); // clear so next visit shows modal
        if (window.showGlobalAlert) window.showGlobalAlert(`All ${MAX_CYCLES} cycles complete! Great work. 🌲`, 'success');
      }
    } else {
      // Break done → back to focus
      isBreak = false;
      timeLeft = FOCUS_SECS;
      renderTimer();
      showOnlyStart();
      if (window.showGlobalAlert) window.showGlobalAlert('Break over — back to focus! 📚', 'info');
    }
  }

  const EXAM_LOCK_KEY = 'studySyncExamLock';
  let examSessionStarted = !!localStorage.getItem(EXAM_LOCK_KEY);

  function setChangeBtnState(locked) {
    examSessionStarted = locked;
    if (locked) {
      localStorage.setItem(EXAM_LOCK_KEY, '1');
    } else {
      localStorage.removeItem(EXAM_LOCK_KEY);
    }
    const btn = $('em-change-btn');
    if (!btn) return;
    btn.disabled = locked;
    btn.title = locked ? 'Complete all cycles before changing session' : '';
  }

  // Apply lock state on load
  setChangeBtnState(examSessionStarted);

  // Controls
  const startBtn = $('focus-start');
  const pauseBtn = $('focus-pause');
  const resetBtn = $('focus-reset');

  function showOnlyStart() {
    if (startBtn) startBtn.classList.remove('em-btn-hidden');
    if (pauseBtn) pauseBtn.classList.add('em-btn-hidden');
    if (resetBtn) resetBtn.classList.add('em-btn-hidden');
  }

  function showRunningControls() {
    if (startBtn) startBtn.classList.add('em-btn-hidden');
    if (pauseBtn) pauseBtn.classList.remove('em-btn-hidden');
    if (resetBtn) resetBtn.classList.remove('em-btn-hidden');
  }

  function autoStart() {
    timerActive = true;
    setChangeBtnState(true);
    showRunningControls();
    savePomoState();
    timerInt = setInterval(tick, 1000);
  }

  function tick() {
    if (timeLeft <= 0) { onPhaseEnd(); return; }
    timeLeft--;
    renderTimer();
    savePomoState();
  }

  if (startBtn) startBtn.addEventListener('click', () => {
    if (timerActive) return;
    timerActive = true;
    setChangeBtnState(true);
    showRunningControls();
    timerInt = setInterval(tick, 1000);
  });

  if (pauseBtn) pauseBtn.addEventListener('click', () => {
    if (timerActive) {
      clearInterval(timerInt);
      timerActive = false;
      savePomoState();
      pauseBtn.textContent = '▶ Resume';
      if (window.StudyMotivation) window.StudyMotivation.show();
    } else {
      timerActive = true;
      savePomoState();
      timerInt = setInterval(tick, 1000);
      pauseBtn.textContent = '⏸ Pause';
      if (window.StudyMotivation) window.StudyMotivation.hide();
    }
  });

  if (resetBtn) resetBtn.addEventListener('click', () => {
    clearInterval(timerInt);
    timerActive = false;
    examSessionStarted = false;
    cyclesDone = 0;
    isBreak = false;
    timeLeft = FOCUS_SECS;
    setChangeBtnState(false);
    localStorage.removeItem(POMO_KEY);
    updatePips();
    if (pauseBtn) pauseBtn.textContent = '⏸ Pause';
    renderTimer();
    showOnlyStart();
    setSeaLevel(0); // sea rises back to full on reset
    // Reset tree back to 0
    examSessions = 0;
    saveTreeSessions(0);
    const _rPlan = _readExamPlan() || {};
    if (window.StudyTree) window.StudyTree.update(0, _rPlan.subject || 'Study');
  });

  // Restore Pomodoro state from previous visit
  const pomoWasRunning = restorePomoState();
  renderTimer();
  updatePips();

  // Init atmosphere based on restored state
  createDrizzle();
  setSeaLevel(cyclesDone);

  // Set initial button visibility based on restored state
  const _cycleInProgress = cyclesDone < MAX_CYCLES && (cyclesDone > 0 || timeLeft < FOCUS_SECS || isBreak);
  if (pomoWasRunning || _cycleInProgress) {
    showRunningControls();
  } else {
    showOnlyStart();
  }

  if (pomoWasRunning) autoStart();

  // Save exact state when user leaves the page
  window.addEventListener('beforeunload', () => {
    if (timerActive) savePomoState();
  });

  // Auto-pause when tab/window is hidden, resume when visible
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (timerActive) {
        clearInterval(timerInt);
        timerActive = false;
        savePomoState();
        pauseBtn.textContent = '▶ Resume';
        if (window.StudyMotivation) window.StudyMotivation.show();
        _pausedByVisibility = true;
      }
    } else if (_pausedByVisibility) {
      _pausedByVisibility = false;
      timerActive = true;
      savePomoState();
      timerInt = setInterval(tick, 1000);
      pauseBtn.textContent = '⏸ Pause';
      if (window.StudyMotivation) window.StudyMotivation.hide();
    }
  });

  /* ── Tree session tracking ── */
  function loadTreeSessions() {
    const d = JSON.parse(localStorage.getItem(TREE_KEY) || '{"date":"","count":0}');
    if (d.date !== new Date().toDateString()) return 0;
    return d.count || 0;
  }
  function saveTreeSessions(n) {
    localStorage.setItem(TREE_KEY, JSON.stringify({ date: new Date().toDateString(), count: n }));
  }

  let examSessions = loadTreeSessions();

  function recordSession() {
    examSessions++;
    saveTreeSessions(examSessions);
    const plan = _readExamPlan() || {};
    if (window.StudyTree) {
      window.StudyTree.setMaxSessions(plan.maxCycles || 4);
      window.StudyTree.update(examSessions, plan.subject || 'Study');
    }
    const hist = JSON.parse(localStorage.getItem('studySyncSessionHistory') || '[]');
    hist.push({ date: new Date().toISOString().split('T')[0], subject: plan.subject || 'Study', hours: FOCUS_SECS / 3600, mode: 'exam' });
    localStorage.setItem('studySyncSessionHistory', JSON.stringify(hist));
    setTimeout(() => showTreeGrowthOverlay(hist.length), 600);
  }

  function _treeStageLabels(max) {
    const labels = [''];
    for (let i = 1; i < max; i++) labels.push(`Stage ${i}/${max}`);
    labels.push('Full Canopy');
    return labels;
  }
  function _treeStageFacts(max) {
    const facts = [''];
    for (let i = 1; i <= max; i++) {
      if (i === 1) facts.push('First cycle done — your tree just sprouted.');
      else if (i < max) facts.push(`Cycle ${i}/${max} complete — your tree is growing!`);
      else facts.push('Your tree has reached full canopy. All cycles complete — you did it!');
    }
    return facts;
  }

  function showTreeGrowthOverlay(totalSessions) {
    const overlay = document.getElementById('tree-growth-overlay');
    if (!overlay) return;
    const plan = _readExamPlan() || {};
    const max = plan.maxCycles || 4;
    const labels = _treeStageLabels(max);
    const facts  = _treeStageFacts(max);
    const stage = ((totalSessions - 1) % max) + 1;
    const titleEl = document.getElementById('tg-title');
    const stageEl = document.getElementById('tg-stage');
    const factEl  = document.getElementById('tg-fact');
    if (titleEl) titleEl.textContent = stage === max ? 'Tree fully grown! 🌳' : `Cycle complete! 🌿`;
    if (stageEl) stageEl.textContent = labels[stage] || '';
    if (factEl)  factEl.textContent  = '';
    const pipsContainer = overlay.querySelector('.tree-growth-progress');
    if (pipsContainer) {
      pipsContainer.innerHTML = '';
      for (let i = 1; i <= max; i++) {
        const pip = document.createElement('div');
        pip.className = 'tree-growth-pip';
        pip.dataset.s = i;
        if (i <= stage) pip.classList.add('done');
        pipsContainer.appendChild(pip);
      }
    }
    overlay.classList.remove('hidden');
    const canvas = document.getElementById('tg-canvas');
    if (!canvas || !window.StudyTree) return;
    let s = 0;
    function animateStage() {
      window.StudyTree.drawToCanvas(canvas, s);
      if (stageEl) stageEl.textContent = labels[s] || '';
      if (s < stage) { s++; setTimeout(animateStage, 520); }
      else if (factEl) setTimeout(() => { factEl.textContent = facts[stage] || ''; }, 300);
    }
    setTimeout(animateStage, 300);
  }

  document.getElementById('tg-continue-btn') && document.getElementById('tg-continue-btn').addEventListener('click', () => {
    const overlay = document.getElementById('tree-growth-overlay');
    if (overlay) overlay.classList.add('hidden');
  });

  /* ── Exam Countdown ── */
  function initCountdown() {
    const data = JSON.parse(localStorage.getItem(EC_KEY) || 'null');
    if (!data || !data.date) { showSetup(); return; }
    renderCountdown(data);
  }

  function showSetup() {
    const setup = $('ec-setup');
    const disp  = $('ec-display');
    if (setup) setup.style.display = 'flex';
    if (disp)  disp.classList.add('hidden');
  }

  let _cdInterval = null;

  function renderCountdown(data) {
    const setup = $('ec-setup');
    const disp  = $('ec-display');
    if (setup) setup.style.display = 'none';
    if (disp)  disp.classList.remove('hidden');

    if ($('ec-subject-display')) $('ec-subject-display').textContent = data.subject || '';

    // Build target from date + time (default 09:00 if no time saved)
    const [tH, tM] = (data.time || '09:00').split(':').map(Number);
    const targetDate = new Date(data.date);
    targetDate.setHours(tH, tM, 0, 0);

    // Show date + time on the label
    if ($('ec-date-line')) {
      const dateStr = targetDate.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
      const timeStr = targetDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      $('ec-date-line').textContent = `${dateStr} at ${timeStr}`;
    }

    function pad(n) { return String(n).padStart(2, '0'); }

    function tick() {
      const target     = new Date(targetDate);
      const msLeft     = Math.max(0, target - new Date());
      const total      = Math.floor(msLeft / 1000);
      const days       = Math.floor(total / 86400);
      const hours      = Math.floor((total % 86400) / 3600);
      const mins       = Math.floor((total % 3600) / 60);
      const secs       = total % 60;
      const totalHours = Math.floor(total / 3600);

      // Show DAYS box only when 2+ full days remain; otherwise show total hours
      const showDays = totalHours >= 48;
      const daysBox  = $('ec-clock-days-box');
      if (daysBox) daysBox.style.display = showDays ? '' : 'none';

      if ($('ec-clock-days'))  $('ec-clock-days').textContent  = days;
      if ($('ec-clock-hours')) $('ec-clock-hours').textContent = pad(showDays ? hours : totalHours);
      if ($('ec-clock-mins'))  $('ec-clock-mins').textContent  = pad(mins);
      if ($('ec-clock-secs'))  $('ec-clock-secs').textContent  = pad(secs);

      ['ec-clock-days','ec-clock-hours','ec-clock-mins','ec-clock-secs'].forEach(id => {
        const el = $(id); if (el) el.style.color = '#3ac8b8';
      });

      const msgEl = $('ec-message');
      if (msgEl) {
        if (msLeft <= 0)          msgEl.textContent = 'The exam has passed.';
        else if (totalHours < 1)  msgEl.textContent = 'Exam in less than an hour — stay focused! 🔥';
        else if (totalHours < 12) msgEl.textContent = 'Exam TODAY — you\'ve got this! 💪';
        else if (totalHours < 48) msgEl.textContent = 'Exam very soon — do your final revision now! 🔥';
        else if (days <= 7)       msgEl.textContent = 'One week to go — keep the momentum.';
        else if (days <= 14)      msgEl.textContent = 'Two weeks out — build steady habits.';
        else                      msgEl.textContent = 'Plenty of time — plant the seeds now. 🌱';
      }

      if (msLeft <= 0) { clearInterval(_cdInterval); _cdInterval = null; }
    }

    if (_cdInterval) clearInterval(_cdInterval);
    tick();
    _cdInterval = setInterval(tick, 1000);
  }

  // Countdown set button
  const ecSetBtn = $('ec-set-btn');
  if (ecSetBtn) {
    ecSetBtn.addEventListener('click', () => {
      const subject = $('ec-subject').value.trim();
      const date    = $('ec-date').value;
      if (!subject || !date) { $('ec-error').classList.remove('hidden'); return; }
      $('ec-error').classList.add('hidden');
      const time = ($('ec-time') && $('ec-time').value) || '09:00';
      const data = { subject, date, time };
      localStorage.setItem(EC_KEY, JSON.stringify(data));
      renderCountdown(data);
    });
  }

  const ecEditBtn = $('ec-edit-btn');
  if (ecEditBtn) {
    ecEditBtn.addEventListener('click', () => showSetup());
  }

  // Init on load
  initCountdown();

  // Pre-fill countdown fields from saved countdown data or plan
  const _savedCd = JSON.parse(localStorage.getItem(EC_KEY) || 'null');
  if (_savedCd) {
    if ($('ec-date'))    $('ec-date').value    = _savedCd.date    || '';
    if ($('ec-time'))    $('ec-time').value    = _savedCd.time    || '09:00';
    if ($('ec-subject')) $('ec-subject').value = _savedCd.subject || '';
  } else if (examPlan && examPlan.deadline) {
    if ($('ec-date'))    $('ec-date').value    = examPlan.deadline;
    if ($('ec-subject')) $('ec-subject').value = examPlan.subject || '';
  }

});
