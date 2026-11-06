/* Study page: one configurable session instead of separate modes.
 *
 * - Setup: presets (built-in + user-saved) or fully custom focus/break/rounds, auto-start
 *   options, alarm sounds, volume, repeat, vibration and browser notifications.
 * - Run: timestamp-based timer (accurate when the tab is throttled), survives refresh and
 *   navigating away (state lives in localStorage; phases that ended meanwhile are settled).
 * - Every finished focus round is saved as a session (synced), updates the streak and grows
 *   the tree (shown in the shared growth overlay, animated by tree_fx.js).
 */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  if (!$('st-setup')) return;

  const PREFS_KEY = 'studySyncStudyPrefs';
  const PRESETS_KEY = 'studySyncTimerPresets';
  const RUN_KEY = 'studySyncStudyRun';        // per-device: never synced
  const HIST_KEY = 'studySyncSessionHistory';
  const STREAK_KEY = 'studySyncStreak';

  /* ---------- storage helpers ---------- */
  function load(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage unavailable */ } }
  function drop(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
  const num = (v, min, max, def) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- presets & prefs ---------- */
  const BUILTIN = [
    { id: 'pomodoro', icon: '🍅', name: 'Pomodoro',    focus: 25, short: 5,  long: 15, rounds: 4, longEvery: 4 },
    { id: 'deep',     icon: '🧠', name: 'Deep work',   focus: 50, short: 10, long: 20, rounds: 3, longEvery: 3 },
    { id: 'sprint',   icon: '⚡', name: 'Short sprint', focus: 15, short: 3,  long: 10, rounds: 6, longEvery: 3 },
  ];
  const DEFAULTS = {
    preset: 'pomodoro', focus: 25, short: 5, long: 15, rounds: 4, longEvery: 4,
    autoBreak: true, autoFocus: false,
    focusSound: 'chime', breakSound: 'bell', volume: 70, repeat: 'once', vibrate: true, notify: false,
    subject: '', goal: '',
  };
  let prefs = Object.assign({}, DEFAULTS, load(PREFS_KEY, {}));
  let userPresets = load(PRESETS_KEY, []);
  if (!Array.isArray(userPresets)) userPresets = [];

  const allPresets = () => BUILTIN.concat(userPresets);

  /* ---------- sounds ---------- */
  const audioUrls = { end: $('st-audio').dataset.end, start: $('st-audio').dataset.start, start1: $('st-audio').dataset.start1 };
  let actx = null;
  function audioCtx() {
    if (!actx) { const C = window.AudioContext || window.webkitAudioContext; if (C) actx = new C(); }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(freq, start, dur, o, vol) {
    o = o || {};
    const t0 = actx.currentTime + start, osc = actx.createOscillator(), g = actx.createGain();
    osc.type = o.type || 'sine'; osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, (o.gain || 0.5) * vol), t0 + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(actx.destination);
    osc.start(t0); osc.stop(t0 + dur + 0.05);
  }
  const SOUNDS = {
    chime:    { label: 'Chime',            len: 1.6, play: v => { tone(880, 0, 1.2, {}, v); tone(1318.5, 0.18, 1.4, {}, v); } },
    bell:     { label: 'Bell',             len: 2.4, play: v => { [[1, 1], [2.76, .5], [5.4, .25], [8.93, .12]].forEach(([m, g]) => tone(440 * m, 0, 2.2 / Math.pow(m, 0.3), { gain: 0.5 * g }, v)); } },
    beep:     { label: 'Digital beep',     len: 1.2, play: v => { [0, .22, .44].forEach(t => tone(880, t, .14, { type: 'square', gain: .18 }, v)); } },
    arpeggio: { label: 'Rising arpeggio',  len: 1.5, play: v => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * .14, .5, { type: 'triangle', gain: .4 }, v)); } },
    soft:     { label: 'Soft glow',        len: 3,   play: v => { tone(392, 0, 2.8, { attack: .6, gain: .4 }, v); tone(493.9, .1, 2.8, { attack: .7, gain: .3 }, v); } },
    file_end:    { label: 'Classic alarm',  file: 'end' },
    file_start:  { label: 'Gentle start',   file: 'start' },
    file_start1: { label: 'Morning',        file: 'start1' },
    none:     { label: 'Silent' },
  };
  // returns how long (ms) the sound lasts, 0 if nothing was played
  function playSound(id, volume) {
    const s = SOUNDS[id], vol = Math.max(0, Math.min(1, volume / 100));
    if (!s || id === 'none' || vol === 0) return 0;
    if (s.file) {
      const a = new Audio(audioUrls[s.file]);
      a.volume = vol;
      a.play().catch(() => {});
      return 3000;
    }
    if (!audioCtx()) return 0;
    s.play(vol);
    return s.len * 1000;
  }

  /* ---------- alarm (sound + repeat + vibrate + notification) ---------- */
  let ringTimer = null, ringCount = 0;
  function stopRinging() {
    clearTimeout(ringTimer); ringTimer = null; ringCount = 0;
    $('st-ringing').hidden = true;
  }
  function alarm(kind, title, body) {
    const c = run.cfg;
    const soundId = kind === 'focus' ? c.focusSound : c.breakSound;
    const max = c.repeat === 'once' ? 1 : c.repeat === '3x' ? 3 : 30;
    stopRinging();
    if (c.repeat === 'until') $('st-ringing').hidden = false;
    (function ringOnce() {
      const len = playSound(soundId, c.volume);
      ringCount++;
      if (c.vibrate && navigator.vibrate) navigator.vibrate([300, 150, 300]);
      if (ringCount < max && len) ringTimer = setTimeout(ringOnce, len + 600);
      else if (c.repeat === 'until') ringTimer = setTimeout(stopRinging, 1000);
    })();
    if (c.notify && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body, icon: '/static/images/favicon.ico', tag: 'studysync-timer' }); } catch (e) { /* some browsers need a service worker */ }
    }
  }

  /* ---------- setup form ---------- */
  const F = {
    subject: $('st-subject'), goal: $('st-goal'),
    focus: $('st-focus'), short: $('st-short'), long: $('st-long'), rounds: $('st-rounds'), longEvery: $('st-longevery'),
    autoBreak: $('st-autobreak'), autoFocus: $('st-autofocus'),
    focusSound: $('st-focus-sound'), breakSound: $('st-break-sound'), volume: $('st-volume'),
    repeat: $('st-repeat'), vibrate: $('st-vibrate'), notify: $('st-notify'),
  };

  function readTimer() {
    return {
      focus: num(F.focus.value, 1, 180, 25), short: num(F.short.value, 0, 60, 5), long: num(F.long.value, 0, 90, 15),
      rounds: num(F.rounds.value, 1, 12, 4), longEvery: num(F.longEvery.value, 1, 12, 4),
    };
  }
  function fmtMins(m) { const h = Math.floor(m / 60), r = m % 60; return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`; }
  function updateSummary() {
    const t = readTimer();
    const longs = t.long > 0 ? Math.floor((t.rounds - 1) / t.longEvery) : 0;
    const shorts = t.short > 0 ? (t.rounds - 1 - longs) : 0;
    const breakMins = shorts * t.short + longs * t.long;
    const focusMins = t.focus * t.rounds;
    $('st-summary').innerHTML =
      `<strong>${t.rounds}</strong> round${t.rounds === 1 ? '' : 's'} of <strong>${t.focus} min</strong> focus = ` +
      `<strong>${fmtMins(focusMins)}</strong> studying, plus about ${fmtMins(breakMins)} of breaks ` +
      `(${fmtMins(focusMins + breakMins)} in total).`;
  }

  function renderPresets() {
    const box = $('st-presets');
    const chips = allPresets().map(p => {
      const user = !BUILTIN.some(b => b.id === p.id);
      return `<button type="button" class="st-chip" role="radio" data-id="${esc(p.id)}" aria-checked="${prefs.preset === p.id}">` +
        `${esc(p.icon || '⏱')} ${esc(p.name)} <small>${p.focus}·${p.short}</small>` +
        (user ? `<span class="st-chip-x" role="button" tabindex="0" data-del="${esc(p.id)}" aria-label="Delete preset ${esc(p.name)}">&times;</span>` : '') +
        `</button>`;
    });
    chips.push(`<button type="button" class="st-chip" role="radio" data-id="custom" aria-checked="${prefs.preset === 'custom'}">✎ Custom</button>`);
    box.innerHTML = chips.join('');
  }

  function applyTimer(t) {
    F.focus.value = t.focus; F.short.value = t.short; F.long.value = t.long;
    F.rounds.value = t.rounds; F.longEvery.value = t.longEvery;
  }
  function syncPrefsFromForm() {
    Object.assign(prefs, readTimer(), {
      subject: F.subject.value.trim(), goal: F.goal.value.trim(),
      autoBreak: F.autoBreak.checked, autoFocus: F.autoFocus.checked,
      focusSound: F.focusSound.value, breakSound: F.breakSound.value,
      volume: num(F.volume.value, 0, 100, 70), repeat: F.repeat.value,
      vibrate: F.vibrate.checked, notify: F.notify.checked,
    });
    save(PREFS_KEY, prefs);
  }
  // Editing a number by hand turns the selection into "Custom" unless it still matches a preset.
  function markCustomIfChanged() {
    const t = readTimer();
    const match = allPresets().find(p => p.id === prefs.preset);
    const same = match && ['focus', 'short', 'long', 'rounds', 'longEvery'].every(k => match[k] === t[k]);
    if (!same) { prefs.preset = 'custom'; renderPresets(); }
  }

  function initSetup() {
    const soundOpts = Object.keys(SOUNDS).map(id => `<option value="${id}">${esc(SOUNDS[id].label)}</option>`).join('');
    F.focusSound.innerHTML = soundOpts; F.breakSound.innerHTML = soundOpts;

    F.subject.value = prefs.subject; F.goal.value = prefs.goal;
    applyTimer(prefs);
    F.autoBreak.checked = !!prefs.autoBreak; F.autoFocus.checked = !!prefs.autoFocus;
    F.focusSound.value = SOUNDS[prefs.focusSound] ? prefs.focusSound : 'chime';
    F.breakSound.value = SOUNDS[prefs.breakSound] ? prefs.breakSound : 'bell';
    F.volume.value = prefs.volume; $('st-volume-out').textContent = prefs.volume;
    F.repeat.value = ['once', '3x', 'until'].includes(prefs.repeat) ? prefs.repeat : 'once';
    F.vibrate.checked = !!prefs.vibrate;
    F.notify.checked = !!prefs.notify && 'Notification' in window && Notification.permission === 'granted';
    if (!allPresets().some(p => p.id === prefs.preset) && prefs.preset !== 'custom') prefs.preset = 'custom';

    const profile = load('studySyncProfile', null);
    const subs = (profile && Array.isArray(profile.subjects)) ? profile.subjects : [];
    $('st-subject-list').innerHTML = subs.map(s => `<option value="${esc(s)}"></option>`).join('');

    renderPresets();
    updateSummary();
  }

  $('st-presets').addEventListener('click', e => {
    const del = e.target.closest('[data-del]');
    if (del) {
      e.stopPropagation();
      const p = userPresets.find(x => x.id === del.dataset.del);
      if (p && window.confirm(`Delete the preset "${p.name}"?`)) {
        userPresets = userPresets.filter(x => x.id !== p.id);
        save(PRESETS_KEY, userPresets);
        if (prefs.preset === p.id) prefs.preset = 'custom';
        renderPresets(); syncPrefsFromForm();
      }
      return;
    }
    const chip = e.target.closest('.st-chip');
    if (!chip) return;
    const id = chip.dataset.id;
    prefs.preset = id;
    const p = allPresets().find(x => x.id === id);
    if (p) applyTimer(p);
    renderPresets(); updateSummary(); syncPrefsFromForm();
  });
  $('st-presets').addEventListener('keydown', e => {
    const del = e.target.closest && e.target.closest('[data-del]');
    if (del && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); del.click(); }
  });

  ['focus', 'short', 'long', 'rounds', 'longEvery'].forEach(k => F[k].addEventListener('input', () => {
    markCustomIfChanged(); updateSummary(); syncPrefsFromForm();
  }));
  [F.subject, F.goal, F.autoBreak, F.autoFocus, F.focusSound, F.breakSound, F.repeat, F.vibrate]
    .forEach(el => el.addEventListener('change', syncPrefsFromForm));
  F.subject.addEventListener('input', syncPrefsFromForm);
  F.goal.addEventListener('input', syncPrefsFromForm);
  F.volume.addEventListener('input', () => { $('st-volume-out').textContent = F.volume.value; syncPrefsFromForm(); });

  $('st-test-focus').addEventListener('click', () => { audioCtx(); playSound(F.focusSound.value, num(F.volume.value, 0, 100, 70)); });
  $('st-test-break').addEventListener('click', () => { audioCtx(); playSound(F.breakSound.value, num(F.volume.value, 0, 100, 70)); });

  F.notify.addEventListener('change', () => {
    const hint = $('st-notify-hint');
    hint.hidden = true;
    if (F.notify.checked) {
      if (!('Notification' in window)) {
        F.notify.checked = false; hint.textContent = 'This browser does not support notifications.'; hint.hidden = false;
      } else if (Notification.permission === 'denied') {
        F.notify.checked = false; hint.textContent = 'Notifications are blocked. Allow them for this site in your browser settings.'; hint.hidden = false;
      } else if (Notification.permission !== 'granted') {
        Notification.requestPermission().then(p => {
          if (p !== 'granted') { F.notify.checked = false; hint.textContent = 'Permission was not granted, so notifications stay off.'; hint.hidden = false; }
          syncPrefsFromForm();
        });
        return;
      }
    }
    syncPrefsFromForm();
  });

  $('st-preset-save').addEventListener('click', () => {
    const name = $('st-preset-name').value.trim().slice(0, 24);
    if (!name) { $('st-preset-name').focus(); return; }
    const t = readTimer();
    const existing = userPresets.find(p => p.name.toLowerCase() === name.toLowerCase());
    if (existing) Object.assign(existing, t);
    else userPresets.push(Object.assign({ id: 'u' + Date.now(), icon: '⭐', name }, t));
    save(PRESETS_KEY, userPresets);
    prefs.preset = (existing || userPresets[userPresets.length - 1]).id;
    $('st-preset-name').value = '';
    renderPresets(); syncPrefsFromForm();
  });

  /* ---------- run state ---------- */
  let run = null, tickTimer = null;

  const LABELS = { focus: 'Focus', short: 'Short break', long: 'Long break' };
  const phaseSecs = (cfg, phase) => (phase === 'focus' ? cfg.focus : phase === 'short' ? cfg.short : cfg.long) * 60;
  const remainingSecs = () => (run.running ? Math.max(0, Math.ceil((run.endAt - Date.now()) / 1000)) : run.remaining);
  const persist = () => { if (run) save(RUN_KEY, run); };
  const mmss = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  function newRun() {
    syncPrefsFromForm();
    const t = readTimer();
    return {
      v: 1, phase: 'focus', round: 1, total: t.focus * 60, remaining: t.focus * 60, endAt: null, running: false,
      subject: F.subject.value.trim() || 'Study', goal: F.goal.value.trim(), focusDone: 0, focusMins: 0, startedAt: Date.now(),
      cfg: Object.assign({}, t, {
        autoBreak: F.autoBreak.checked, autoFocus: F.autoFocus.checked,
        focusSound: F.focusSound.value, breakSound: F.breakSound.value,
        volume: num(F.volume.value, 0, 100, 70), repeat: F.repeat.value, vibrate: F.vibrate.checked, notify: F.notify.checked,
      }),
    };
  }

  // base: timestamp the previous phase ended at (keeps timing exact instead of drifting)
  function setPhase(phase, autoRun, base) {
    run.phase = phase;
    run.total = phaseSecs(run.cfg, phase);
    run.remaining = run.total;
    run.running = !!autoRun;
    run.endAt = autoRun ? (base || Date.now()) + run.total * 1000 : null;
  }

  function recordSession(minutes) {
    const entry = { date: new Date().toISOString().split('T')[0], subject: run.subject, hours: minutes / 60, mode: 'study' };
    const hist = load(HIST_KEY, []);
    hist.push(entry);
    save(HIST_KEY, hist);
    if (window.StudySyncAPI) window.StudySyncAPI.recordSession(entry);
    // streak
    const today = new Date().toDateString(), yesterday = new Date(Date.now() - 86400000).toDateString();
    const st = load(STREAK_KEY, { last: '', count: 0 });
    let count = st.count || 0;
    if (st.last === today) { /* already counted today */ }
    else if (st.last === yesterday) count += 1;
    else count = 1;
    save(STREAK_KEY, { last: today, count });
    return hist.length;
  }

  // Ends the current phase and moves on. silent = settling time that passed while away.
  function completePhase(silent) {
    const c = run.cfg, base = run.endAt || Date.now();
    if (run.phase === 'focus') {
      const mins = run.earlyMins || c.focus; // finished early: save the time actually studied
      delete run.earlyMins;
      run.focusDone++; run.focusMins += mins;
      const sessionNum = recordSession(mins);
      if (run.round >= c.rounds) {
        run.phase = 'done'; run.running = false; run.endAt = null;
        if (!silent) { alarm('focus', 'Session complete!', `${run.focusDone} rounds · ${fmtMins(run.focusMins)} of focus`); showGrowth(sessionNum); }
        return;
      }
      const useLong = c.long > 0 && run.round % c.longEvery === 0;
      const next = useLong ? 'long' : (c.short > 0 ? 'short' : 'focus');
      if (next === 'focus') run.round++;
      setPhase(next, next === 'focus' ? c.autoFocus : c.autoBreak, base);
      if (!silent) {
        alarm('focus', 'Focus round complete', next === 'focus' ? 'Next round is ready.' : `Time for a ${LABELS[next].toLowerCase()}.`);
        showGrowth(sessionNum);
      }
    } else {
      run.round++;
      setPhase('focus', c.autoFocus, base);
      if (!silent) alarm('break', 'Break over', `Round ${run.round} of ${c.rounds} is ready.`);
    }
  }

  /* ---------- views ---------- */
  function show(which) {
    $('st-setup').hidden = which !== 'setup';
    $('st-run').hidden = which !== 'run';
    $('st-done').hidden = which !== 'done';
    window.scrollTo(0, 0);
  }

  const CIRC = 2 * Math.PI * 88;
  function treeKind() {
    return window.TreeArt ? window.TreeArt.getTreeForSubject(run ? run.subject : prefs.subject) : { kind: 'oak', name: 'Oak' };
  }
  function renderTreeCard() {
    if (!window.TreeArt) return;
    const n = load(HIST_KEY, []).length, k = n % 5, kind = treeKind();
    const sc = [0.5, 0.58, 0.68, 0.8, 0.92][k];
    $('st-tree-art').innerHTML = window.TreeArt.treeSvg(k <= 1 ? 'sprout' : kind.kind, window.TreeArt.hashStr(run.subject + ':card'));
    $('st-tree-art').firstChild.style.transform = `scale(${sc})`;
    $('st-tree-title').textContent = `Growing ${/^[aeiou]/i.test(kind.name) ? 'an' : 'a'} ${kind.name}`;
    $('st-progress-fill').style.width = (k / 5 * 100) + '%';
    $('st-tree-sub').textContent = `${k} / 5 sessions until this tree is fully grown`;
  }

  function render() {
    if (!run || !$('st-run')) return;
    const secs = remainingSecs(), c = run.cfg;
    const root = $('st-run');
    root.dataset.phase = run.phase;
    root.classList.toggle('is-running', run.running);
    $('st-run-subject').textContent = run.subject;
    $('st-run-goal').textContent = run.goal ? `Goal: ${run.goal}` : '';
    $('st-phase').textContent = LABELS[run.phase] || 'Done';
    $('st-time').textContent = mmss(secs);
    $('st-round').textContent = `Round ${Math.min(run.round, c.rounds)} of ${c.rounds}`;
    $('st-arc').style.strokeDasharray = CIRC.toFixed(2);
    $('st-arc').style.strokeDashoffset = (CIRC * (1 - (run.total ? secs / run.total : 0))).toFixed(2);

    let dots = '';
    for (let r = 1; r <= c.rounds; r++) {
      const done = r < run.round || (r === run.round && run.phase !== 'focus');
      dots += `<span class="st-dot${done ? ' done' : ''}${r === run.round && run.phase === 'focus' ? ' current' : ''}"></span>`;
    }
    $('st-dots').innerHTML = dots;

    const fresh = secs === run.total;
    $('st-toggle').textContent = run.running ? 'Pause' : (fresh ? (run.phase === 'focus' ? 'Start focus' : 'Start break') : 'Resume');
    $('st-skip').textContent = run.phase === 'focus' ? 'Finish early' : 'Skip break →';
    document.title = `${mmss(secs)} · ${LABELS[run.phase] || ''} — StudySync`;
  }

  function showDone() {
    const c = run.cfg;
    $('st-done-text').textContent =
      `${run.focusDone} focus round${run.focusDone === 1 ? '' : 's'} · ${fmtMins(run.focusMins)} of focus on ${run.subject}. ` +
      `Every round counts toward your next tree.`;
    show('done');
    stopTick();
    document.title = 'Session complete — StudySync';
  }

  /* ---------- tick ---------- */
  function stopTick() { clearInterval(tickTimer); tickTimer = null; }
  function ensureTick() { if (!tickTimer) tickTimer = setInterval(tick, 250); }
  function tick() {
    if (!$('st-run')) { stopTick(); return; } // the page was navigated away from; state stays saved
    if (!run) return;
    let changed = false;
    while (run.running && run.endAt && Date.now() >= run.endAt && run.phase !== 'done') { completePhase(false); changed = true; }
    if (changed) { persist(); renderTreeCard(); }
    if (run.phase === 'done') { persist(); showDone(); return; }
    render();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && run && $('st-run')) tick(); });

  /* ---------- actions ---------- */
  $('st-start').addEventListener('click', () => {
    audioCtx(); // unlock sound inside the user gesture
    run = newRun();
    run.running = true; run.endAt = Date.now() + run.remaining * 1000;
    persist(); show('run'); renderTreeCard(); render(); ensureTick();
  });

  $('st-toggle').addEventListener('click', () => {
    audioCtx(); stopRinging();
    if (run.running) { run.remaining = remainingSecs(); run.running = false; run.endAt = null; }
    else { run.running = true; run.endAt = Date.now() + run.remaining * 1000; }
    persist(); render();
  });

  $('st-skip').addEventListener('click', () => {
    stopRinging();
    if (run.phase === 'focus') {
      const doneSecs = run.total - remainingSecs();
      if (doneSecs < 60) { window.alert('Focus for at least a minute before finishing a round early.'); return; }
      if (!window.confirm(`Finish this round now? ${Math.round(doneSecs / 60)} min will be saved as a completed session.`)) return;
      run.earlyMins = Math.max(1, Math.round(doneSecs / 60));
    }
    run.endAt = Date.now();      // makes the phase end "now" and flows through the normal path
    run.running = true;
    tick();
  });

  $('st-end').addEventListener('click', () => {
    if (!window.confirm('End this session? Finished focus rounds are already saved.')) return;
    stopRinging(); stopTick(); drop(RUN_KEY); run = null;
    show('setup'); document.title = 'StudySync | Study';
  });

  $('st-dismiss').addEventListener('click', stopRinging);
  $('st-again').addEventListener('click', () => { stopRinging(); drop(RUN_KEY); run = null; show('setup'); document.title = 'StudySync | Study'; });

  document.addEventListener('keydown', e => {
    if (e.code !== 'Space' || !run || $('st-run').hidden) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'select', 'textarea', 'button'].includes(tag)) return;
    e.preventDefault(); $('st-toggle').click();
  });

  /* ---------- tree growth overlay ---------- */
  const STAGE_LABELS = ['The Seed', 'Sprout', 'Sapling', 'Young Tree', 'Grown Tree', 'Full Canopy'];
  const STAGE_FACTS = [
    '', 'A seed of knowledge planted. Your tree just sprouted its first leaves.',
    'Two sessions strong: your sapling is reaching for the light.',
    'Three sessions in. Roots are spreading and the trunk is thickening.',
    'One more to go. Your tree is nearly fully grown.',
    'Fully grown! Your forest just got a new tree.',
  ];
  function showGrowth(sessionNum) {
    const overlay = $('tree-growth-overlay');
    if (!overlay || !window.TreeArt) return;
    const stage = ((sessionNum - 1) % 5) + 1, kind = treeKind();
    $('tg-title').textContent = stage >= 5 ? `Session ${sessionNum} complete! Tree fully grown!` : `Session ${sessionNum} complete!`;
    $('tg-fact').textContent = '';
    $('tg-stage').textContent = '';
    const goalBox = $('tg-goal-reflect');
    goalBox.classList.toggle('hidden', !run.goal);
    $('tg-goal-text').textContent = run.goal || '';
    overlay.querySelectorAll('.tree-growth-pip').forEach(p => p.classList.toggle('done', +p.dataset.s <= stage));
    overlay.classList.remove('hidden');

    const holder = $('tg-tree-svg');
    holder.innerHTML = '';
    const seed = window.TreeArt.hashStr(run.subject + ':' + sessionNum);
    let s = 0;
    (function step() {
      const k = s <= 1 ? 'sprout' : kind.kind;
      const svg = window.TreeArt.treeSvg(k, seed);
      holder.innerHTML = svg;
      const scale = s === 0 ? 0.5 : s === 1 ? 0.8 : 0.5 + (s - 2) * 0.17;
      holder.firstChild.style.width = '200px'; holder.firstChild.style.height = '220px';
      holder.firstChild.style.transform = `scale(${Math.min(1, scale)})`;
      $('tg-stage').textContent = STAGE_LABELS[s];
      if (s < stage) { s++; setTimeout(step, 520); }
      else setTimeout(() => { $('tg-fact').textContent = STAGE_FACTS[stage] || ''; }, 300);
    })();
  }
  $('tg-continue-btn').addEventListener('click', () => {
    $('tree-growth-overlay').classList.add('hidden');
    if (run && run.phase === 'done') showDone();
  });

  /* ---------- boot ---------- */
  initSetup();
  const saved = load(RUN_KEY, null);
  if (saved && saved.v === 1 && saved.cfg) {
    run = saved;
    // settle anything that finished while the page was closed or in the background
    let settled = 0;
    while (run.running && run.endAt && Date.now() >= run.endAt && run.phase !== 'done') { completePhase(true); settled++; }
    persist();
    if (run.phase === 'done') { showDone(); }
    else {
      show('run'); renderTreeCard(); render(); ensureTick();
      if (settled) {
        const n = $('st-notice');
        n.textContent = `While you were away, ${settled} timer phase${settled === 1 ? '' : 's'} finished. Your sessions were saved.`;
        n.hidden = false;
        setTimeout(() => { n.hidden = true; }, 12000);
      }
    }
  } else {
    show('setup');
  }
})();
