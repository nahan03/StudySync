/* ═══════════════════════════════════════════════════
   STUDY SOUND MIXER — music_player.js v12
   Everything is generated live with the Web Audio API (no files, no links, no ads, works offline):
   rain, thunder, wind, fire, ocean, forest birds, night crickets, café, three kinds of noise,
   a lo-fi keys loop and an ambient pad. Each has its own volume; mixes can be saved.
   ═══════════════════════════════════════════════════ */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const bar = $('gmp-bar'), panel = $('gmp-panel');
  if (!bar || !panel) return;

  const KEY = 'studySyncMixer';
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  /* ───────────── engine ───────────── */
  let ctx = null, master = null, analyser = null, revIn = null, bufs = null, running = false;

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 24; comp.ratio.value = 5; comp.attack.value = 0.01; comp.release.value = 0.25;
    analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
    master.connect(comp); comp.connect(analyser); analyser.connect(ctx.destination);
    bufs = makeNoise();
    // a shared room reverb: exponentially decaying stereo noise
    const len = Math.floor(ctx.sampleRate * 2.8), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    revIn = ctx.createGain(); revIn.gain.value = 0.7;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3800;
    revIn.connect(conv); conv.connect(lp); lp.connect(master);
    return true;
  }

  function makeNoise() {
    const n = Math.floor(ctx.sampleRate * 8), out = {};
    ['white', 'pink', 'brown'].forEach(kind => {
      const b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < n; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'white') d[i] = w * 0.5;
        else if (kind === 'pink') { b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898; d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926; }
        else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.4; }
      }
      out[kind] = b;
    });
    return out;
  }

  /* a looping noise source starting at a random point, so two of them never line up */
  function noise(h, kind) { const s = ctx.createBufferSource(); s.buffer = bufs[kind]; s.loop = true; s.start(0, Math.random() * 7); h.src.push(s); return s; }
  function filt(type, f, q) { const n = ctx.createBiquadFilter(); n.type = type; n.frequency.value = f; if (q != null) n.Q.value = q; return n; }
  function gain(v) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function pan(v) { if (!ctx.createStereoPanner) return gain(1); const p = ctx.createStereoPanner(); p.pan.value = v; return p; }
  function chain(...nodes) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; }
  function lfo(h, rate, depth, target) { const o = ctx.createOscillator(); o.frequency.value = rate; const g = gain(depth); o.connect(g); g.connect(target); o.start(); h.src.push(o); return o; }
  function every(h, fn, min, max) { let id; (function loop() { id = setTimeout(() => { if (running && ctx.state === 'running') fn(); loop(); }, rand(min, max)); })(); h.stop.push(() => clearTimeout(id)); }
  /* send a node to the channel's dry output and, optionally, its reverb */
  function emit(ch, node, wet) { node.connect(ch.out); if (wet) { const g = gain(wet); node.connect(g); g.connect(ch.send); } }
  /* one short filtered noise burst: a raindrop, a crackle, a hi-hat */
  function burst(ch, o) {
    const t = o.t || ctx.currentTime, s = ctx.createBufferSource(); s.buffer = bufs.white;
    const f = filt(o.type || 'bandpass', o.f, o.q || 1), g = gain(0), p = pan(o.pan || 0), att = o.att || 0.002;
    s.connect(f); f.connect(g); g.connect(p);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.g, t + att); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    s.start(t, Math.random() * 7, o.dur + 0.05); s.stop(t + o.dur + 0.06);
    emit(ch, p, o.wet);
  }
  function tone(ch, o) { // one decaying sine partial: bird note, glass clink, piano tine
    const t = o.t || ctx.currentTime, osc = ctx.createOscillator(), g = gain(0), p = pan(o.pan || 0);
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f, t); if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(o.g, t + (o.att || 0.01)); g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g); g.connect(p); osc.start(t); osc.stop(t + o.dur + 0.05); emit(ch, p, o.wet);
  }
  /* wide stereo bed: two independent noise sources panned apart */
  function bed(ch, h, kind, fn, level) {
    [-0.85, 0.85].forEach(pv => { const s = noise(h, kind), end = fn(s); const p = pan(pv), g = gain(level); end.connect(g); g.connect(p); emit(ch, p); });
  }

  /* ───────────── the sounds ───────────── */
  const SOUNDS = [
    { id: 'rain', name: 'Rain', icon: '🌧️', make(ch, h) {
      bed(ch, h, 'pink', s => chain(s, filt('highpass', 500), filt('lowpass', 9500)), 0.55);
      bed(ch, h, 'brown', s => chain(s, filt('lowpass', 420)), 0.18);
      every(h, () => burst(ch, { f: rand(2200, 7000), q: rand(1, 4), g: rand(0.04, 0.16), dur: rand(0.012, 0.04), pan: rand(-1, 1) }), 18, 70);
    } },
    { id: 'thunder', name: 'Thunder', icon: '⛈️', make(ch, h) {
      const rumble = () => {
        const t = ctx.currentTime + 0.02, dur = rand(3.5, 6.5), s = ctx.createBufferSource(); s.buffer = bufs.brown;
        const f = filt('lowpass', 260), g = gain(0), p = pan(rand(-0.6, 0.6)); s.connect(f); f.connect(g); g.connect(p);
        f.frequency.setValueAtTime(380, t); f.frequency.exponentialRampToValueAtTime(70, t + dur);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(rand(0.7, 1.1), t + rand(0.15, 0.6)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        s.start(t, Math.random() * 7, dur + 0.1); s.stop(t + dur + 0.2); emit(ch, p, 0.5);
        if (Math.random() < 0.7) burst(ch, { t, f: 900, q: 0.6, g: 0.5, dur: 0.35, att: 0.004, wet: 0.7 }); // the crack
      };
      every(h, rumble, 9000, 26000);
      setTimeout(() => { if (running && ctx.state === 'running') rumble(); }, 700);
    } },
    { id: 'wind', name: 'Wind', icon: '🍃', make(ch, h) {
      bed(ch, h, 'brown', s => {
        const bp = filt('bandpass', 420, 0.8); lfo(h, rand(0.05, 0.09), 260, bp.frequency); lfo(h, rand(0.11, 0.19), 140, bp.frequency);
        const g = gain(0.8); lfo(h, rand(0.06, 0.1), 0.3, g.gain); return chain(s, bp, g);
      }, 0.6);
      bed(ch, h, 'pink', s => chain(s, filt('bandpass', 1500, 2)), 0.05);
    } },
    { id: 'fire', name: 'Fireplace', icon: '🔥', make(ch, h) {
      bed(ch, h, 'brown', s => chain(s, filt('lowpass', 380)), 0.42);
      bed(ch, h, 'pink', s => chain(s, filt('bandpass', 1100, 0.7)), 0.035);
      every(h, () => { const n = Math.random() < 0.3 ? Math.floor(rand(3, 7)) : 1, base = ctx.currentTime; for (let i = 0; i < n; i++) burst(ch, { t: base + i * rand(0.02, 0.08), f: rand(700, 5200), q: rand(0.8, 3), g: rand(0.08, 0.4), dur: rand(0.005, 0.03), pan: rand(-0.7, 0.7), wet: 0.12 }); }, 60, 520);
      every(h, () => burst(ch, { f: rand(300, 900), q: 1.2, g: rand(0.4, 0.8), dur: rand(0.04, 0.09), pan: rand(-0.5, 0.5), wet: 0.2 }), 2500, 7000); // the odd loud pop
    } },
    { id: 'ocean', name: 'Ocean', icon: '🌊', make(ch, h) {
      const swell = gain(0.05), f = filt('lowpass', 500);
      const s = noise(h, 'pink'); chain(s, f, swell); emit(ch, swell, 0.1);
      const foam = gain(0.0); const s2 = noise(h, 'white'); chain(s2, filt('highpass', 3000), foam); emit(ch, foam);
      const wave = () => {
        const t = ctx.currentTime, up = rand(2.5, 4), down = rand(3.5, 6), peak = rand(0.3, 0.55);
        swell.gain.cancelScheduledValues(t); swell.gain.setTargetAtTime(peak, t, up / 3); swell.gain.setTargetAtTime(0.05, t + up, down / 3);
        f.frequency.cancelScheduledValues(t); f.frequency.setTargetAtTime(rand(1500, 2600), t, up / 3); f.frequency.setTargetAtTime(500, t + up, down / 3);
        foam.gain.cancelScheduledValues(t); foam.gain.setTargetAtTime(peak * 0.1, t + up * 0.6, 0.6); foam.gain.setTargetAtTime(0, t + up + 0.8, 1.6);
      };
      wave(); every(h, wave, 6500, 11000);
    } },
    { id: 'forest', name: 'Forest birds', icon: '🐦', make(ch, h) {
      bed(ch, h, 'pink', s => chain(s, filt('bandpass', 2800, 0.5)), 0.012);
      bed(ch, h, 'brown', s => chain(s, filt('lowpass', 300)), 0.06);
      const phrase = () => {
        const base = rand(2300, 4800), p = rand(-0.9, 0.9), n = Math.floor(rand(2, 6)); let t = ctx.currentTime + 0.02;
        const kind = Math.floor(rand(0, 3));
        for (let i = 0; i < n; i++) {
          const f = base * (kind === 0 ? 1 : kind === 1 ? 1 + i * 0.07 : 1 + (i % 2) * 0.25), d = rand(0.05, 0.14);
          tone(ch, { t, f, f2: f * rand(0.8, 1.35), dur: d, g: rand(0.05, 0.13), pan: p, wet: 0.4, att: 0.008 });
          if (kind === 2) tone(ch, { t, f: f * 2, f2: f * 2.4, dur: d * 0.7, g: 0.025, pan: p, wet: 0.3 });
          t += d + rand(0.03, 0.12);
        }
      };
      every(h, phrase, 1200, 5500);
    } },
    { id: 'night', name: 'Night crickets', icon: '🌙', make(ch, h) {
      bed(ch, h, 'brown', s => chain(s, filt('lowpass', 220)), 0.05);
      [4300, 4650, 5050].forEach((f0, v) => {
        const pv = rand(-0.9, 0.9), f = f0 * rand(0.97, 1.03);
        every(h, () => { const t0 = ctx.currentTime, n = Math.floor(rand(3, 7)), gap = rand(0.05, 0.07); for (let i = 0; i < n; i++) tone(ch, { t: t0 + i * gap, f, dur: 0.035, g: 0.022, pan: pv, att: 0.004, type: 'sine' }); }, 500 + v * 180, 1500 + v * 200);
      });
      every(h, () => tone(ch, { f: rand(400, 560), f2: rand(300, 420), dur: 0.9, g: 0.02, pan: rand(-0.6, 0.6), wet: 0.9, att: 0.2 }), 12000, 30000); // an owl far away
    } },
    { id: 'cafe', name: 'Café', icon: '☕', make(ch, h) {
      // a murmur of voices: pink noise through two formant bands whose levels drift independently
      [[330, 1.1, 0.36], [1050, 1.8, 0.2], [2300, 2.4, 0.07]].forEach(([f, q, lv]) => {
        bed(ch, h, 'pink', s => { const bp = filt('bandpass', f, q), g = gain(0.6); lfo(h, rand(0.15, 0.5), 0.35, g.gain); lfo(h, rand(2.2, 4.6), 0.12, g.gain); return chain(s, bp, g); }, lv);
      });
      bed(ch, h, 'brown', s => chain(s, filt('lowpass', 250)), 0.06);
      every(h, () => { const f = rand(2400, 4200), p = rand(-0.8, 0.8); tone(ch, { f, dur: 0.35, g: 0.05, pan: p, wet: 0.25 }); tone(ch, { f: f * 1.51, dur: 0.22, g: 0.03, pan: p, wet: 0.25 }); }, 3500, 11000);
      every(h, () => burst(ch, { f: rand(150, 400), q: 1.4, g: rand(0.12, 0.25), dur: 0.05, pan: rand(-0.8, 0.8), wet: 0.2 }), 2500, 8000);
    } },
    { id: 'brown', name: 'Brown noise', icon: '🟤', make(ch, h) { bed(ch, h, 'brown', s => chain(s, filt('lowpass', 1400)), 0.55); } },
    { id: 'pink', name: 'Pink noise', icon: '🩷', make(ch, h) { bed(ch, h, 'pink', s => chain(s, filt('lowpass', 7000)), 0.5); } },
    { id: 'white', name: 'White noise', icon: '⚪', make(ch, h) { bed(ch, h, 'white', s => chain(s, filt('highpass', 120), filt('lowpass', 9000)), 0.3); } },
    { id: 'lofi', name: 'Lo-fi keys', icon: '🎹', make(ch, h) {
      const CH = { Cmaj7: [48, 59, 64, 67], Am7: [45, 55, 60, 64], Dm7: [50, 60, 65, 69], G7: [43, 59, 62, 65], Fmaj7: [41, 57, 60, 64], Em7: [40, 55, 59, 62] };
      const PROGS = [['Dm7', 'G7', 'Cmaj7', 'Am7'], ['Fmaj7', 'Em7', 'Dm7', 'G7'], ['Cmaj7', 'Am7', 'Dm7', 'G7'], ['Am7', 'Dm7', 'G7', 'Cmaj7']];
      const SCALE = [72, 74, 76, 79, 81, 84, 86];
      const bus = gain(1), lp = filt('lowpass', 2300, 0.5); bus.connect(lp); emit(ch, lp, 0.55);
      const vinyl = gain(0.02); const vs = noise(h, 'pink'); chain(vs, filt('highpass', 1800), vinyl); emit(ch, vinyl);
      every(h, () => burst(ch, { f: rand(1500, 6000), q: 1, g: rand(0.02, 0.07), dur: rand(0.004, 0.012), pan: rand(-0.5, 0.5) }), 90, 700);
      const key = (m, t, vel, dur) => {
        const f = mtof(m), g = gain(0), tine = gain(0);
        const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), o3 = ctx.createOscillator(), g2 = gain(0.32), g3 = gain(1);
        o1.frequency.value = f; o2.frequency.value = f * 2.003; o3.frequency.value = f * 6.02; o3.connect(g3); g3.connect(tine);
        o1.connect(g); o2.connect(g2); g2.connect(g); tine.connect(bus); g.connect(bus);
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * 0.2, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        tine.gain.setValueAtTime(0, t); tine.gain.linearRampToValueAtTime(vel * 0.03, t + 0.003); tine.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        [o1, o2, o3].forEach(o => { o.start(t); o.stop(t + dur + 0.05); });
      };
      const kick = t => { const o = ctx.createOscillator(), g = gain(0); o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3); o.connect(g); emit(ch, g); o.start(t); o.stop(t + 0.32); };
      let bpm = rand(68, 78), prog = pick(PROGS), bar = 0, next = null;
      const scheduleBar = t0 => {
        const beat = 60 / bpm, chord = CH[prog[bar % 4]];
        chord.forEach((m, i) => key(m, t0 + i * 0.035, 0.7 + Math.random() * 0.2, beat * 3.6));
        if (Math.random() < 0.65) chord.forEach((m, i) => key(m, t0 + beat * 2.5 + i * 0.03, 0.45, beat * 1.6));
        key(chord[0] - 12, t0, 0.9, beat * 3); if (Math.random() < 0.6) key(chord[0] - 12 + (Math.random() < 0.5 ? 7 : 0), t0 + beat * 2, 0.7, beat * 1.8);
        for (let i = 0; i < 8; i++) if (Math.random() < 0.3) key(pick(SCALE), t0 + i * beat / 2 + (i % 2 ? beat * 0.08 : 0), 0.5 + Math.random() * 0.3, beat * 2);
        kick(t0); kick(t0 + beat * 2.5);
        [1, 3].forEach(b => burst(ch, { t: t0 + b * beat, f: 1900, q: 0.7, g: 0.13, dur: 0.14, wet: 0.25 }));
        for (let i = 0; i < 8; i++) if (Math.random() < 0.75) burst(ch, { t: t0 + i * beat / 2 + (i % 2 ? beat * 0.08 : 0), type: 'highpass', f: 7500, g: i % 2 ? 0.035 : 0.05, dur: 0.035 });
        bar++; if (bar % 4 === 0) { prog = pick(PROGS); bpm = clampN(bpm + rand(-3, 3), 66, 80); }
        return beat * 4;
      };
      const tick = () => { if (!running || ctx.state !== 'running') { next = null; return; } const now = ctx.currentTime; if (next == null || next < now) next = now + 0.1; while (next < now + 1.3) next += scheduleBar(next); };
      const id = setInterval(tick, 250); h.stop.push(() => clearInterval(id)); tick();
    } },
    { id: 'pad', name: 'Ambient pad', icon: '🪐', make(ch, h) {
      const CHORDS = [[48, 55, 62, 64], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 57, 62], [46, 53, 60, 65]];
      const lp = filt('lowpass', 900, 0.4), bus = gain(0.9); lfo(h, 0.04, 380, lp.frequency); chain(bus, lp); emit(ch, lp, 0.7);
      let cur = null, idx = Math.floor(rand(0, CHORDS.length));
      const play = () => {
        const t = ctx.currentTime, voice = gain(0), oscs = [];
        CHORDS[idx].forEach(m => [-7, 6].forEach(c => { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m); o.detune.value = c + rand(-2, 2); const g = gain(0.045); o.connect(g); g.connect(voice); o.start(t); oscs.push(o); }));
        const hi = ctx.createOscillator(); hi.type = 'sine'; hi.frequency.value = mtof(CHORDS[idx][3] + 12); const hg = gain(0.02); hi.connect(hg); hg.connect(voice); hi.start(t); oscs.push(hi);
        voice.connect(bus); voice.gain.setValueAtTime(0, t); voice.gain.linearRampToValueAtTime(1, t + 6);
        if (cur) { const old = cur; old.v.gain.cancelScheduledValues(t); old.v.gain.setValueAtTime(old.v.gain.value, t); old.v.gain.linearRampToValueAtTime(0, t + 7); setTimeout(() => old.o.forEach(o => { try { o.stop(); } catch (e) { } }), 7500); }
        cur = { v: voice, o: oscs }; idx = (idx + 1 + Math.floor(rand(0, 3))) % CHORDS.length;
      };
      play(); every(h, play, 14000, 19000);
      h.stop.push(() => { if (cur) { const c = cur; setTimeout(() => c.o.forEach(o => { try { o.stop(); } catch (e) { } }), 700); } });
    } },
  ];
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

  const PRESETS = [
    { name: 'Rainy focus', icon: '🌧️', vols: { rain: 55, thunder: 18, lofi: 35 } },
    { name: 'Cozy cabin', icon: '🔥', vols: { fire: 55, wind: 22, pad: 28 } },
    { name: 'Café study', icon: '☕', vols: { cafe: 50, lofi: 40 } },
    { name: 'Deep focus', icon: '🧠', vols: { brown: 40, pad: 38 } },
    { name: 'Forest morning', icon: '🌳', vols: { forest: 58, wind: 14, ocean: 0 } },
    { name: 'Ocean calm', icon: '🌊', vols: { ocean: 60, pad: 24, wind: 10 } },
    { name: 'Night sky', icon: '🌙', vols: { night: 50, pad: 32, fire: 14 } },
  ];
  const BG_MATCH = { cafe: 'Café study', lamp: 'Rainy focus', forest: 'Rainy focus', stars: 'Night sky', aurora: 'Deep focus', ocean: 'Ocean calm', campfire: 'Cozy cabin', snow: 'Cozy cabin', city: 'Café study', sakura: 'Forest morning', video: 'Deep focus', image: 'Deep focus' };

  /* ───────────── channels ───────────── */
  const channels = {};
  let audioEl = null;
  let source = 'mix', ready = false, pending = null;   /* the bar controls whichever you used last; pending = waiting to resume after a reload */
  const curve = v => Math.pow(v / 100, 1.7);
  let state = load();
  function load() {
    try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s === 'object') return { vols: s.vols || {}, master: s.master == null ? 80 : s.master, mixes: Array.isArray(s.mixes) ? s.mixes : [], recent: Array.isArray(s.recent) ? s.recent : [], name: s.name || '' }; } catch (e) { }
    return { vols: {}, master: 80, mixes: [], recent: [], name: '' };
  }
  let saveT = null;
  function save() { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { } }, 400); }

  function applyChannel(s) {
    const v = state.vols[s.id] || 0;
    if (!ctx) return;
    let ch = channels[s.id];
    if (v > 0 && !ch) {
      ch = channels[s.id] = { out: gain(0), send: gain(0), h: { src: [], stop: [] } };
      ch.out.connect(master); ch.send.connect(revIn);
      try { s.make(ch, ch.h); } catch (e) { console.error('sound failed', s.id, e); }
    }
    if (!ch) return;
    const target = curve(v);
    ch.out.gain.setTargetAtTime(target, ctx.currentTime, 0.12); ch.send.gain.setTargetAtTime(target, ctx.currentTime, 0.12);
    clearTimeout(ch.kill);
    if (v === 0) ch.kill = setTimeout(() => { // faded out: tear it down
      ch.h.stop.forEach(f => f()); ch.h.src.forEach(o => { try { o.stop(); } catch (e) { } });
      try { ch.out.disconnect(); ch.send.disconnect(); } catch (e) { }
      if (channels[s.id] === ch) delete channels[s.id];
    }, 900);
  }
  function applyAll() { SOUNDS.forEach(applyChannel); applyMaster(); }
  function applyMaster() { if (audioEl) audioEl.volume = Math.min(1, state.master / 100); if (ctx) master.gain.setTargetAtTime(running ? Math.pow(state.master / 100, 1.5) * 1.5 * duckK : 0, ctx.currentTime, running ? 0.15 : 0.25); }

  let duckK = 1, duckT = null;
  function duck(ms) { duckK = 0.18; applyMaster(); clearTimeout(duckT); duckT = setTimeout(() => { duckK = 1; applyMaster(); }, ms || 3000); }

  function anyOn() { return SOUNDS.some(s => (state.vols[s.id] || 0) > 0); }
  function play() {
    if (!ensure()) { toast('Your browser does not support the sound mixer.'); return; }
    if (!anyOn()) { setPreset(PRESETS[0], true); return; }
    source = 'mix'; running = true; ctx.resume().then(() => { applyAll(); render(); });
    render(); if (ready) npSave();
  }
  function pause() { running = false; applyMaster(); setTimeout(() => { if (!running && ctx) ctx.suspend(); }, 450); render(); if (ready) npSave(); }
  function toggle() { running ? pause() : play(); }

  function setVol(id, v) {
    state.vols[id] = clampN(Math.round(v), 0, 100); state.name = '';
    save();
    if (!running && v > 0) { play(); return; }
    const s = SOUNDS.find(x => x.id === id); applyChannel(s); render();
  }
  function setPreset(p, start) {
    SOUNDS.forEach(s => { state.vols[s.id] = p.vols[s.id] || 0; });
    state.name = p.name; save();
    if (start || running) { running = true; if (ensure()) ctx.resume().then(() => applyAll()); }
    syncSliders(); render();
  }

  /* sleep timer: fades out over the last 25 seconds */
  let sleepAt = 0, sleepT = null;
  function setSleep(min) {
    clearInterval(sleepT); sleepAt = 0;
    if (min > 0) {
      sleepAt = Date.now() + min * 60000;
      sleepT = setInterval(() => {
        const left = sleepAt - Date.now();
        if (left <= 25000 && running && ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 8);
        if (left <= 0) { clearInterval(sleepT); sleepAt = 0; pause(); $('gmp-sleep').value = '0'; }
        render();
      }, 1000);
    }
    render();
  }

  /* ───────────── interface ───────────── */
  function buildPanel() {
    $('gmp-presets').innerHTML = PRESETS.map((p, i) => `<button type="button" class="gmp-chip" data-preset="${i}">${p.icon} ${p.name}</button>`).join('') + '<span id="gmp-mymixes"></span>';
    $('gmp-grid').innerHTML = SOUNDS.map(s =>
      `<div class="gmp-snd" data-id="${s.id}"><div class="gmp-snd-top"><span class="gmp-snd-ico">${s.icon}</span><span class="gmp-snd-name">${s.name}</span><span class="gmp-snd-val" data-val="${s.id}">0</span></div>` +
      `<input type="range" class="gmp-range" min="0" max="100" step="1" value="0" data-snd="${s.id}" aria-label="${s.name} volume"></div>`).join('');
    renderMixes();
  }
  function renderMixes() {
    $('gmp-mymixes').innerHTML = state.mixes.map((m, i) => `<button type="button" class="gmp-chip gmp-chip-mine" data-mix="${i}" title="Right-click or long-press to delete">★ ${escapeHtml(m.name)}</button>`).join('');
  }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function syncSliders() {
    SOUNDS.forEach(s => { const r = panel.querySelector(`[data-snd="${s.id}"]`), v = state.vols[s.id] || 0; if (r) { r.value = v; r.style.setProperty('--v', v + '%'); } const l = panel.querySelector(`[data-val="${s.id}"]`); if (l) l.textContent = v; panel.querySelector(`.gmp-snd[data-id="${s.id}"]`).classList.toggle('on', v > 0); });
    $('gmp-master').value = state.master; $('gmp-master').style.setProperty('--v', state.master + '%'); $('gmp-bar-vol').value = state.master; $('gmp-bar-vol').style.setProperty('--v', state.master + '%');
  }
  function render() {
    const on = SOUNDS.filter(s => (state.vols[s.id] || 0) > 0);
    const fileOn = !!(audioEl && !audioEl.paused), files = source === 'files' && audioEl && audioEl.getAttribute('src'), any = running || fileOn;
    bar.classList.toggle('playing', any); bar.classList.toggle('files', !!files);
    $('gmp-play').innerHTML = any ? '&#10074;&#10074;' : '&#9654;'; $('gmp-play').setAttribute('aria-label', any ? 'Pause' : 'Play');
    $('gmp-bprev').hidden = $('gmp-bnext').hidden = !files;
    $('gmp-name').textContent = files ? $('gmp-now-title').textContent : (state.name || (on.length ? 'Custom mix' : 'Study sounds'));
    let sub = on.length ? on.slice(0, 3).map(s => s.name).join(' · ') + (on.length > 3 ? ' +' + (on.length - 3) : '') : 'Tap play for a calm mix';
    if (sleepAt) { const m = Math.max(0, Math.ceil((sleepAt - Date.now()) / 60000)); sub += ' · sleep in ' + m + ' min'; }
    if (files) sub = (fileOn ? 'My music' : 'My music · paused') + (running ? ' + ' + (state.name || 'sounds') : '');
    else if (fileOn) sub = '♪ ' + $('gmp-now-title').textContent + (on.length ? ' + sounds' : '');
    if (pending) sub = 'Tap anywhere to keep listening';
    $('gmp-sub').textContent = sub;
    panel.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('active', PRESETS[+b.dataset.preset].name === state.name));
    panel.querySelectorAll('[data-mix]').forEach(b => b.classList.toggle('active', state.mixes[+b.dataset.mix] && state.mixes[+b.dataset.mix].name === state.name));
    const mt = $('gmp-match'); const bg = document.getElementById('st-root') && document.getElementById('st-root').dataset.bg;
    mt.hidden = !(bg && BG_MATCH[bg]); if (bg && BG_MATCH[bg]) mt.textContent = '✨ Match my wallpaper: ' + BG_MATCH[bg];
    try { if ('mediaSession' in navigator) { navigator.mediaSession.metadata = new MediaMetadata(files ? { title: $('gmp-now-title').textContent, artist: 'My music' } : { title: state.name || 'Study sounds', artist: 'StudySync' }); navigator.mediaSession.playbackState = any ? 'playing' : 'paused'; } } catch (e) { }
  }
  function toast(msg) { const t = $('global-toast'); if (t) { t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 3000); } }

  function openPanel(open) {
    const show = open == null ? panel.classList.contains('hidden') : open;
    panel.classList.toggle('hidden', !show); $('gmp-toggle').classList.toggle('open', show); $('gmp-toggle').setAttribute('aria-expanded', String(show));
    if (show) render();
  }

  buildPanel(); syncSliders(); render();
  $('gmp-play').addEventListener('click', () => barToggle());
  $('gmp-bprev').addEventListener('click', () => prevTrack());
  $('gmp-bnext').addEventListener('click', () => nextTrack(1));
  $('gmp-toggle').addEventListener('click', () => openPanel());
  $('gmp-close').addEventListener('click', () => openPanel(false));
  $('gmp-left').addEventListener('click', () => openPanel());
  panel.addEventListener('input', e => {
    const r = e.target;
    if (r.dataset && r.dataset.snd) { const v = +r.value; r.style.setProperty('--v', v + '%'); panel.querySelector(`[data-val="${r.dataset.snd}"]`).textContent = v; panel.querySelector(`.gmp-snd[data-id="${r.dataset.snd}"]`).classList.toggle('on', v > 0); setVol(r.dataset.snd, v); }
    if (r.id === 'gmp-master') { state.master = +r.value; r.style.setProperty('--v', r.value + '%'); $('gmp-bar-vol').value = r.value; $('gmp-bar-vol').style.setProperty('--v', r.value + '%'); applyMaster(); save(); }
  });
  $('gmp-bar-vol').addEventListener('input', e => { state.master = +e.target.value; e.target.style.setProperty('--v', e.target.value + '%'); $('gmp-master').value = e.target.value; $('gmp-master').style.setProperty('--v', e.target.value + '%'); applyMaster(); save(); });
  panel.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.closest('[data-pane="playlists"], [data-pane="files"], .gmp-tabs')) return;
    if (b.dataset.preset != null) setPreset(PRESETS[+b.dataset.preset], true);
    else if (b.dataset.mix != null) { const m = state.mixes[+b.dataset.mix]; if (m) setPreset({ name: m.name, vols: m.vols }, true); }
    else if (b.id === 'gmp-match') { const bg = document.getElementById('st-root').dataset.bg, p = PRESETS.find(x => x.name === BG_MATCH[bg]); if (p) setPreset(p, true); }
    else if (b.id === 'gmp-save') {
      if (!anyOn()) { toast('Turn a sound up first, then save your mix.'); return; }
      window.ssPrompt('Name your mix', 'My mix', { title: 'Save mix', ok: 'Save', maxLength: 24 }).then(answer => {
        const name = (answer || '').trim().slice(0, 24); if (!name) return;
        const vols = {}; SOUNDS.forEach(s => { if (state.vols[s.id] > 0) vols[s.id] = state.vols[s.id]; });
        state.mixes = state.mixes.filter(m => m.name !== name).concat([{ name, vols }]).slice(-8); state.name = name; save(); renderMixes(); render();
      });
    }
    else if (b.id === 'gmp-silence') { SOUNDS.forEach(s => { state.vols[s.id] = 0; }); state.name = ''; save(); applyAll(); syncSliders(); pause(); }
  });
  panel.addEventListener('contextmenu', e => { const b = e.target.closest('[data-mix]'); if (!b) return; e.preventDefault(); const m = state.mixes[+b.dataset.mix]; if (m) window.ssConfirm('Delete the mix "' + m.name + '"?', {ok: 'Delete', danger: true}).then(ok => { if (ok) { state.mixes.splice(+b.dataset.mix, 1); save(); renderMixes(); render(); } }); });
  $('gmp-sleep').addEventListener('change', e => setSleep(+e.target.value));
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.classList.contains('hidden')) openPanel(false); });
  document.addEventListener('click', e => { if (!panel.classList.contains('hidden') && !panel.contains(e.target) && !bar.contains(e.target)) openPanel(false); });
  /* media keys and the lock screen follow the bar */
  if ('mediaSession' in navigator) { try {
    navigator.mediaSession.setActionHandler('play', () => { if (!(running || (audioEl && !audioEl.paused))) barToggle(); });
    navigator.mediaSession.setActionHandler('pause', () => { if (running || (audioEl && !audioEl.paused)) barToggle(); });
    navigator.mediaSession.setActionHandler('nexttrack', () => { if (source === 'files') nextTrack(1); });
    navigator.mediaSession.setActionHandler('previoustrack', () => { if (source === 'files') prevTrack(); });
  } catch (e) { } }

  /* ───────────── tabs ───────────── */
  function showTab(name) {
    panel.querySelectorAll('.gmp-tab').forEach(t => { const on = t.dataset.tab === name; t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on)); });
    panel.querySelectorAll('.gmp-pane').forEach(p => { p.hidden = p.dataset.pane !== name; });
    try { sessionStorage.setItem('gmpTab', name); } catch (e) { }
  }
  panel.querySelector('.gmp-tabs').addEventListener('click', e => { const t = e.target.closest('.gmp-tab'); if (t) showTab(t.dataset.tab); });
  try { const t = sessionStorage.getItem('gmpTab'); if (t) showTab(t); } catch (e) { }

  /* ───────────── music services and playlist links ───────────── */
  const SERVICES = [
    { id: 'spotify', name: 'Spotify', color: '#1DB954', open: 'https://open.spotify.com/', hint: 'Open a playlist in Spotify, choose Share → Copy link to playlist, then paste it above.' },
    { id: 'apple', name: 'Apple Music', color: '#FA243C', open: 'https://music.apple.com/', hint: 'In Apple Music choose ••• → Share → Copy Link on any playlist or album, then paste it above.' },
    { id: 'youtube', name: 'YouTube Music', color: '#FF0033', open: 'https://music.youtube.com/', hint: 'Works with YouTube and YouTube Music videos, mixes and playlists.' },
    { id: 'soundcloud', name: 'SoundCloud', color: '#FF5500', open: 'https://soundcloud.com/', hint: 'Paste a track, set or profile link from SoundCloud.' },
    { id: 'deezer', name: 'Deezer', color: '#A238FF', open: 'https://www.deezer.com/', hint: 'Paste a Deezer playlist, album or track link.' },
    { id: 'amazon', name: 'Amazon Music', color: '#25D1DA', open: 'https://music.amazon.com/', hint: 'Amazon Music cannot be embedded, so it plays in its own tab. Your sounds keep playing here.' },
  ];
  const SUGGEST = [
    { label: 'Peaceful Piano', url: 'https://open.spotify.com/playlist/37i9dQZF1DX4sWSpwq3LiO' },
    { label: 'Deep Focus', url: 'https://open.spotify.com/playlist/37i9dQZF1DWZeKCadgRdKQ' },
    { label: 'Lofi Beats', url: 'https://open.spotify.com/playlist/37i9dQZF1DWWQRwui0ExPn' },
    { label: 'Lofi Girl live radio', url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk' },
  ];

  /* turn whatever the user pasted into something we can embed */
  function parseLink(raw) {
    raw = (raw || '').trim(); if (!raw) return null;
    if (!/^https?:\/\//i.test(raw)) raw = 'https://' + raw;
    let u; try { u = new URL(raw); } catch (e) { return null; }
    const host = u.hostname.replace(/^www\.|^m\./, ''), path = u.pathname;
    let m;
    if (host === 'open.spotify.com') {
      m = path.match(/\/(?:intl-[a-z]+\/)?(playlist|album|track|artist|show|episode)\/([A-Za-z0-9]+)/);
      if (m) return { service: 'spotify', label: 'Spotify ' + m[1], embed: `https://open.spotify.com/embed/${m[1]}/${m[2]}?utm_source=generator&theme=0`, height: /track|episode/.test(m[1]) ? 152 : 380 };
      return { error: 'That Spotify link has no playlist, album or track in it. Use Share → Copy link.' };
    }
    if (host === 'music.apple.com' || host === 'embed.music.apple.com') {
      if (/\/(playlist|album|song|station|artist)\//.test(path)) return { service: 'apple', label: 'Apple Music', embed: 'https://embed.music.apple.com' + path + u.search, height: /\/song\//.test(path) || /[?&]i=/.test(u.search) ? 175 : 450 };
      return { error: 'Open a playlist or album in Apple Music, then choose Share → Copy Link.' };
    }
    if (/(^|\.)youtube\.com$/.test(host) || host === 'youtu.be') {
      const list = u.searchParams.get('list'), v = u.searchParams.get('v') || (host === 'youtu.be' ? path.slice(1) : (path.match(/\/(?:embed|shorts|live)\/([\w-]{11})/) || [])[1]);
      if (list && !/^RD/.test(list)) return { service: 'youtube', label: 'YouTube playlist', embed: `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(list)}&autoplay=1&rel=0`, height: 315 };
      if (v && /^[\w-]{11}$/.test(v)) return { service: 'youtube', label: 'YouTube', embed: `https://www.youtube.com/embed/${v}?autoplay=1&rel=0`, height: 315 };
      return { error: 'That YouTube link has no video or playlist in it.' };
    }
    if (host === 'soundcloud.com' || host === 'on.soundcloud.com') return { service: 'soundcloud', label: 'SoundCloud', embed: 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(raw) + '&auto_play=true&hide_related=true&show_comments=false', height: 300 };
    if (host === 'deezer.com') {
      m = path.match(/\/(?:[a-z]{2}\/)?(playlist|album|track|artist)\/(\d+)/);
      if (m) return { service: 'deezer', label: 'Deezer ' + m[1], embed: `https://widget.deezer.com/widget/dark/${m[1]}/${m[2]}?autoplay=true`, height: m[1] === 'track' ? 150 : 350 };
    }
    if (/(^|\.)music\.amazon\./.test(host)) return { service: 'amazon', label: 'Amazon Music', external: raw };
    if (/\.(mp3|m4a|aac|ogg|oga|wav|flac|opus)(\?|$)/i.test(path)) return { service: 'audio', label: 'Audio file', audio: raw };
    return { error: 'I do not recognise that link. Spotify, Apple Music, YouTube, SoundCloud, Deezer and direct audio links work.' };
  }

  const embedBox = $('gmp-embed'), noteEl = $('gmp-link-note');
  const NOTE_DEFAULT = noteEl.textContent;
  function note(msg, bad) { noteEl.textContent = msg || NOTE_DEFAULT; noteEl.classList.toggle('bad', !!bad); }
  function clearEmbed() { embedBox.innerHTML = ''; embedBox.hidden = true; }

  function playLink(raw) {
    const r = parseLink(raw);
    if (!r) { note('Paste a link first.', true); return false; }
    if (r.error) { note(r.error, true); return false; }
    note('');
    if (r.external) { window.open(r.external, '_blank', 'noopener'); note('Opened in a new tab: Amazon Music cannot play inside other pages.'); remember(raw, r); return true; }
    clearEmbed();
    if (r.audio) {
      const a = document.createElement('audio'); a.controls = true; a.autoplay = true; a.src = r.audio; a.className = 'gmp-audio-el'; embedBox.appendChild(a);
    } else {
      const f = document.createElement('iframe');
      f.src = r.embed; f.height = r.height; f.className = 'gmp-iframe'; f.title = r.label; f.loading = 'lazy';
      f.referrerPolicy = 'strict-origin-when-cross-origin'; f.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture'; f.setAttribute('allowfullscreen', '');
      embedBox.appendChild(f);
    }
    embedBox.hidden = false; remember(raw, r);
    return true;
  }
  function remember(raw, r) {
    state.recent = [{ url: raw.trim(), label: r.label }].concat((state.recent || []).filter(x => x.url !== raw.trim())).slice(0, 8); save(); renderRecent();
  }
  function renderRecent() {
    const list = state.recent || [];
    $('gmp-recent-wrap').hidden = !list.length;
    $('gmp-recent').innerHTML = list.map((x, i) => `<div class="gmp-recent-row"><button type="button" class="gmp-recent-item" data-recent="${i}" title="${escapeHtml(x.url)}"><b>${escapeHtml(x.label)}</b><span>${escapeHtml(x.url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 52))}</span></button><button type="button" class="gmp-recent-x" data-recent-del="${i}" aria-label="Remove">&#10005;</button></div>`).join('');
  }

  $('gmp-services').innerHTML = SERVICES.map(s => `<button type="button" class="gmp-service" data-service="${s.id}" style="--c:${s.color}"><span class="gmp-service-dot"></span>${s.name}</button>`).join('');
  $('gmp-suggest').innerHTML = SUGGEST.map((s, i) => `<button type="button" class="gmp-chip" data-suggest="${i}">&#9835; ${s.label}</button>`).join('');
  $('gmp-services').addEventListener('click', e => {
    const b = e.target.closest('[data-service]'); if (!b) return; const s = SERVICES.find(x => x.id === b.dataset.service);
    $('gmp-services').querySelectorAll('.gmp-service').forEach(x => x.classList.toggle('active', x === b));
    note(s.hint); window.open(s.open, '_blank', 'noopener'); $('gmp-link-input').focus();
  });
  $('gmp-link-form').addEventListener('submit', e => { e.preventDefault(); if (playLink($('gmp-link-input').value)) $('gmp-link-input').value = ''; });
  $('gmp-suggest').addEventListener('click', e => { const b = e.target.closest('[data-suggest]'); if (b) playLink(SUGGEST[+b.dataset.suggest].url); });
  $('gmp-recent').addEventListener('click', e => {
    const d = e.target.closest('[data-recent-del]'); if (d) { state.recent.splice(+d.dataset.recentDel, 1); save(); renderRecent(); return; }
    const b = e.target.closest('[data-recent]'); if (b) playLink(state.recent[+b.dataset.recent].url);
  });
  renderRecent();

  /* ───────────── files from this computer ───────────── */
  audioEl = $('gmp-audio');
  let tracks = [], cur = -1, shuffle = false, repeat = false, urls = {};
  function idb() { return new Promise((res, rej) => { const q = indexedDB.open('studySyncLocalMusic', 1); q.onupgradeneeded = () => q.result.createObjectStore('files', { keyPath: 'id', autoIncrement: true }); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); }
  async function dbAll() { try { const db = await idb(); return await new Promise(r => { const q = db.transaction('files').objectStore('files').getAll(); q.onsuccess = () => r(q.result || []); q.onerror = () => r([]); }); } catch (e) { return []; } }
  async function dbPut(rec) { try { const db = await idb(); return await new Promise(r => { const q = db.transaction('files', 'readwrite').objectStore('files').add(rec); q.onsuccess = () => r(q.result); q.onerror = () => r(null); }); } catch (e) { return null; } }
  async function dbDel(id) { try { const db = await idb(); db.transaction('files', 'readwrite').objectStore('files').delete(id); } catch (e) { } }
  async function dbClear() { try { const db = await idb(); db.transaction('files', 'readwrite').objectStore('files').clear(); } catch (e) { } }

  const fmt = s => { if (!isFinite(s)) return '0:00'; s = Math.floor(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const prettyName = n => n.replace(/\.[a-z0-9]+$/i, '').replace(/_+/g, ' ');
  async function addFiles(list) {
    const files = Array.from(list).filter(f => /^audio\//.test(f.type) || /\.(mp3|m4a|aac|ogg|oga|wav|flac|opus|weba)$/i.test(f.name));
    if (!files.length) { toast('No audio files found in that selection.'); return; }
    for (const f of files.slice(0, 300)) { const id = await dbPut({ name: f.name, blob: f }); tracks.push({ id, name: f.name, blob: f }); }
    renderTracks(); if (cur < 0) loadTrack(0, true);
  }
  function renderTracks() {
    $('gmp-local').hidden = !tracks.length;
    $('gmp-tracks').innerHTML = tracks.map((t, i) => `<li class="${i === cur ? 'now' : ''}"><button type="button" data-track="${i}"><span class="gmp-tn">${i === cur && !audioEl.paused ? '&#9654;' : i + 1}</span><span class="gmp-tt">${escapeHtml(prettyName(t.name))}</span></button><button type="button" class="gmp-recent-x" data-track-del="${i}" aria-label="Remove">&#10005;</button></li>`).join('');
  }
  function loadTrack(i, quiet) {
    if (!tracks.length) return; cur = (i + tracks.length) % tracks.length; const t = tracks[cur];
    if (!urls[t.id]) urls[t.id] = URL.createObjectURL(t.blob);
    audioEl.src = urls[t.id]; $('gmp-now-title').textContent = prettyName(t.name); renderTracks();
    if (!quiet) audioEl.play().catch(() => { });
    try { if ('mediaSession' in navigator) navigator.mediaSession.metadata = new MediaMetadata({ title: prettyName(t.name), artist: 'My files' }); } catch (e) { }
  }
  function nextTrack(dir) { if (!tracks.length) return; if (shuffle && dir > 0 && tracks.length > 1) { let n; do { n = Math.floor(Math.random() * tracks.length); } while (n === cur); loadTrack(n); } else loadTrack(cur + dir); }
  $('gmp-file-input').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  $('gmp-dir-input').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
  const drop = $('gmp-drop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files); });
  $('gmp-lplay').addEventListener('click', () => { if (cur < 0) loadTrack(0); else if (audioEl.paused) audioEl.play().catch(() => { }); else audioEl.pause(); });
  $('gmp-next').addEventListener('click', () => nextTrack(1));
  function prevTrack() { if (audioEl.currentTime > 4) audioEl.currentTime = 0; else nextTrack(-1); }
  $('gmp-prev').addEventListener('click', prevTrack);
  $('gmp-shuffle').addEventListener('click', e => { shuffle = !shuffle; e.currentTarget.setAttribute('aria-pressed', String(shuffle)); e.currentTarget.classList.toggle('on', shuffle); });
  $('gmp-repeat').addEventListener('click', e => { repeat = !repeat; e.currentTarget.setAttribute('aria-pressed', String(repeat)); e.currentTarget.classList.toggle('on', repeat); });
  $('gmp-seek').addEventListener('input', e => { if (audioEl.duration) audioEl.currentTime = audioEl.duration * (+e.target.value / 1000); });
  audioEl.addEventListener('timeupdate', () => { if (audioEl.duration) { $('gmp-seek').value = Math.round(audioEl.currentTime / audioEl.duration * 1000); $('gmp-seek').style.setProperty('--v', ($('gmp-seek').value / 10) + '%'); } $('gmp-t-cur').textContent = fmt(audioEl.currentTime); $('gmp-t-dur').textContent = fmt(audioEl.duration); });
  audioEl.addEventListener('play', () => { source = 'files'; $('gmp-lplay').innerHTML = '&#10074;&#10074;'; renderTracks(); render(); npSave(); });
  audioEl.addEventListener('pause', () => { $('gmp-lplay').innerHTML = '&#9654;'; renderTracks(); render(); npSave(); });
  let npT = 0; audioEl.addEventListener('timeupdate', () => { if (Date.now() - npT > 2000) { npT = Date.now(); npSave(); } });
  audioEl.addEventListener('ended', () => { if (repeat && !shuffle) loadTrack(cur); else if (cur < tracks.length - 1 || shuffle || repeat) nextTrack(1); });
  $('gmp-tracks').addEventListener('click', e => {
    const d = e.target.closest('[data-track-del]');
    if (d) {
      const i = +d.dataset.trackDel, t = tracks[i]; dbDel(t.id); if (urls[t.id]) { URL.revokeObjectURL(urls[t.id]); delete urls[t.id]; }
      tracks.splice(i, 1);
      if (i === cur) { audioEl.pause(); audioEl.removeAttribute('src'); cur = -1; $('gmp-now-title').textContent = 'Nothing playing'; if (tracks.length) loadTrack(Math.min(i, tracks.length - 1), true); }
      else if (i < cur) cur--;
      renderTracks(); return;
    }
    const b = e.target.closest('[data-track]'); if (b) loadTrack(+b.dataset.track);
  });
  $('gmp-clear-files').addEventListener('click', () => { audioEl.pause(); audioEl.removeAttribute('src'); Object.values(urls).forEach(u => URL.revokeObjectURL(u)); urls = {}; tracks = []; cur = -1; dbClear(); $('gmp-now-title').textContent = 'Nothing playing'; renderTracks(); });
  dbAll().then(list => { tracks = list.map(r => ({ id: r.id, name: r.name, blob: r.blob })); if (tracks.length) renderTracks(); restore(); });

  /* ───────────── the bar: one play button for whatever you're listening to ───────────── */
  let paused = null;   /* what the bar paused, so it can bring back the same thing */
  function barToggle() {
    if (pending) { resumePending(); return; }
    const fileOn = !audioEl.paused;
    if (running || fileOn) { paused = { mix: running, file: fileOn }; if (fileOn) audioEl.pause(); if (running) pause(); return; }
    const want = paused || { mix: source === 'mix', file: source === 'files' }; paused = null;
    if (want.file && tracks.length) { if (cur < 0) loadTrack(0); else audioEl.play().catch(() => { }); }
    if (want.mix || !(want.file && tracks.length)) play();
  }

  /* ───────────── what's playing survives a reload ───────────── */
  const NP_KEY = 'studySyncNowPlaying';
  /* after a reload, browsers block sound until the first tap, so playback waits in `pending` */
  function npSave() {
    try { localStorage.setItem(NP_KEY, JSON.stringify({ source, mix: running, file: !audioEl.paused, track: cur >= 0 && tracks[cur] ? tracks[cur].id : null, time: audioEl.currentTime || 0 })); } catch (e) { }
  }
  window.addEventListener('pagehide', () => { if (!pending) npSave(); });
  function restore() {
    let np = null; try { np = JSON.parse(localStorage.getItem(NP_KEY) || 'null'); } catch (e) { }
    if (!np) { ready = true; render(); return; }
    source = np.source === 'files' ? 'files' : 'mix';
    const i = np.track != null ? tracks.findIndex(t => t.id === np.track) : -1;
    if (i >= 0) {
      loadTrack(i, true);
      audioEl.addEventListener('loadedmetadata', () => { if (np.time > 0) audioEl.currentTime = Math.min(np.time, Math.max(0, (audioEl.duration || np.time + 1) - 1)); }, { once: true });
    }
    const wantFile = !!np.file && i >= 0, wantMix = !!np.mix;
    ready = true;
    if (!wantFile && !wantMix) { render(); return; }
    pending = { file: wantFile, mix: wantMix };
    if (wantFile && !wantMix) audioEl.play().then(() => { pending = null; render(); }, () => render());   /* sometimes allowed straight away */
    render();
    const onFirst = e => { if (bar.contains(e.target) || panel.contains(e.target)) return; resumePending(); };
    document.addEventListener('pointerdown', onFirst, true); document.addEventListener('keydown', onFirst, true);
    pending.off = () => { document.removeEventListener('pointerdown', onFirst, true); document.removeEventListener('keydown', onFirst, true); };
  }
  function resumePending() {
    const p = pending; if (!p) return; pending = null; if (p.off) p.off();
    if (p.file && audioEl.paused) audioEl.play().catch(() => { });
    if (p.mix) play();
    render();
  }

  window.SSMixer = {
    play, pause, toggle, duck, isPlaying: () => running,
    preset(name) { const p = PRESETS.find(x => x.name === name); if (p) setPreset(p, true); },   /* start a named mix, e.g. 'Café study' */
    level() { if (!analyser) return 0; const d = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(d); let s = 0; for (let i = 0; i < d.length; i++) { const v = (d[i] - 128) / 128; s += v * v; } return Math.sqrt(s / d.length); },
    set(id, v) { setVol(id, v); syncSliders(); }, sounds: SOUNDS.map(s => s.id),
  };
})();
