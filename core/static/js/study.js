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
    theme: 'forest', bg: 'theme', bgVideo: '', bgDim: 15,
    ring: 'classic', font: 'serif', tsize: 'm',
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
    if (window.SSMixer && SSMixer.isPlaying()) SSMixer.duck(Math.min(8000, 3000 + (c.repeat === 'once' ? 0 : 3000)));
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
      v: 1, id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), phase: 'focus', round: 1, total: t.focus * 60, remaining: t.focus * 60, endAt: null, running: false,
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
    const entry = { date: new Date().toISOString().split('T')[0], subject: run.subject, hours: minutes / 60, mode: 'study', run: run.id, round: run.focusDone, rounds: run.cfg.rounds };
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

  const CIRC = 2 * Math.PI * 88, CIRC_IN = 2 * Math.PI * 74, TICKS = 60;
  /* the extra parts some ring styles use: a travelling dot, tick marks, an inner session ring and a plain bar */
  let ticksBuilt = false, lastTicks = -1;
  function buildTicks() {
    const g = $('st-ticks'); if (!g || ticksBuilt) return; ticksBuilt = true;
    let h = '';
    for (let i = 0; i < TICKS; i++) {
      const a = i / TICKS * 2 * Math.PI, c = Math.cos(a), s = Math.sin(a);
      h += `<line class="st-tick" x1="${(100 + 79 * c).toFixed(2)}" y1="${(100 + 79 * s).toFixed(2)}" x2="${(100 + 94 * c).toFixed(2)}" y2="${(100 + 94 * s).toFixed(2)}"/>` +
           `<circle class="st-dotp" cx="${(100 + 88 * c).toFixed(2)}" cy="${(100 + 88 * s).toFixed(2)}" r="2.6"/>`;
    }
    g.innerHTML = h;
  }
  function drawRingExtras(frac) {
    buildTicks();
    const a = frac * 2 * Math.PI, knob = $('st-knob');
    if (knob) { knob.setAttribute('cx', (100 + 88 * Math.cos(a)).toFixed(2)); knob.setAttribute('cy', (100 + 88 * Math.sin(a)).toFixed(2)); }
    const lit = Math.ceil(frac * TICKS - 1e-6);
    if (lit !== lastTicks) {
      lastTicks = lit;
      const g = $('st-ticks');
      if (g) { const kids = g.children; for (let i = 0; i < TICKS; i++) { const on = i < lit; kids[i * 2].classList.toggle('on', on); kids[i * 2 + 1].classList.toggle('on', on); } }
    }
    // inner ring: how far through the whole session you are
    const c = run.cfg, done = (run.round - 1) + (run.phase === 'focus' ? 1 - frac : (run.phase === 'done' ? 1 : 1)), prog = Math.max(0, Math.min(1, done / Math.max(1, c.rounds)));
    const in2 = $('st-arc2'); if (in2) { in2.style.strokeDasharray = CIRC_IN.toFixed(2); in2.style.strokeDashoffset = (CIRC_IN * (1 - prog)).toFixed(2); }
    const mf = $('st-minfill'); if (mf) mf.style.width = ((1 - frac) * 100).toFixed(1) + '%';
  }
  function treeKind() {
    return window.TreeArt ? window.TreeArt.getTreeForSubject(run ? run.subject : prefs.subject) : { kind: 'oak', name: 'Oak' };
  }
  // growth of this run's tree: finished rounds plus the part of the current focus round already done
  function treeG() {
    if (!run) return 0;
    if (run.phase === 'done') return 1;
    let g = run.focusDone;
    if (run.phase === 'focus') g += Math.max(0, Math.min(1, 1 - remainingSecs() / (run.total || 1)));
    return Math.max(0, Math.min(1, g / run.cfg.rounds));
  }
  const stageLabel = g => (g >= 1 ? 'Full canopy' : g > 0.75 ? 'Mature tree' : g > 0.5 ? 'Young tree' : g > 0.28 ? 'Sapling' : g > 0.1 ? 'Sprout' : 'Seed');
  let treeMount = null, treeMountKey = '';
  function renderTreeCard() {
    if (!window.TreeGrow || !run) return;
    const kind = treeKind(), key = run.id + kind.kind, holder = $('st-tree-art');
    if (treeMountKey !== key || !holder.firstChild || !holder.firstChild.isConnected) {
      if (treeMount) treeMount.stop();
      holder.innerHTML = '';
      const cv = document.createElement('canvas'); cv.width = 110; cv.height = 150; holder.appendChild(cv);
      const seed = window.TreeArt ? window.TreeArt.hashStr(run.id) % 997 : 1;
      treeMount = window.TreeGrow.mount(cv, () => ({ kind: kind.kind, g: Math.max(0.05, treeG()), seed, detail: 0.5 }), { W: 110, H: 150 });
      treeMountKey = key;
    }
    updateTreeText();
  }
  function updateTreeText() {
    if (!run || !$('st-tree-title')) return;
    const kind = treeKind(), g = treeG(), c = run.cfg;
    $('st-tree-title').textContent = `Growing ${/^[aeiou]/i.test(kind.name) ? 'an' : 'a'} ${kind.name}`;
    $('st-progress-fill').style.width = (g * 100).toFixed(1) + '%';
    $('st-tree-sub').textContent = `${stageLabel(g)} · ${Math.min(run.focusDone, c.rounds)} of ${c.rounds} rounds done`;
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
    drawRingExtras(run.total ? secs / run.total : 0);

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
    updateTreeText();
  }

  function showDone() {
    const c = run.cfg;
    $('st-done-text').textContent =
      `${run.focusDone} focus round${run.focusDone === 1 ? '' : 's'} · ${fmtMins(run.focusMins)} of focus on ${run.subject}. ` +
      (run.focusDone >= run.cfg.rounds ? 'Your tree is fully grown and planted in your forest.' : 'Your tree keeps what it grew so far.');
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
    if (e.code !== 'Space' || !run || !$('st-run') || $('st-run').hidden) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (['input', 'select', 'textarea', 'button'].includes(tag)) return;
    e.preventDefault(); $('st-toggle').click();
  });

  /* ---------- tree growth overlay ---------- */
  const FACTS = [
    'A seed of knowledge, planted.',
    'Your tree has sprouted its first leaves.',
    'A sapling, reaching for the light.',
    'Roots are spreading and the trunk is thickening.',
    'Branches are filling out and leaves are coming in.',
    'Fully grown! Your forest just got a new tree.',
  ];
  const factFor = g => FACTS[g >= 1 ? 5 : g > 0.75 ? 4 : g > 0.5 ? 3 : g > 0.28 ? 2 : g > 0.1 ? 1 : 0];
  let overlayMount = null;
  function showGrowth() {
    const overlay = $('tree-growth-overlay');
    if (!overlay || !window.TreeGrow || !run) return;
    const rounds = run.cfg.rounds, round = Math.min(run.focusDone, rounds), gFrom = (round - 1) / rounds, gTo = round / rounds, kind = treeKind();
    $('tg-title').textContent = round >= rounds ? 'Tree fully grown! 🌳' : `Round ${round} of ${rounds} complete!`;
    $('tg-fact').textContent = '';
    $('tg-stage').textContent = stageLabel(gFrom);
    const goalBox = $('tg-goal-reflect');
    goalBox.classList.toggle('hidden', !run.goal);
    $('tg-goal-text').textContent = run.goal || '';
    $('tg-pips').innerHTML = Array.from({ length: rounds }, (_, i) => `<div class="tree-growth-pip${i < round ? ' done' : ''}" data-s="${i + 1}"></div>`).join('');
    overlay.classList.remove('hidden');
    if (overlayMount) overlayMount.stop();
    const t0 = performance.now(), dur = 2400, seed = window.TreeArt ? window.TreeArt.hashStr(run.id) % 997 : 1;
    overlayMount = window.TreeGrow.mount($('tg-canvas'), () => {
      const k = Math.max(0, Math.min(1, (performance.now() - t0 - 350) / dur)), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      return { kind: kind.kind, g: Math.max(0.05, gFrom + (gTo - gFrom) * e), seed, detail: 0.85, crown: gTo >= 1, wind: 0.6 };
    }, { W: 260, H: 300 });
    setTimeout(() => { $('tg-stage').textContent = stageLabel(gTo); }, 350 + dur * 0.55);
    setTimeout(() => { $('tg-fact').textContent = factFor(gTo); }, 350 + dur + 200);
  }
  $('tg-continue-btn').addEventListener('click', () => {
    if (overlayMount) { overlayMount.stop(); overlayMount = null; }
    $('tree-growth-overlay').classList.add('hidden');
    if (run && run.phase === 'done') showDone();
  });

  /* ---------- appearance: theme + background ---------- */
  const THEMES = [
    { id: 'forest',   name: 'Forest',   swatch: 'linear-gradient(135deg,#4E7A34,#7DB54A)' },
    { id: 'ocean',    name: 'Ocean',    swatch: 'linear-gradient(135deg,#1A9A8A,#3AC8B8)' },
    { id: 'sunset',   name: 'Sunset',   swatch: 'linear-gradient(135deg,#C8562E,#F08A5D)' },
    { id: 'lavender', name: 'Lavender', swatch: 'linear-gradient(135deg,#7455C8,#A98BE8)' },
    { id: 'rose',     name: 'Rose',     swatch: 'linear-gradient(135deg,#C8467A,#F07AA8)' },
    { id: 'slate',    name: 'Slate',    swatch: 'linear-gradient(135deg,#64748B,#E2E8F0)' },
    { id: 'glass',    name: 'Glass',    swatch: 'linear-gradient(135deg,rgba(255,255,255,.55),rgba(120,160,255,.35) 55%,rgba(190,120,255,.5))' },
    { id: 'paper',    name: 'Paper',    swatch: 'linear-gradient(135deg,#F4F1E6,#D8D3BC)' },
  ];
  const RINGS = [
    { id: 'classic',  name: 'Classic' },
    { id: 'thin',     name: 'Orbit' },
    { id: 'neon',     name: 'Neon' },
    { id: 'gradient', name: 'Gradient' },
    { id: 'ticks',    name: 'Ticks' },
    { id: 'dots',     name: 'Dots' },
    { id: 'double',   name: 'Double' },
    { id: 'minimal',  name: 'Minimal' },
  ];
  const FONTS = [
    { id: 'serif',  name: 'Classic',     css: "'Playfair Display',serif" },
    { id: 'sans',   name: 'Clean',       css: "'DM Sans',sans-serif" },
    { id: 'mono',   name: 'Mono',        css: "'Space Mono',monospace" },
    { id: 'round',  name: 'Rounded',     css: "'Nunito',sans-serif" },
    { id: 'digital', name: 'Digital',    css: "'Orbitron',sans-serif" },
    { id: 'slab',   name: 'Slab',        css: "'Roboto Slab',serif" },
    { id: 'light',  name: 'Light',       css: "'Outfit',sans-serif" },
    { id: 'hand',   name: 'Handwritten', css: "'Caveat',cursive" },
  ];
  /* tiny drawings of each ring style for the picker */
  function ringPreview(id) {
    const C = 2 * Math.PI * 15, arc = (w, extra) => `<circle cx="20" cy="20" r="15" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${(C * 0.7).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 20 20)" ${extra || ''}/>`;
    const track = w => `<circle cx="20" cy="20" r="15" fill="none" stroke="currentColor" stroke-opacity=".18" stroke-width="${w}"/>`;
    let g = '';
    if (id === 'classic') g = track(4) + arc(4);
    else if (id === 'thin') g = track(1.4) + arc(1.4) + '<circle cx="31.6" cy="30.6" r="2.6" fill="currentColor"/>';
    else if (id === 'neon') g = track(1) + arc(3.2, 'style="filter:drop-shadow(0 0 3px currentColor)"');
    else if (id === 'gradient') g = '<defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7DB54A"/><stop offset="1" stop-color="#F6C85A"/></linearGradient></defs>' + track(4) + arc(4).replace('currentColor', 'url(#rg)');
    else if (id === 'ticks' || id === 'dots') {
      for (let i = 0; i < 24; i++) { const a = i / 24 * 2 * Math.PI - Math.PI / 2, on = i < 17, x = 20 + 15 * Math.cos(a), y = 20 + 15 * Math.sin(a);
        g += id === 'dots' ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.3" fill="currentColor" opacity="${on ? 1 : .22}"/>` : `<line x1="${(20 + 12.5 * Math.cos(a)).toFixed(1)}" y1="${(20 + 12.5 * Math.sin(a)).toFixed(1)}" x2="${(20 + 17 * Math.cos(a)).toFixed(1)}" y2="${(20 + 17 * Math.sin(a)).toFixed(1)}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="${on ? 1 : .22}"/>`; }
    } else if (id === 'double') g = track(2.6) + arc(2.6) + `<circle cx="20" cy="20" r="9.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-opacity=".9" stroke-dasharray="${(2 * Math.PI * 9.5 * 0.45).toFixed(1)} 80" transform="rotate(-90 20 20)"/>`;
    else g = '<rect x="6" y="18" width="28" height="3" rx="1.5" fill="currentColor" opacity=".2"/><rect x="6" y="18" width="19" height="3" rx="1.5" fill="currentColor"/>';
    return `<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">${g}</svg>`;
  }
  const BGS = [
    { id: 'theme',    name: 'Gradient',        prev: 'linear-gradient(180deg,#14301a,#050a04)' },
    { id: 'forest',   name: 'Enchanted forest', prev: 'radial-gradient(circle at 74% 14%,rgba(255,230,160,.55),transparent 42%),linear-gradient(180deg,#0d1c2e 0%,#1e3a34 55%,#0a1c10 56%,#050d08 100%)' },
    { id: 'stars',    name: 'Starry night',    prev: 'radial-gradient(circle at 80% 20%,#E9EFFA 0 7px,rgba(200,215,255,.3) 8px,transparent 30px),linear-gradient(180deg,#02040e,#0b1636 60%,#1a2a55)' },
    { id: 'aurora',   name: 'Aurora lake',     prev: 'radial-gradient(ellipse at 30% 40%,#2fe0a0,transparent 55%),radial-gradient(ellipse at 75% 55%,#9a5cf0,transparent 55%),linear-gradient(180deg,#02050e,#0a1c30 75%,#04101c 76%)' },
    { id: 'ocean',    name: 'Sunset ocean',    prev: 'linear-gradient(180deg,#1a2260,#a85a8a 38%,#f08a6a 54%,#f6c47c 55%,#4a5a96 58%,#08224a)' },
    { id: 'campfire', name: 'Campfire',        prev: 'radial-gradient(circle at 50% 82%,#ffcf6a,#e8641e 14%,rgba(232,80,20,.35) 30%,transparent 55%),linear-gradient(180deg,#03050e,#14122a)' },
    { id: 'snow',     name: 'Cabin fireside',  prev: 'radial-gradient(circle at 70% 78%,#ffb060,rgba(255,140,60,.5) 14%,transparent 34%),linear-gradient(112deg,#8ea4a6 0,#6f8688 46%,#141a18 47%,#0c100f 100%)' },
    { id: 'city',     name: 'City at dusk',   prev: 'radial-gradient(circle at 22% 62%,rgba(255,200,120,.7) 0 3px,transparent 4px),radial-gradient(circle at 60% 58%,rgba(255,220,150,.6) 0 2px,transparent 3px),linear-gradient(180deg,#141a3e 0,#5a4a8a 34%,#e8805a 55%,#0e1224 56%,#080a16)' },
    { id: 'sakura',   name: 'Cherry blossom',  prev: 'radial-gradient(circle at 85% 8%,#f6a8c0,transparent 30%),linear-gradient(180deg,#1e1a46,#a8689a 55%,#f6b8c4)' },
    { id: 'plain',    name: 'Plain',           prev: '#0b0f0a' },
    { id: 'image',    name: 'My picture',      prev: 'linear-gradient(135deg,#444,#888)' },
  ];
  const SCENES = ['forest', 'stars', 'aurora', 'ocean', 'campfire', 'snow', 'city', 'sakura'];
  let footage = [];            // clips found in core/static/wallpapers
  let localVideoUrl = '';      // object URL of the clip this device stored (My video)
  const VDB = 'studySyncWallpapers', VSTORE = 'clips';
  function vdb() {
    return new Promise((resolve, reject) => {
      const rq = indexedDB.open(VDB, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(VSTORE);
      rq.onsuccess = () => resolve(rq.result); rq.onerror = () => reject(rq.error);
    });
  }
  async function vget() { try { const db = await vdb(); return await new Promise(res => { const r = db.transaction(VSTORE).objectStore(VSTORE).get('mine'); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); }); } catch (e) { return null; } }
  async function vput(blob) { const db = await vdb(); return new Promise((res, rej) => { const tx = db.transaction(VSTORE, 'readwrite'); tx.objectStore(VSTORE).put(blob, 'mine'); tx.oncomplete = res; tx.onerror = () => rej(tx.error); }); }
  async function vdel() { try { const db = await vdb(); await new Promise(res => { const tx = db.transaction(VSTORE, 'readwrite'); tx.objectStore(VSTORE).delete('mine'); tx.oncomplete = res; tx.onerror = res; }); } catch (e) { /* ignore */ } }
  let liveLoading = false;
  function ensureLive(cb) {
    if (window.LiveBG) { cb(); return; }
    if (liveLoading) return;
    liveLoading = true;
    const sc = document.createElement('script');
    sc.src = $('st-audio').dataset.livebg;
    sc.onload = () => { liveLoading = false; cb(); };
    sc.onerror = () => { liveLoading = false; };
    document.head.appendChild(sc);
  }
  const BG_IMAGE_KEY = 'studySyncStudyBgImage';
  const root = $('st-root');
  let bgImage = load(BG_IMAGE_KEY, '');
  if (typeof bgImage !== 'string') bgImage = '';

  function applyAppearance() {
    const theme = THEMES.some(t => t.id === prefs.theme) ? prefs.theme : 'forest';
    let bg = BGS.some(b => b.id === prefs.bg) ? prefs.bg : 'theme';
    if (bg === 'image' && !bgImage) bg = 'theme'; // nothing chosen yet
    root.dataset.theme = theme;
    root.dataset.bg = bg;
    root.dataset.ring = RINGS.some(r => r.id === prefs.ring) ? prefs.ring : 'classic';
    root.dataset.font = FONTS.some(f => f.id === prefs.font) ? prefs.font : 'serif';
    root.dataset.tsize = ['s', 'm', 'l'].includes(prefs.tsize) ? prefs.tsize : 'm';
    $('st-rings').querySelectorAll('.st-ringtile').forEach(b => b.setAttribute('aria-checked', String(b.dataset.id === root.dataset.ring)));
    $('st-fonts').querySelectorAll('.st-fonttile').forEach(b => b.setAttribute('aria-checked', String(b.dataset.id === root.dataset.font)));
    $('st-tsize').querySelectorAll('button').forEach(b => b.setAttribute('aria-checked', String(b.dataset.size === root.dataset.tsize)));
    root.style.setProperty('--dim', num(prefs.bgDim, 0, 80, 15) / 100);
    $('bgl-image').style.backgroundImage = bgImage ? `url("${bgImage}")` : '';
    $('st-dim').value = num(prefs.bgDim, 0, 80, 15);
    $('st-dim-out').textContent = $('st-dim').value;
    const videoSrc = prefs.bg === 'video' ? (prefs.bgVideo === 'local' ? localVideoUrl : prefs.bgVideo) : '';
    if (prefs.bg === 'video') bg = videoSrc ? 'video' : 'theme';
    root.dataset.bg = bg;
    const isVideo = bg === 'video', vid = $('bg-video');
    if (isVideo) {
      if (vid.getAttribute('src') !== videoSrc) { vid.src = videoSrc; }
      if (!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { const pr = vid.play(); if (pr && pr.catch) pr.catch(() => {}); }
    } else { vid.pause(); if (vid.getAttribute('src')) { vid.removeAttribute('src'); vid.load(); } }
    const isScene = SCENES.includes(bg);
    root.dataset.scene = (isScene || isVideo) ? '1' : '0';
    $('st-dim-box').hidden = !(isScene || isVideo || prefs.bg === 'image');
    $('st-bgimage-box').hidden = prefs.bg !== 'image';
    if (isScene) {
      ensureLive(() => { const cur = root.dataset.bg; if (SCENES.includes(cur) && window.LiveBG) window.LiveBG.start(cur, root.dataset.theme); });
    } else if (window.LiveBG) {
      window.LiveBG.stop();
    }
    $('st-bgremove').hidden = !bgImage;
    $('st-themes').querySelectorAll('.st-theme').forEach(b => b.setAttribute('aria-checked', String(b.dataset.id === theme)));
    $('st-bgs').querySelectorAll('.st-bgtile').forEach(b => b.setAttribute('aria-checked', String(b.dataset.id === prefs.bg)));
    $('st-footage').querySelectorAll('.st-bgtile').forEach(b => b.setAttribute('aria-checked', String(prefs.bg === 'video' && b.dataset.src === prefs.bgVideo)));
    const imgPrev = $('st-bgs').querySelector('[data-id="image"] .st-bgprev');
    if (imgPrev) imgPrev.style.backgroundImage = bgImage ? `url("${bgImage}")` : '';
  }
  const saveAppearance = () => { save(PREFS_KEY, prefs); applyAppearance(); };

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        let q = 0.82, out = c.toDataURL('image/jpeg', q);
        while (out.length > 700000 && q > 0.3) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
        out.length > 900000 ? reject(new Error('too big')) : resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
      img.src = url;
    });
  }

  function initAppearance() {
    $('st-themes').innerHTML = THEMES.map(t =>
      `<button type="button" class="st-theme" role="radio" data-id="${t.id}" aria-checked="false">` +
      `<span class="st-swatch" style="background:${t.swatch}"></span>${esc(t.name)}</button>`).join('');
    $('st-bgs').innerHTML = BGS.map(b =>
      `<button type="button" class="st-bgtile" role="radio" data-id="${b.id}" aria-checked="false">` +
      `<span class="st-bgprev" style="background:${b.prev}"></span>${esc(b.name)}</button>`).join('');
    $('st-rings').innerHTML = RINGS.map(r =>
      `<button type="button" class="st-ringtile" role="radio" data-id="${r.id}" aria-checked="false"><span class="st-ringprev">${ringPreview(r.id)}</span>${esc(r.name)}</button>`).join('');
    $('st-fonts').innerHTML = FONTS.map(f =>
      `<button type="button" class="st-fonttile" role="radio" data-id="${f.id}" aria-checked="false"><span class="st-fontprev" style="font-family:${f.css}">25:00</span>${esc(f.name)}</button>`).join('');
    applyAppearance();
    $('st-rings').addEventListener('click', e => { const b = e.target.closest('.st-ringtile'); if (b) { prefs.ring = b.dataset.id; saveAppearance(); } });
    $('st-fonts').addEventListener('click', e => { const b = e.target.closest('.st-fonttile'); if (b) { prefs.font = b.dataset.id; saveAppearance(); } });
    $('st-tsize').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { prefs.tsize = b.dataset.size; saveAppearance(); } });

    $('st-themes').addEventListener('click', e => {
      const b = e.target.closest('.st-theme'); if (!b) return;
      prefs.theme = b.dataset.id; saveAppearance();
    });
    $('st-bgs').addEventListener('click', e => {
      const b = e.target.closest('.st-bgtile'); if (!b) return;
      prefs.bg = b.dataset.id; saveAppearance();
      if (prefs.bg === 'image' && !bgImage) $('st-bgfile').click();
    });
    $('st-dim').addEventListener('input', () => { prefs.bgDim = num($('st-dim').value, 0, 80, 15); saveAppearance(); });
    $('st-bgfile').addEventListener('change', async () => {
      const f = $('st-bgfile').files && $('st-bgfile').files[0];
      $('st-bgfile').value = '';
      if (!f) return;
      const hint = $('st-bgimage-hint');
      try {
        bgImage = await fileToDataUrl(f);
        save(BG_IMAGE_KEY, bgImage);
        prefs.bg = 'image';
        hint.textContent = 'Picture saved. Use the slider to dim it if text is hard to read.';
        saveAppearance();
      } catch (err) {
        hint.textContent = err.message === 'too big' ? 'That picture is too detailed to save. Try a smaller one.' : 'That file could not be read as a picture.';
      }
    });
    $('st-bgremove').addEventListener('click', () => {
      bgImage = ''; drop(BG_IMAGE_KEY);
      if (prefs.bg === 'image') prefs.bg = 'theme';
      saveAppearance();
    });
    $('st-appearance-reset').addEventListener('click', () => { prefs.theme = 'forest'; prefs.bg = 'theme'; prefs.bgVideo = ''; prefs.bgDim = 15; prefs.ring = 'classic'; prefs.font = 'serif'; prefs.tsize = 'm'; saveAppearance(); });

    // ---- real footage ----
    function renderFootage() {
      const tiles = footage.map(f =>
        `<button type="button" class="st-bgtile" role="radio" data-src="${esc(f.url)}" aria-checked="false">` +
        `<span class="st-bgprev ${f.poster ? '' : 'st-bgprev-film'}" style="${f.poster ? `background-image:url('${esc(f.poster)}')` : ''}">${f.poster ? '' : '&#127910;'}</span>${esc(f.name)}</button>`);
      tiles.push(`<button type="button" class="st-bgtile" role="radio" data-src="local" aria-checked="false">` +
        `<span class="st-bgprev st-bgprev-film">&#128249;</span>My video${localVideoUrl ? '' : ' (add)'}` +
        (localVideoUrl ? '<span class="st-footage-x" role="button" tabindex="0" data-del="1" aria-label="Remove my video">&times;</span>' : '') + `</button>`);
      $('st-footage').innerHTML = tiles.join('');
      applyAppearance();
    }
    $('st-footage').addEventListener('click', async e => {
      const x = e.target.closest('[data-del]');
      if (x) { e.stopPropagation(); await vdel(); if (localVideoUrl) URL.revokeObjectURL(localVideoUrl); localVideoUrl = ''; if (prefs.bgVideo === 'local') { prefs.bg = 'theme'; prefs.bgVideo = ''; save(PREFS_KEY, prefs); } renderFootage(); return; }
      const b = e.target.closest('.st-bgtile'); if (!b) return;
      if (b.dataset.src === 'local' && !localVideoUrl) { $('st-videofile').click(); return; }
      prefs.bg = 'video'; prefs.bgVideo = b.dataset.src; saveAppearance();
    });
    $('st-videofile').addEventListener('change', async () => {
      const f = $('st-videofile').files && $('st-videofile').files[0]; $('st-videofile').value = '';
      const hint = $('st-footage-hint');
      if (!f) return;
      if (!/^video\//.test(f.type)) { hint.textContent = 'That file is not a video.'; return; }
      if (f.size > 250 * 1024 * 1024) { hint.textContent = 'That clip is over 250 MB. Try a shorter or smaller one.'; return; }
      try {
        await vput(f);
        if (localVideoUrl) URL.revokeObjectURL(localVideoUrl);
        localVideoUrl = URL.createObjectURL(f);
        prefs.bg = 'video'; prefs.bgVideo = 'local'; hint.textContent = 'Saved on this device. It plays silently on a loop.';
        renderFootage(); save(PREFS_KEY, prefs);
      } catch (err) { hint.textContent = 'This browser could not store that clip.'; }
    });
    document.addEventListener('visibilitychange', () => { const v = $('bg-video'); if (!v || !v.isConnected || root.dataset.bg !== 'video') return; if (document.hidden) v.pause(); else { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); } });
    (async () => {
      const blob = await vget(); if (blob) localVideoUrl = URL.createObjectURL(blob);
      try { const res = await fetch($('st-audio').dataset.wallpapers, { credentials: 'same-origin' }); if (res.ok) footage = (await res.json()).wallpapers || []; } catch (e) { /* offline: just no library clips */ }
      renderFootage();
    })();

    // drawer open/close
    const drawer = $('st-appearance'), scrim = $('st-scrim'), opener = $('st-appearance-open');
    function setOpen(open) {
      drawer.hidden = !open; scrim.hidden = !open;
      opener.setAttribute('aria-expanded', String(open));
      if (open) $('st-appearance-close').focus(); else opener.focus();
    }
    opener.addEventListener('click', () => setOpen(drawer.hidden));
    $('st-appearance-close').addEventListener('click', () => setOpen(false));
    scrim.addEventListener('click', () => setOpen(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !drawer.hidden && drawer.isConnected) setOpen(false); });
  }

  /* ---------- full screen: one button (or the F key); the controls fade away when the mouse is still ---------- */
  function initFullscreen() {
    const btn = $('st-fullscreen'), docEl = document.documentElement;
    const request = docEl.requestFullscreen || docEl.webkitRequestFullscreen, exit = document.exitFullscreen || document.webkitExitFullscreen;
    if (!btn || !request) { if (btn) btn.hidden = true; return; }
    const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
    let idleTimer = null;
    const nav = () => document.querySelector('.st-nav');
    function wake() { const n = nav(); if (n) n.classList.remove('st-idle'); clearTimeout(idleTimer); if (isFs() && $('st-appearance').hidden) idleTimer = setTimeout(() => { const n2 = nav(); if (n2 && isFs()) n2.classList.add('st-idle'); }, 3000); }
    function sync() {
      const on = isFs();
      btn.setAttribute('aria-pressed', String(on)); btn.querySelector('.st-fs-label').textContent = on ? 'Exit full screen' : 'Full screen';
      root.dataset.fs = on ? '1' : '0'; wake();
    }
    function toggle() { try { const r = isFs() ? exit.call(document) : request.call(docEl); if (r && r.catch) r.catch(() => {}); } catch (e) { /* not allowed here */ } }
    btn.addEventListener('click', toggle);
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(ev => document.addEventListener(ev, () => { if (root.isConnected) sync(); }));
    ['mousemove', 'pointerdown', 'touchstart', 'keydown'].forEach(ev => document.addEventListener(ev, () => { if (root.isConnected && isFs()) wake(); }, { passive: true }));
    document.addEventListener('keydown', e => {
      if (!root.isConnected || e.key.toLowerCase() !== 'f' || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target.tagName || '').toLowerCase(); if (['input', 'select', 'textarea'].includes(tag)) return;
      e.preventDefault(); toggle();
    });
    sync();
  }

  /* ---------- boot ---------- */
  initSetup();
  initFullscreen();
  initAppearance();
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
