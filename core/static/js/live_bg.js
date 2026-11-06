/* Live wallpapers for the Study page.
 *
 * One <canvas id="bg-canvas"> is drawn by a small engine (30 fps, paused while the tab is hidden,
 * auto-lowers quality on slow machines, a still frame when the user prefers reduced motion).
 * Each scene pre-renders its heavy static layers once and animates only what moves.
 *
 *   LiveBG.start(id, theme)   LiveBG.stop()   LiveBG.IDS
 */
(function () {
  'use strict';
  if (window.LiveBG) return;

  const TAU = Math.PI * 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rr = (r, a, b) => a + r() * (b - a);
  function hex(h) {
    h = String(h || '#000').trim().replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)].map(Math.round);
  const rgb = (c, a) => (a == null ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);

  /* ---------- engine state ---------- */
  let canvas = null, ctx = null, raf = 0, curKey = '', curId = '', scene = null;
  let emaMs = 0, W = 0, H = 0, dpr = 1, quality = 1, t = 0, last = 0, A = null, slow = 0, frames = 0, resizeTimer = 0;

  function readPalette(theme) {
    const root = document.getElementById('st-root') || document.documentElement;
    const cs = getComputedStyle(root);
    const triple = n => (cs.getPropertyValue(n) || '').split(',').map(x => parseInt(x, 10));
    const light = theme === 'paper';
    const accent = triple('--accent-rgb'), warm = triple('--warm-rgb');
    // scenes are dark wallpapers: on the light theme keep the dark base and only borrow the accents
    return {
      accent: accent.length === 3 && !accent.some(isNaN) ? accent : [125, 181, 74],
      warm: warm.length === 3 && !warm.some(isNaN) ? warm : [228, 184, 74],
      bg1: light ? [8, 14, 12] : hex(cs.getPropertyValue('--bg1')),
      bg2: light ? [4, 8, 7] : hex(cs.getPropertyValue('--bg2')),
      hill: light ? [[20, 48, 26], [16, 38, 22], [11, 28, 15]]
                  : [hex(cs.getPropertyValue('--hill1')), hex(cs.getPropertyValue('--hill2')), hex(cs.getPropertyValue('--hill3'))],
    };
  }

  function buildAPI(theme) {
    const pal = readPalette(theme);
    const api = {
      ctx, W, H, dpr, pal, q: quality, rng,
      n: c => Math.max(1, Math.round(c * quality)),
      layer(w, h, fn) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.ceil(w * dpr)); c.height = Math.max(1, Math.ceil(h * dpr));
        const g = c.getContext('2d'); g.scale(dpr, dpr); fn(g, w, h);
        c._w = w; c._h = h; return c;
      },
      put(c, x, y, a) {
        if (a != null) ctx.globalAlpha = a;
        ctx.drawImage(c, x || 0, y || 0, c._w, c._h);
        if (a != null) ctx.globalAlpha = 1;
      },
      glow(color, size) {
        return api.layer(size || 64, size || 64, (g, w, h) => {
          const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
          r.addColorStop(0, rgb(color, 1)); r.addColorStop(0.35, rgb(color, 0.4)); r.addColorStop(1, rgb(color, 0));
          g.fillStyle = r; g.fillRect(0, 0, w, h);
        });
      },
      sprite(c, x, y, s) { ctx.drawImage(c, x - s / 2, y - s / 2, s, s); },
      vgrad(g, w, h, stops) {
        const gr = g.createLinearGradient(0, 0, 0, h);
        stops.forEach(([p, c, a]) => gr.addColorStop(p, rgb(c, a)));
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      },
      // smooth rolling ridge; returns the y function so objects can sit on it
      ridge(g, w, h, baseY, amp, seed, color, o) {
        o = o || {};
        const r = rng(seed), ph = [r() * TAU, r() * TAU, r() * TAU], fr = o.freq || 1, ro = o.rough == null ? 1 : o.rough;
        const fy = x => baseY - (Math.sin(x * 0.004 * fr + ph[0]) * amp + Math.sin(x * 0.011 * fr + ph[1]) * amp * 0.45 * ro + Math.sin(x * 0.027 * fr + ph[2]) * amp * 0.18 * ro);
        g.beginPath(); g.moveTo(0, h);
        for (let x = 0; x <= w + 4; x += 4) g.lineTo(x, fy(x));
        g.lineTo(w, h); g.closePath();
        if (Array.isArray(color) && Array.isArray(color[0])) { const gr = g.createLinearGradient(0, baseY - amp * 1.6, 0, h); gr.addColorStop(0, rgb(color[0])); gr.addColorStop(1, rgb(color[1])); g.fillStyle = gr; }
        else g.fillStyle = typeof color === 'string' ? color : rgb(color);
        g.fill();
        return fy;
      },
      // jagged mountain range: sharp peaks, rounded valleys; returns the y function
      peaks(g, w, h, baseY, amp, seed, color, o) {
        o = o || {};
        const r = rng(seed), ph = [r() * TAU, r() * TAU, r() * TAU, r() * TAU], fr = o.freq || 1;
        const fy = x => baseY - amp * ((1 - Math.abs(Math.sin(x * 0.0042 * fr + ph[0]))) * 0.62 + (1 - Math.abs(Math.sin(x * 0.0105 * fr + ph[1]))) * 0.28 + (1 - Math.abs(Math.sin(x * 0.026 * fr + ph[2]))) * 0.1 + Math.sin(x * 0.07 * fr + ph[3]) * 0.015);
        g.beginPath(); g.moveTo(0, h);
        for (let x = 0; x <= w + 3; x += 3) g.lineTo(x, fy(x));
        g.lineTo(w, h); g.closePath();
        const gr = g.createLinearGradient(0, baseY - amp, 0, h); gr.addColorStop(0, rgb(color[0])); gr.addColorStop(1, rgb(color[1])); g.fillStyle = gr; g.fill();
        return fy;
      },
      pine(g, x, y, h, color, snow) {
        const tw = h * 0.36;
        g.fillStyle = color;
        if (h > 140) g.fillRect(x - h * 0.025, y - h * 0.12, h * 0.05, h * 0.12);
        for (let i = 0; i < 5; i++) {
          const k = i / 5, ty = y - h + h * k * 0.74, bw = tw * (0.3 + 0.7 * (k + 0.18)), by = ty + h * 0.3;
          g.beginPath(); g.moveTo(x, ty); g.lineTo(x - bw, by); g.lineTo(x + bw, by); g.closePath(); g.fill();
          if (snow) {
            g.fillStyle = 'rgba(235,243,255,.85)';
            g.beginPath(); g.moveTo(x, ty); g.lineTo(x - bw * 0.62, ty + (by - ty) * 0.62); g.quadraticCurveTo(x, ty + (by - ty) * 0.46, x + bw * 0.62, ty + (by - ty) * 0.62); g.closePath(); g.fill();
            g.fillStyle = color;
          }
        }
      },
      pineRow(g, w, baseY, minH, maxH, seed, color, o) {
        o = o || {};
        const r = rng(seed); let x = -20;
        while (x < w + 20) {
          const h = rr(r, minH, maxH);
          api.pine(g, x, baseY + (o.jitter ? rr(r, -o.jitter, o.jitter) : 0), h, color, o.snow && r() > 0.35);
          x += rr(r, o.gap ? o.gap[0] : 16, o.gap ? o.gap[1] : 34) * (0.55 + (h / maxH) * 0.7);
        }
      },
    };
    return api;
  }

  /* ======================================================================
     SCENES
  ====================================================================== */
  const scenes = {};

  /* ---------- enchanted forest ---------- */
  scenes.forest = {
    init(a) {
      const { W, H, pal } = a, s = (a.s = {}), LW = W * 1.12;
      const fog = mix(pal.bg2, pal.accent, 0.38), blk = [3, 6, 5];
      const bark = d => (d === 0 ? mix(mix(pal.hill[2], fog, 0.5), blk, 0.1) : d === 1 ? mix(mix(pal.hill[1], blk, 0.3), fog, 0.12) : mix(mix(pal.hill[0], blk, 0.55), pal.accent, 0.03));
      s.sky = a.layer(W, H, (g, w, h) => a.vgrad(g, w, h, [[0, mix(pal.bg1, [6, 18, 26], 0.55)], [0.5, mix(pal.bg2, pal.accent, 0.3)], [1, mix(pal.bg2, pal.warm, 0.24)]]));
      s.sun = a.glow(mix(pal.warm, [255, 255, 255], 0.35), 256);

      // one layer of tall trunks (with root flare, bark lines, rim light, moss and branches)
      const trunkLayer = (seed, depth, count, wMin, wMax, baseY) => a.layer(LW, H, (g, w, h) => {
        const r = rng(seed), c = bark(depth);
        for (let i = 0; i < count; i++) {
          const x = (i + 0.15 + r() * 0.7) * w / count, tw = rr(r, wMin, wMax), by = h * baseY + rr(r, -6, 8);
          const lg = g.createLinearGradient(x - tw, 0, x + tw, 0);
          lg.addColorStop(0, rgb(mix(c, blk, 0.35))); lg.addColorStop(0.55, rgb(c)); lg.addColorStop(1, rgb(mix(c, mix(pal.warm, pal.accent, 0.4), depth === 0 ? 0.1 : 0.28)));
          g.fillStyle = lg;
          const lean = (r() - 0.5) * tw * 0.35;
          g.beginPath(); g.moveTo(x - tw * 0.5 - tw * 0.55, by); g.quadraticCurveTo(x - tw * 0.5, by - tw * 1.4, x - tw * 0.42 + lean, by - tw * 4);
          g.lineTo(x - tw * 0.38 + lean, -10); g.lineTo(x + tw * 0.38 + lean, -10); g.lineTo(x + tw * 0.42 + lean, by - tw * 4);
          g.quadraticCurveTo(x + tw * 0.5, by - tw * 1.4, x + tw * 0.5 + tw * 0.55, by); g.closePath(); g.fill();
          if (depth > 0) {
            g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = Math.max(1, tw * 0.035);
            for (let k = 0; k < 4; k++) { const bx = x + (r() - 0.5) * tw * 0.7; g.beginPath(); g.moveTo(bx, by - tw * 0.5); g.bezierCurveTo(bx + 4, h * 0.6, bx - 5, h * 0.3, bx + (r() - 0.5) * 6, 0); g.stroke(); }
            const mg = g.createRadialGradient(x - tw * 0.2, by - tw * 0.8, 0, x - tw * 0.2, by - tw * 0.8, tw * 0.9);
            mg.addColorStop(0, rgb(pal.accent, depth === 2 ? 0.22 : 0.12)); mg.addColorStop(1, rgb(pal.accent, 0)); g.fillStyle = mg; g.fillRect(x - tw * 1.6, by - tw * 2.2, tw * 3.2, tw * 2.8);
          }
          if (depth === 1 && r() > 0.4) { // a branch with a leaf tuft
            const dir = r() > 0.5 ? 1 : -1, y0 = h * rr(r, 0.25, 0.55), len = tw * rr(r, 3, 6);
            g.strokeStyle = rgb(mix(c, blk, 0.2)); g.lineWidth = tw * 0.2; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y0); g.quadraticCurveTo(x + dir * len * 0.5, y0 - len * 0.2, x + dir * len, y0 - len * 0.45); g.stroke();
            for (let k = 0; k < 7; k++) { g.fillStyle = rgb(mix(mix(pal.hill[1], pal.accent, 0.2), blk, 0.25), 0.9); g.beginPath(); g.arc(x + dir * len + (r() - 0.5) * 40, y0 - len * 0.45 + (r() - 0.5) * 26, rr(r, 8, 18), 0, TAU); g.fill(); }
          }
        }
      });
      s.far = trunkLayer(21, 0, 22, 7, 15, 0.8);
      s.mid = trunkLayer(33, 1, 10, 20, 38, 0.92);
      s.near = trunkLayer(47, 2, 4, 52, 96, 1.04);

      // dark leaf ceiling with hanging vines
      s.canopy = a.layer(LW, H, (g, w, h) => {
        const r = rng(61);
        for (let pass = 0; pass < 3; pass++) {
          for (let x = -40; x < w + 40; x += 26) {
            const rad = rr(r, 36, 96), y = rr(r, -30, h * (0.13 + pass * 0.045));
            const gr = g.createRadialGradient(x, y - rad * 0.3, rad * 0.1, x, y, rad);
            gr.addColorStop(0, rgb(mix(pal.hill[1], pal.accent, 0.16 - pass * 0.04), 0.95)); gr.addColorStop(1, rgb(mix(pal.hill[0], blk, 0.5 + pass * 0.12), 0.95));
            g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill();
          }
        }
        g.strokeStyle = rgb(mix(pal.hill[1], blk, 0.2)); g.lineCap = 'round';
        for (let i = 0; i < 26; i++) {
          const x = r() * w, len = rr(r, h * 0.1, h * 0.3); g.lineWidth = rr(r, 1, 2.4);
          g.beginPath(); g.moveTo(x, h * 0.08); g.bezierCurveTo(x + rr(r, -16, 16), h * 0.08 + len * 0.4, x + rr(r, -22, 22), h * 0.08 + len * 0.7, x + rr(r, -10, 10), h * 0.08 + len); g.stroke();
          for (let k = 0; k < 4; k++) { g.fillStyle = rgb(mix(pal.hill[1], pal.accent, 0.25), 0.9); g.beginPath(); g.ellipse(x + rr(r, -8, 8), h * 0.08 + len * (0.3 + k * 0.22), 3.4, 1.8, rr(r, 0, 3), 0, TAU); g.fill(); }
        }
        g.globalCompositeOperation = 'source-atop'; const vgr = g.createLinearGradient(0, 0, 0, h * 0.34); vgr.addColorStop(0, 'rgba(0,0,0,.35)'); vgr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = vgr; g.fillRect(0, 0, w, h * 0.34); g.globalCompositeOperation = 'source-over';
      });

      // mossy floor with grass tufts
      const mushrooms = [];
      s.ground = a.layer(W, H, (g, w, h) => {
        const r = rng(73);
        const gg = g.createLinearGradient(0, h * 0.8, 0, h); gg.addColorStop(0, rgb(mix(pal.hill[1], fog, 0.2), 0)); gg.addColorStop(0.35, rgb(mix(pal.hill[1], blk, 0.35), 0.95)); gg.addColorStop(1, rgb(mix(pal.hill[0], blk, 0.65)));
        g.fillStyle = gg; g.fillRect(0, h * 0.8, w, h * 0.2);
        for (let i = 0; i < 520; i++) {
          const x = r() * w, y = h * rr(r, 0.88, 1), bh = rr(r, 8, 26) * (0.5 + (y / h - 0.88) * 6), lean = (r() - 0.5) * 8;
          g.fillStyle = rgb(mix(mix(pal.hill[1], pal.accent, rr(r, 0.1, 0.5)), blk, rr(r, 0.1, 0.45)));
          g.beginPath(); g.moveTo(x - 1.6, y); g.quadraticCurveTo(x + lean * 0.3, y - bh * 0.6, x + lean, y - bh); g.quadraticCurveTo(x + lean * 0.4, y - bh * 0.5, x + 1.6, y); g.fill();
        }
        for (let i = 0; i < 9; i++) { // little glowing mushrooms
          const x = w * (0.06 + r() * 0.88), y = h * rr(r, 0.93, 0.985), sc = rr(r, 0.7, 1.5);
          g.fillStyle = 'rgba(190,200,190,.8)'; g.fillRect(x - 1.5 * sc, y - 9 * sc, 3 * sc, 9 * sc);
          g.fillStyle = rgb(mix(pal.accent, i % 2 ? [150, 120, 255] : [90, 255, 220], 0.5), 0.95); g.beginPath(); g.ellipse(x, y - 9 * sc, 8 * sc, 5 * sc, 0, Math.PI, TAU); g.fill();
          mushrooms.push({ x, y: y - 9 * sc, sc, c: i % 2 });
        }
      });
      s.mush = mushrooms;
      s.mg = [a.glow(mix(pal.accent, [90, 255, 220], 0.55), 64), a.glow([170, 130, 255], 64)];
      s.mote = a.glow([255, 244, 214], 32); s.spore = [a.glow(mix(pal.accent, [120, 255, 230], 0.5), 32), a.glow([255, 150, 220], 32)]; s.fly = a.glow(mix(pal.warm, [230, 255, 130], 0.5), 32);
      s.fogsp = a.layer(512, 160, (g, w, h) => { g.save(); g.scale(1, h / w); const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, rgb(fog, 0.6)); gr.addColorStop(1, rgb(fog, 0)); g.fillStyle = gr; g.fillRect(0, 0, w, w); g.restore(); });
      const r = rng(5);
      s.rays = Array.from({ length: 8 }, (_, i) => ({ x: W * (0.38 + i * 0.095) + r() * 30, w: 30 + r() * 80, sp: 0.12 + r() * 0.2, ph: r() * TAU }));
      s.motes = Array.from({ length: a.n(46) }, () => ({ x: W * (0.2 + r() * 0.8), y: r() * H * 0.9, vx: -3 - r() * 8, vy: 2 + r() * 6, sz: 5 + r() * 9, ph: r() * TAU, sp: 0.5 + r() * 1.5 }));
      s.spores = Array.from({ length: a.n(34) }, () => ({ x: r() * W, y: H * (0.5 + r() * 0.5), vy: -(8 + r() * 18), ph: r() * TAU, sw: 0.4 + r() * 0.8, sz: 8 + r() * 14, c: r() > 0.7 ? 1 : 0 }));
      s.flies = Array.from({ length: a.n(26) }, () => ({ x: r() * W, y: H * (0.4 + r() * 0.5), ax: 30 + r() * 60, ay: 14 + r() * 30, sp: 0.2 + r() * 0.4, ph: r() * TAU, bl: 0.6 + r() * 1.4, sz: 14 + r() * 14 }));
      s.leaves = Array.from({ length: a.n(14) }, () => ({ x: r() * W, y: r() * H, v: 16 + r() * 26, sw: 0.6 + r() * 1.1, ph: r() * TAU, rot: r() * TAU, sp: 0.6 + r() * 1.4, sz: 3 + r() * 4, c: r() > 0.5 }));
      s.fogs = Array.from({ length: 4 }, (_, i) => ({ y: H * (0.55 + i * 0.1), sp: 5 + r() * 9, off: r() * W, sc: 1 + r() * 0.8, al: 0.1 + r() * 0.1 }));
      s.ferns = Array.from({ length: 10 }, (_, i) => ({ x: W * (0.03 + i * 0.105 + r() * 0.04), y: H * (0.97 + r() * 0.04), sc: 0.7 + r() * 0.9, ph: r() * TAU, n: 7 + Math.floor(r() * 3) }));
    },
    draw(a, t, dt) {
      const { ctx, W, H, s, pal } = a;
      const slide = (k, amp) => -W * 0.06 + Math.sin(t * 0.04 + k) * W * amp;
      a.put(s.sky, 0, 0);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55; a.sprite(s.sun, W * 0.78, H * 0.04, H * 1.1); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      a.put(s.far, slide(0, 0.012), 0);
      const fogband = (i, mul) => { ctx.globalCompositeOperation = 'screen'; s.fogs.forEach((f, k) => { if ((k + i) % 2) return; const x = ((f.off * (1 + i * 0.7) + t * f.sp * (1 + i * 0.5)) % (W + 760)) - 650; ctx.globalAlpha = f.al * mul; ctx.drawImage(s.fogsp, x, f.y + i * H * 0.08, 760 * f.sc, 190 * f.sc); }); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; };
      fogband(0, 0.7);
      a.put(s.mid, slide(1.7, 0.02), 0);
      // light shafts + dust
      ctx.globalCompositeOperation = 'lighter';
      s.rays.forEach(rw => {
        const al = 0.05 + 0.05 * (0.5 + 0.5 * Math.sin(t * rw.sp + rw.ph)), x0 = rw.x + Math.sin(t * 0.07 + rw.ph) * 20, gr = ctx.createLinearGradient(x0, 0, x0 - H * 0.55, H);
        gr.addColorStop(0, rgb(mix(pal.warm, [255, 255, 255], 0.5), al * 1.5)); gr.addColorStop(1, rgb(pal.warm, 0));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x0, -10); ctx.lineTo(x0 + rw.w, -10); ctx.lineTo(x0 - H * 0.55 + rw.w * 2.2, H); ctx.lineTo(x0 - H * 0.55, H); ctx.closePath(); ctx.fill();
      });
      s.motes.forEach(m => {
        m.x += (m.vx + Math.sin(t * m.sp + m.ph) * 6) * dt; m.y += (m.vy + Math.cos(t * m.sp * 0.7 + m.ph) * 4) * dt;
        if (m.x < -20 || m.y > H + 10) { m.x = W * (0.4 + Math.random() * 0.7); m.y = -10; }
        const b = 0.5 + 0.5 * Math.sin(t * m.sp * 1.7 + m.ph); ctx.globalAlpha = 0.18 + 0.6 * b * b; a.sprite(s.mote, m.x, m.y, m.sz);
      });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      a.put(s.near, slide(3.1, 0.035), 0);
      fogband(1, 0.9);
      ctx.save(); const k = Math.sin(t * 0.4) * 0.0035; ctx.transform(1, 0, k, 1, 0, 0); a.put(s.canopy, -W * 0.06 + Math.sin(t * 0.05) * W * 0.012, 0); ctx.restore();
      a.put(s.ground, 0, 0);
      // ferns swaying in the breeze
      ctx.lineCap = 'round';
      s.ferns.forEach(f => {
        for (let i = 0; i < f.n; i++) {
          const u = i / (f.n - 1), ang = (-1.25 + u * 2.5) + Math.sin(t * 0.9 + f.ph + i) * 0.045, len = (46 + 24 * Math.cos((u - 0.5) * 2.6)) * f.sc;
          const ex = f.x + Math.sin(ang) * len, ey = f.y - Math.cos(ang) * len, cx = f.x + Math.sin(ang) * len * 0.45, cy = f.y - Math.cos(ang) * len * 0.8;
          ctx.strokeStyle = rgb(mix(mix(pal.hill[1], pal.accent, 0.35), [2, 8, 4], i % 2 ? 0.25 : 0.05), 0.95); ctx.lineWidth = 2.4 * f.sc;
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke();
          ctx.lineWidth = 1.3 * f.sc; for (let j = 1; j < 6; j++) { const q = j / 6, px = (1 - q) * (1 - q) * f.x + 2 * (1 - q) * q * cx + q * q * ex, py = (1 - q) * (1 - q) * f.y + 2 * (1 - q) * q * cy + q * q * ey, sz = (1 - q * 0.6) * 11 * f.sc; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - Math.cos(ang) * sz, py - Math.sin(ang) * sz * 0.6); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(ang) * sz, py + Math.sin(ang) * sz * 0.6); ctx.stroke(); }
        }
      });
      ctx.globalCompositeOperation = 'lighter';
      s.mush.forEach((m, i) => { const p = 0.5 + 0.5 * Math.sin(t * 1.3 + i * 1.9); ctx.globalAlpha = 0.45 + 0.5 * p; a.sprite(s.mg[m.c], m.x, m.y, 46 * m.sc + p * 10); });
      s.spores.forEach(p => { p.y += p.vy * dt; if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; } const b = 0.5 + 0.5 * Math.sin(t * 1.4 + p.ph); ctx.globalAlpha = 0.15 + 0.7 * b; a.sprite(s.spore[p.c], p.x + Math.sin(t * p.sw + p.ph) * 24, p.y, p.sz * (0.8 + 0.4 * b)); });
      s.flies.forEach(f => { const x = f.x + Math.sin(t * f.sp + f.ph) * f.ax, y = f.y + Math.cos(t * f.sp * 1.3 + f.ph) * f.ay, b = 0.5 + 0.5 * Math.sin(t * f.bl + f.ph * 2); ctx.globalAlpha = 0.15 + 0.85 * b * b; a.sprite(s.fly, x, y, f.sz * (0.7 + 0.5 * b)); });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      s.leaves.forEach(l => {
        l.y += l.v * dt; l.rot += l.sp * dt; if (l.y > H + 10) { l.y = -10; l.x = Math.random() * W; }
        const x = l.x + Math.sin(t * l.sw + l.ph) * 34;
        ctx.save(); ctx.translate(x, l.y); ctx.rotate(l.rot); ctx.scale(1, 0.55 + 0.45 * Math.cos(t * l.sp + l.ph));
        ctx.fillStyle = l.c ? rgb(pal.warm, 0.75) : rgb(pal.accent, 0.7); ctx.beginPath(); ctx.ellipse(0, 0, l.sz, l.sz * 0.55, 0, 0, TAU); ctx.fill(); ctx.restore();
      });
      const vg = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.35, W / 2, H * 0.5, H * 0.95); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.4)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    },
  };

  /* ---------- rainstorm ---------- */
  scenes.rain = {
    init(a) {
      const { W, H, pal } = a, s = (a.s = {}), r = rng(3);
      s.sky = a.layer(W, H, (g, w, h) => a.vgrad(g, w, h, [[0, [10, 16, 26]], [0.6, mix([24, 38, 56], pal.accent, 0.08)], [1, [30, 46, 62]]]));
      s.far = a.layer(W, H, (g, w, h) => {
        // distant skyline of soft towers
        let x = 0; while (x < w) { const bw = rr(r, 22, 60), bh = rr(r, h * 0.12, h * 0.34); g.fillStyle = 'rgba(14,22,34,.95)'; g.fillRect(x, h * 0.78 - bh, bw, bh + h * 0.3);
          for (let k = 0; k < 6; k++) if (r() > 0.55) { g.fillStyle = rgb(pal.warm, 0.35 + r() * 0.3); g.fillRect(x + rr(r, 4, bw - 8), h * 0.78 - bh + rr(r, 6, bh - 8), 3, 4); } x += bw + rr(r, 2, 10); } });
      s.near = a.layer(W, H, (g, w, h) => { a.ridge(g, w, h, h * 0.93, h * 0.035, 11, [8, 14, 22], { freq: 0.6 }); });
      s.bokeh = Array.from({ length: a.n(14) }, () => ({ x: r() * W, y: H * (0.45 + r() * 0.4), r: 14 + r() * 40, a: 0.05 + r() * 0.1, sp: 0.1 + r() * 0.2, ph: r() * TAU, c: r() > 0.5 }));
      s.bk = [a.glow(pal.warm, 64), a.glow(mix(pal.accent, [200, 220, 255], 0.5), 64)];
      s.drops = [0, 1, 2].map(li => Array.from({ length: a.n([110, 70, 36][li]) }, () => ({ x: r() * (W + 200), y: r() * H, v: [520, 820, 1250][li] * (0.85 + r() * 0.3) })));
      s.ripples = []; s.bolt = null; s.flash = 0; s.next = 5 + r() * 6; s.flick = 0;
      s.mist = a.layer(W, H * 0.3, (g, w, h) => a.vgrad(g, w, h, [[0, [150, 175, 200], 0], [1, [150, 175, 200], 0.22]]));
      s.wind = 0.22;
    },
    draw(a, t, dt) {
      const { ctx, W, H, s } = a;
      a.put(s.sky, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      s.bokeh.forEach(b => { ctx.globalAlpha = b.a * (0.7 + 0.3 * Math.sin(t * b.sp * 3 + b.ph)); a.sprite(s.bk[b.c ? 0 : 1], b.x + Math.sin(t * b.sp + b.ph) * 18, b.y, b.r * 2); });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      a.put(s.far, 0, 0);
      a.put(s.near, 0, 0);
      ctx.save(); ctx.lineCap = 'round';
      const groundY = H * 0.93;
      s.drops.forEach((layer, li) => {
        ctx.lineWidth = [0.7, 1.1, 1.7][li]; ctx.strokeStyle = `rgba(190,210,235,${[0.16, 0.26, 0.42][li]})`;
        const len = [14, 24, 38][li]; ctx.beginPath();
        layer.forEach(d => {
          d.y += d.v * dt; d.x -= d.v * s.wind * dt;
          if (d.y > (li === 2 ? groundY + Math.random() * H * 0.06 : H + 20)) {
            if (li === 2 && s.ripples.length < 40) s.ripples.push({ x: d.x, y: d.y, age: 0 });
            d.y = -30 - Math.random() * 80; d.x = Math.random() * (W + 200);
          }
          ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + len * s.wind, d.y - len);
        });
        ctx.stroke();
      });
      ctx.restore();
      // ripples
      ctx.lineWidth = 1;
      for (let i = s.ripples.length - 1; i >= 0; i--) {
        const p = s.ripples[i]; p.age += dt; const k = p.age / 0.55;
        if (k >= 1) { s.ripples.splice(i, 1); continue; }
        ctx.strokeStyle = `rgba(200,220,245,${0.35 * (1 - k)})`; ctx.beginPath(); ctx.ellipse(p.x, p.y, 3 + k * 16, 1 + k * 4.5, 0, 0, TAU); ctx.stroke();
      }
      ctx.drawImage(s.mist, 0, H * 0.7, W, H * 0.3);
      // lightning
      if (t > s.next) { s.flash = 1; s.next = t + 7 + Math.random() * 11; s.flick = 2;
        const pts = []; let x = W * (0.15 + Math.random() * 0.7), y = -10; pts.push([x, y]);
        while (y < H * 0.62) { y += 18 + Math.random() * 30; x += (Math.random() - 0.5) * 60; pts.push([x, y]); }
        s.bolt = pts; }
      if (s.flash > 0) {
        if (s.bolt && s.flash > 0.55) { ctx.save(); ctx.shadowColor = 'rgba(190,210,255,.9)'; ctx.shadowBlur = 18; ctx.strokeStyle = `rgba(235,242,255,${s.flash})`; ctx.lineWidth = 2.2; ctx.beginPath(); s.bolt.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); ctx.restore(); }
        ctx.fillStyle = `rgba(205,222,255,${s.flash * 0.32})`; ctx.fillRect(0, 0, W, H);
        s.flash -= dt * 3.2;
        if (s.flash < 0.45 && s.flick > 0) { s.flick--; s.flash = 0.8; }
      }
    },
  };

  /* ---------- starry night ---------- */
  scenes.stars = {
    init(a) {
      const { W, H, pal } = a, s = (a.s = {}), r = rng(9), D = Math.hypot(W, H) * 1.15;
      s.D = D;
      s.sky = a.layer(W, H, (g, w, h) => a.vgrad(g, w, h, [[0, [2, 4, 14]], [0.6, [9, 18, 46]], [1, mix([24, 34, 78], pal.accent, 0.12)]]));
      s.field = a.layer(D, D, (g, w, h) => {
        const tint = [[255, 255, 255], [200, 220, 255], [255, 236, 200], [255, 205, 205]];
        g.translate(w / 2, h / 2); g.rotate(-0.42);
        // milky way band
        [[0.09, 'rgba(120,110,200,.13)'], [0.04, 'rgba(170,160,240,.13)']].forEach(([wd, col]) => { const gr = g.createLinearGradient(0, -D * wd, 0, D * wd); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(-D / 2, -D * wd, D, D * wd * 2); });
        for (let i = 0; i < 3200 * a.q; i++) { const u = (r() + r() + r() - 1.5) * D * 0.09, v = (r() - 0.5) * D; g.fillStyle = `rgba(215,222,255,${0.15 + r() * 0.55})`; g.fillRect(v, u, 1.3, 1.3); }
        for (let i = 0; i < 6; i++) { const cx = (r() - 0.5) * D * 0.8, cy = (r() - 0.5) * D * 0.06, rad = D * (0.04 + r() * 0.05), gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad); const c = [[150,120,230],[100,150,240],[220,120,200]][i % 3]; gr.addColorStop(0, rgb(c, 0.1)); gr.addColorStop(1, rgb(c, 0)); g.fillStyle = gr; g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2); }
        for (let i = 0; i < 520 * a.q; i++) { const x = (r() - 0.5) * D, y = (r() - 0.5) * D, c = tint[Math.floor(r() * 4)], sz = r() > 0.93 ? 2.2 : r() > 0.7 ? 1.5 : 0.95; g.fillStyle = rgb(c, 0.55 + r() * 0.45); g.beginPath(); g.arc(x, y, sz, 0, TAU); g.fill(); }
      });
      s.twink = Array.from({ length: a.n(110) }, () => ({ x: (r() - 0.5) * D, y: (r() - 0.5) * D, sp: 0.6 + r() * 2.2, ph: r() * TAU, c: [[255,255,255],[190,215,255],[255,235,200]][Math.floor(r() * 3)], sz: 3 + r() * 6 }));
      s.tg = a.glow([255, 255, 255], 32);
      s.moon = a.glow([200, 215, 255], 256);
      s.hills = a.layer(W, H, (g, w, h) => {
        a.ridge(g, w, h, h * 0.82, h * 0.1, 31, [[22, 30, 56], [10, 14, 30]], { freq: 0.7 });
        a.ridge(g, w, h, h * 0.9, h * 0.07, 17, [[8, 12, 24], [3, 5, 12]], { freq: 1.1 });
        a.pineRow(g, w, h * 1.02, h * 0.1, h * 0.2, 6, 'rgb(3,5,11)', { gap: [30, 70], jitter: 4 });
      });
      s.clouds = Array.from({ length: 3 }, (_, i) => ({ y: H * (0.1 + i * 0.1), x: r() * W, sp: 6 + r() * 7, sc: 1 + r() }));
      s.cloud = a.layer(420, 120, (g, w, h) => { for (let i = 0; i < 8; i++) { const x = w * (0.28 + i * 0.062), y = h * (0.42 + r() * 0.16), rad = h * (0.26 + r() * 0.14); g.save(); g.translate(x, y); g.scale(2.3, 1); const gr = g.createRadialGradient(0, 0, 0, 0, 0, rad); gr.addColorStop(0, 'rgba(150,170,215,.42)'); gr.addColorStop(1, 'rgba(150,170,215,0)'); g.fillStyle = gr; g.fillRect(-rad, -rad, rad * 2, rad * 2); g.restore(); } });
      s.shoot = []; s.nextShoot = 2 + r() * 3;
    },
    draw(a, t, dt) {
      const { ctx, W, H, s } = a;
      a.put(s.sky, 0, 0);
      ctx.save(); ctx.translate(W * 0.68, H * 1.05); ctx.rotate(t * 0.0035);
      ctx.drawImage(s.field, -s.D / 2, -s.D / 2, s.D, s.D);
      ctx.globalCompositeOperation = 'lighter';
      s.twink.forEach(st => { const b = 0.5 + 0.5 * Math.sin(t * st.sp + st.ph); ctx.globalAlpha = 0.25 + 0.75 * b * b; ctx.drawImage(s.tg, st.x - st.sz, st.y - st.sz, st.sz * 2, st.sz * 2); });
      ctx.restore(); ctx.globalAlpha = 1;
      // moon
      const mx = W * 0.8, my = H * 0.2;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; a.sprite(s.moon, mx, my, 280); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      const mg = ctx.createRadialGradient(mx - 8, my - 8, 4, mx, my, 34); mg.addColorStop(0, '#fbfdff'); mg.addColorStop(1, '#cdd8ee'); ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, my, 32, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(150,165,200,.28)'; [[-9, -5, 7], [10, 6, 5], [-2, 12, 4], [12, -9, 3.5]].forEach(([dx, dy, rad]) => { ctx.beginPath(); ctx.arc(mx + dx, my + dy, rad, 0, TAU); ctx.fill(); });
      // drifting clouds
      s.clouds.forEach(c => { const x = ((c.x + t * c.sp) % (W + 520)) - 460; ctx.globalAlpha = 0.5; ctx.drawImage(s.cloud, x, c.y, 420 * c.sc, 120 * c.sc); }); ctx.globalAlpha = 1;
      // shooting stars
      if (t > s.nextShoot) { s.nextShoot = t + 4 + Math.random() * 7; const ang = 0.35 + Math.random() * 0.3; s.shoot.push({ x: Math.random() * W * 0.8, y: Math.random() * H * 0.35, vx: Math.cos(ang) * 900, vy: Math.sin(ang) * 900, age: 0 }); }
      for (let i = s.shoot.length - 1; i >= 0; i--) {
        const p = s.shoot[i]; p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.age > 0.9) { s.shoot.splice(i, 1); continue; }
        const al = Math.sin(clamp(p.age / 0.9, 0, 1) * Math.PI), gr = ctx.createLinearGradient(p.x, p.y, p.x - p.vx * 0.16, p.y - p.vy * 0.16);
        gr.addColorStop(0, `rgba(255,255,255,${al})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.strokeStyle = gr; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.16, p.y - p.vy * 0.16); ctx.stroke();
      }
      a.put(s.hills, 0, 0);
    },
  };

  /* ---------- aurora over a lake ---------- */
  scenes.aurora = {
    init(a) {
      const { W, H, pal } = a, s = (a.s = {}), r = rng(13);
      const hy = (s.hy = Math.round(H * 0.7));
      const ridgeFns = {};
      // sky + stars + milky way (static)
      s.sky = a.layer(W, hy, (g, w, h) => {
        a.vgrad(g, w, h, [[0, [2, 4, 12]], [0.65, [7, 18, 38]], [1, [14, 34, 58]]]);
        g.save(); g.translate(w * 0.62, h * 0.35); g.rotate(-0.5);
        const mg = g.createLinearGradient(0, -h * 0.28, 0, h * 0.28); mg.addColorStop(0, 'rgba(120,130,200,0)'); mg.addColorStop(0.5, 'rgba(150,160,225,.12)'); mg.addColorStop(1, 'rgba(120,130,200,0)'); g.fillStyle = mg; g.fillRect(-w, -h * 0.28, w * 2, h * 0.56);
        for (let i = 0; i < 700 * a.q; i++) { g.fillStyle = `rgba(215,225,255,${0.12 + r() * 0.5})`; g.fillRect((r() - 0.5) * w * 1.6, (r() + r() + r() - 1.5) * h * 0.16, 1.2, 1.2); }
        g.restore();
        for (let i = 0; i < 230 * a.q; i++) { const c = [[255, 255, 255], [190, 215, 255], [255, 236, 205]][Math.floor(r() * 3)]; g.fillStyle = rgb(c, 0.4 + r() * 0.6); const sz = r() > 0.94 ? 1.9 : r() > 0.7 ? 1.3 : 0.9; g.fillRect(r() * w, r() * h * 0.82, sz, sz); }
      });
      s.twink = Array.from({ length: a.n(60) }, () => ({ x: r() * W, y: r() * hy * 0.8, sp: 0.7 + r() * 2.2, ph: r() * TAU, sz: 3 + r() * 5 }));
      s.tg = a.glow([255, 255, 255], 32);
      // aurora colour ribbons
      const mk = c => a.layer(2, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, rgb(c, 0)); gr.addColorStop(0.18, rgb(c, 0.16)); gr.addColorStop(0.5, rgb(c, 0.85)); gr.addColorStop(0.62, rgb(mix(c, [255, 255, 255], 0.35), 0.9)); gr.addColorStop(0.85, rgb(c, 0.22)); gr.addColorStop(1, rgb(c, 0)); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
      s.rib = [
        { sp: mk(mix([70, 255, 165], pal.accent, 0.2)), base: 0.27, f1: 1.3, a1: 0.07, f2: 3.1, a2: 0.025, s1: 0.18, s2: 0.31, h0: 0.36, g1: 2.2, g2: 3.4, al: 0.95 },
        { sp: mk(mix([40, 215, 230], pal.accent, 0.12)), base: 0.34, f1: 0.9, a1: 0.06, f2: 2.4, a2: 0.03, s1: 0.13, s2: 0.27, h0: 0.3, g1: 1.7, g2: 2.6, al: 0.75 },
        { sp: mk(mix([175, 95, 245], pal.warm, 0.2)), base: 0.22, f1: 1.7, a1: 0.05, f2: 3.8, a2: 0.02, s1: 0.22, s2: 0.36, h0: 0.24, g1: 2.9, g2: 4.1, al: 0.6 },
        { sp: mk([255, 110, 170]), base: 0.17, f1: 2.3, a1: 0.04, f2: 4.4, a2: 0.015, s1: 0.28, s2: 0.4, h0: 0.14, g1: 3.6, g2: 5.2, al: 0.32 },
      ];
      // mountains with snow-lit peaks (they sit inside the reflected buffer too)
      s.mtn = a.layer(W, hy, (g, w, h) => {
        const rim = (fy, col, wd) => { g.strokeStyle = col; g.lineWidth = wd; g.lineJoin = 'round'; g.beginPath(); for (let x = 0; x <= w; x += 3) x ? g.lineTo(x, fy(x)) : g.moveTo(x, fy(x)); g.stroke(); };
        const f1 = a.peaks(g, w, h, h * 0.84, h * 0.34, 41, [[96, 122, 176], [12, 20, 40]], { freq: 0.75 });
        rim(f1, 'rgba(206,224,255,.6)', 1.4);
        // snow on the high peaks
        g.save(); g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 3) g.lineTo(x, f1(x)); g.lineTo(w, h); g.closePath(); g.clip();
        const sn2 = g.createLinearGradient(0, h * 0.46, 0, h * 0.66); sn2.addColorStop(0, 'rgba(226,238,255,.5)'); sn2.addColorStop(1, 'rgba(226,238,255,0)'); g.fillStyle = sn2; g.fillRect(0, h * 0.4, w, h * 0.3); g.restore();
        const f2 = a.peaks(g, w, h, h * 0.92, h * 0.17, 43, [[34, 50, 82], [6, 10, 22]], { freq: 1.25 });
        rim(f2, 'rgba(150,180,228,.3)', 1.2);
        const hz = g.createLinearGradient(0, h * 0.78, 0, h); hz.addColorStop(0, 'rgba(70,130,140,0)'); hz.addColorStop(1, 'rgba(70,140,150,.3)'); g.fillStyle = hz; g.fillRect(0, h * 0.78, w, h * 0.22);
      });
      // reflection source = sky + aurora + mountains, redrawn each frame
      s.buf = a.layer(W, hy, () => {}); s.bg = s.buf.getContext('2d');
      // shoreline: dark pines, grass, tent
      s.shore = a.layer(W, H, (g, w, h) => {
        g.fillStyle = 'rgb(5,9,16)'; g.fillRect(0, hy - 1, w, 7);
        a.pineRow(g, w, hy + 4, h * 0.07, h * 0.15, 8, 'rgb(3,6,12)', { gap: [11, 26] });
        // foreground bank + big pines framing the scene
        a.ridge(g, w, h, h * 0.97, h * 0.025, 83, [[6, 10, 18], [2, 4, 8]], { freq: 0.4 });
        [[w * 0.03, h * 0.5], [w * 0.11, h * 0.34], [w * 0.95, h * 0.46], [w * 0.88, h * 0.3]].forEach(([x, ht]) => a.pine(g, x, h * 1.03, ht, 'rgb(2,4,8)'));
      });
      s.tent = { x: W * 0.24, y: H * 0.955 };
      s.warm = a.glow([255, 170, 80], 128); s.spark = a.glow([255, 210, 130], 16);
      s.fog = a.layer(512, 120, (g, w, h) => { g.save(); g.scale(1, h / w); const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(170,215,225,.5)'); gr.addColorStop(1, 'rgba(170,215,225,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); g.restore(); });
      s.fogs = Array.from({ length: 3 }, () => ({ x: r() * W, y: hy + r() * H * 0.06, sp: 4 + r() * 6, sc: 1 + r() })); s.ripples = []; s.nextRip = 1; s.shoot = []; s.nextShoot = 3 + r() * 4; s.fire = [];
    },
    draw(a, t, dt) {
      const { ctx, W, H, s } = a, hy = s.hy, bg = s.bg;
      // ---- build the sky buffer ----
      bg.globalCompositeOperation = 'source-over'; bg.globalAlpha = 1; bg.drawImage(s.sky, 0, 0, W, hy);
      bg.globalCompositeOperation = 'lighter';
      s.twink.forEach(st => { const b = 0.5 + 0.5 * Math.sin(t * st.sp + st.ph); bg.globalAlpha = 0.2 + 0.8 * b * b; bg.drawImage(s.tg, st.x - st.sz, st.y - st.sz, st.sz * 2, st.sz * 2); });
      s.rib.forEach(rb => {
        for (let x = 0; x < W; x += 4) {
          const u = x / W, cy = hy * (rb.base + Math.sin(u * TAU * rb.f1 + t * rb.s1) * rb.a1 + Math.sin(u * TAU * rb.f2 - t * rb.s2) * rb.a2);
          const hh = hy * rb.h0 * (0.62 + 0.38 * Math.sin(u * TAU * rb.g1 + t * rb.s1 * 1.7)) * (1 + 0.08 * Math.sin(u * 60 + t * 2));
          bg.globalAlpha = clamp((0.5 + 0.42 * Math.sin(u * TAU * rb.g2 + t * rb.s2 * 1.3)) * rb.al * 0.66, 0, 1);
          bg.drawImage(rb.sp, 0, 0, 2, 256, x - 3, cy - hh * 0.55, 10, hh);
        }
      });
      bg.globalAlpha = 1; bg.globalCompositeOperation = 'source-over';
      bg.drawImage(s.mtn, 0, 0, W, hy);
      if (t > s.nextShoot) { s.nextShoot = t + 6 + Math.random() * 8; const ang = 0.3 + Math.random() * 0.3; s.shoot.push({ x: Math.random() * W * 0.6, y: Math.random() * hy * 0.3, vx: Math.cos(ang) * 800, vy: Math.sin(ang) * 800, age: 0 }); }
      for (let i = s.shoot.length - 1; i >= 0; i--) {
        const p = s.shoot[i]; p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.age > 0.8) { s.shoot.splice(i, 1); continue; }
        const al = Math.sin(clamp(p.age / 0.8, 0, 1) * Math.PI), gr = bg.createLinearGradient(p.x, p.y, p.x - p.vx * 0.15, p.y - p.vy * 0.15); gr.addColorStop(0, `rgba(255,255,255,${al})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        bg.strokeStyle = gr; bg.lineWidth = 1.8; bg.beginPath(); bg.moveTo(p.x, p.y); bg.lineTo(p.x - p.vx * 0.15, p.y - p.vy * 0.15); bg.stroke();
      }
      ctx.drawImage(s.buf, 0, 0, W, hy);

      // ---- the lake: dark water + wavy mirror image of the sky ----
      const lh = H - hy;
      const wg = ctx.createLinearGradient(0, hy, 0, H); wg.addColorStop(0, 'rgb(10,28,42)'); wg.addColorStop(1, 'rgb(2,6,12)'); ctx.fillStyle = wg; ctx.fillRect(0, hy, W, lh);
      const dpr = a.dpr;
      const sq = hy / lh; // the whole sky is mirrored, squashed into the lake
      for (let y = 0; y < lh; y += 3) {
        const k = y / lh, srcH = 3 * sq, srcY = clamp(hy - (y + 3) * sq, 0, hy - srcH), off = Math.sin(y * 0.13 + t * 1.5) * (0.8 + k * 6) + Math.sin(y * 0.05 - t * 0.7) * (1 + k * 4);
        ctx.globalAlpha = 0.62 * (1 - k * 0.7);
        ctx.drawImage(s.buf, 0, srcY * dpr, W * dpr, srcH * dpr, off, hy + y, W, 3);
      }
      ctx.globalAlpha = 1;
      // ripples + low mist
      if (t > s.nextRip) { s.nextRip = t + 0.6 + Math.random() * 1.6; s.ripples.push({ x: Math.random() * W, y: hy + 14 + Math.random() * (lh - 40), age: 0 }); }
      ctx.lineWidth = 1;
      for (let i = s.ripples.length - 1; i >= 0; i--) { const p = s.ripples[i]; p.age += dt; const k = p.age / 2.2; if (k >= 1) { s.ripples.splice(i, 1); continue; } ctx.strokeStyle = `rgba(190,230,235,${0.22 * (1 - k)})`; ctx.beginPath(); ctx.ellipse(p.x, p.y, 4 + k * 40, 1 + k * 7, 0, 0, TAU); ctx.stroke(); }
      ctx.globalCompositeOperation = 'screen'; s.fogs.forEach(f => { const x = ((f.x + t * f.sp) % (W + 700)) - 600; ctx.globalAlpha = 0.16; ctx.drawImage(s.fog, x, f.y, 700 * f.sc, 120 * f.sc); }); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      a.put(s.shore, 0, 0);
      // ---- tent with a warm glow and a little fire ----
      const { x: tx, y: ty } = s.tent, fl = 0.8 + 0.1 * Math.sin(t * 11) + 0.08 * Math.sin(t * 6.3) + 0.06 * Math.sin(t * 23);
      ctx.fillStyle = 'rgb(8,10,18)'; ctx.beginPath(); ctx.moveTo(tx - 46, ty); ctx.lineTo(tx, ty - 44); ctx.lineTo(tx + 46, ty); ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,${150 + 40 * fl},70,${0.55 * fl})`; ctx.beginPath(); ctx.moveTo(tx - 14, ty); ctx.lineTo(tx, ty - 24); ctx.lineTo(tx + 14, ty); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.55 * fl; a.sprite(s.warm, tx + 70, ty + 4, 150); a.sprite(s.warm, tx, ty - 14, 110); ctx.globalAlpha = 1;
      if (Math.random() < dt * 12) s.fire.push({ x: tx + 70 + (Math.random() - 0.5) * 6, y: ty, vx: (Math.random() - 0.5) * 16, vy: -(30 + Math.random() * 40), age: 0, life: 0.7 + Math.random() * 0.8 });
      for (let i = s.fire.length - 1; i >= 0; i--) { const p = s.fire[i]; p.age += dt; if (p.age > p.life) { s.fire.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; ctx.globalAlpha = (1 - p.age / p.life) * 0.9; a.sprite(s.spark, p.x, p.y, 9 * (1 - p.age / p.life) + 3); }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      // a glowing reflection of the camp on the water
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.18 * fl; ctx.drawImage(s.warm, tx + 44, ty - 70, 52, 80); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    },
  };

  /* ---------- sunset ocean ---------- */
  scenes.ocean = {
    init(a) {
      const { W, H, pal } = a, s = (a.s = {}), r = rng(17);
      const hy = (s.hy = Math.round(H * 0.56)); s.sx = W * 0.6;
      s.sky = a.layer(W, hy + 2, (g, w, h) => {
        a.vgrad(g, w, h, [[0, [14, 18, 64]], [0.28, mix([70, 48, 120], pal.accent, 0.06)], [0.55, [168, 84, 132]], [0.8, [244, 132, 104]], [0.93, [255, 184, 112]], [1, [255, 214, 150]]]);
        for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,240,230,${0.15 + r() * 0.5})`; g.fillRect(r() * w, r() * h * 0.4, 1.2, 1.2); }
      });
      s.sun = a.glow([255, 190, 120], 256); s.sunHot = a.glow([255, 236, 190], 128);
      // sun-lit clouds: dark violet tops, glowing orange undersides, three strata
      const cloud = (w, h, seed, puffs, flat) => a.layer(w, h, (g) => {
        const rr_ = rng(seed);
        for (let i = 0; i < puffs; i++) {
          const x = w * (0.12 + rr_() * 0.76), rad = h * rr(rr_, 0.16, 0.38) * (flat ? 0.7 : 1), y = h * (flat ? 0.55 : 0.68) - rad * rr(rr_, 0, 0.9);
          const gr = g.createRadialGradient(x, y - rad * 0.3, rad * 0.1, x, y, rad);
          gr.addColorStop(0, 'rgba(112,78,136,.95)'); gr.addColorStop(1, 'rgba(70,46,104,.9)');
          g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rad * (flat ? 2.6 : 1.3), rad, 0, 0, TAU); g.fill();
        }
        g.globalCompositeOperation = 'source-atop';
        const lit = g.createLinearGradient(0, h * 0.25, 0, h);
        lit.addColorStop(0, 'rgba(255,170,120,0)'); lit.addColorStop(0.65, 'rgba(255,150,100,.55)'); lit.addColorStop(1, 'rgba(255,200,120,.95)');
        g.fillStyle = lit; g.fillRect(0, 0, w, h);
        const side = g.createLinearGradient(0, 0, w, 0); side.addColorStop(0, 'rgba(255,200,150,.35)'); side.addColorStop(0.5, 'rgba(255,200,150,0)'); g.fillStyle = side; g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = 'source-over';
      });
      s.cl = [cloud(520, 150, 3, 16, false), cloud(460, 130, 8, 14, false), cloud(640, 90, 11, 12, true), cloud(560, 80, 12, 10, true)];
      s.clouds = Array.from({ length: 7 }, (_, i) => ({ k: i % 4, x: r() * W, y: hy * (i % 4 < 2 ? 0.1 + r() * 0.2 : 0.55 + r() * 0.12), sp: 2 + r() * 5, sc: i % 4 < 2 ? 0.7 + r() * 0.35 : 0.8 + r() * 0.5, al: 0.6 + r() * 0.3 }));
      s.cirrus = a.layer(W * 1.2, hy, (g, w, h) => { const rr_ = rng(5); for (let i = 0; i < 9; i++) { const y = h * (0.1 + rr_() * 0.5), x = rr_() * w, len = rr(rr_, 200, 480); const gr = g.createLinearGradient(x, 0, x + len, 0); gr.addColorStop(0, 'rgba(255,170,150,0)'); gr.addColorStop(0.5, 'rgba(255,170,150,.22)'); gr.addColorStop(1, 'rgba(255,170,150,0)'); g.fillStyle = gr; g.save(); g.translate(0, y); g.rotate(-0.05); g.fillRect(x, 0, len, rr(rr_, 3, 8)); g.restore(); } });
      // hazy island on the horizon
      s.island = a.layer(W, hy + 4, (g, w, h) => { a.ridge(g, w, h, hy, 16, 52, [[96, 64, 112], [140, 84, 120]], { freq: 1.6, rough: 0.7 }); g.fillStyle = 'rgba(255,170,130,.35)'; g.fillRect(0, hy - 40, w, 44); });
      // glints + sailboat
      s.glints = Array.from({ length: a.n(260) }, () => ({ u: r(), d: Math.pow(r(), 0.8), sp: 1 + r() * 3, ph: r() * TAU }));
      s.glow = a.glow([255, 200, 140], 64);
      s.rays = Array.from({ length: 9 }, (_, i) => ({ a: -1.2 + i * 0.3, w: 0.06 + r() * 0.05, ph: r() * TAU }));
      s.birds = []; s.nextBird = 3; s.waves = Array.from({ length: 9 }, (_, k) => ({ d: (k + 0.5) / 9, ph: r() * TAU, sp: 0.4 + k * 0.1 }));
      s.boat = { x: W * 0.78, d: 0.04 };
    },
    draw(a, t, dt) {
      const { ctx, W, H, s } = a, hy = s.hy, sx = s.sx, sy = hy - 14 + Math.sin(t * 0.05) * 2;
      a.put(s.sky, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      // crepuscular rays
      s.rays.forEach(rw => {
        const ang = rw.a + Math.sin(t * 0.04 + rw.ph) * 0.05, len = H * 1.1, gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, len);
        gr.addColorStop(0, 'rgba(255,200,140,.16)'); gr.addColorStop(1, 'rgba(255,170,120,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.sin(ang - rw.w) * len, sy - Math.cos(ang - rw.w) * len); ctx.lineTo(sx + Math.sin(ang + rw.w) * len, sy - Math.cos(ang + rw.w) * len); ctx.closePath(); ctx.fill();
      });
      ctx.globalAlpha = 0.95; a.sprite(s.sun, sx, sy, H * 1.15); ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, hy); ctx.clip();
      ctx.fillStyle = 'rgb(255,240,208)'; ctx.beginPath(); ctx.arc(sx, sy, 34, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.9; a.sprite(s.sunHot, sx, sy, 150); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(s.cirrus, -((t * 4) % (W * 0.2)), 0, W * 1.2, hy);
      s.clouds.forEach(c => { const x = ((c.x + t * c.sp) % (W + 700)) - 600; ctx.globalAlpha = c.al; ctx.drawImage(s.cl[c.k], x, c.y, s.cl[c.k]._w * c.sc, s.cl[c.k]._h * c.sc); });
      ctx.globalAlpha = 1; ctx.restore();
      a.put(s.island, 0, 0);
      // horizon glow band
      const hg = ctx.createLinearGradient(0, hy - 30, 0, hy + 14); hg.addColorStop(0, 'rgba(255,200,130,0)'); hg.addColorStop(0.7, 'rgba(255,214,150,.5)'); hg.addColorStop(1, 'rgba(255,200,130,0)'); ctx.fillStyle = hg; ctx.fillRect(0, hy - 30, W, 44);
      // ---- water ----
      const wh = H - hy, wg = ctx.createLinearGradient(0, hy, 0, H);
      wg.addColorStop(0, 'rgb(232,130,112)'); wg.addColorStop(0.12, 'rgb(150,92,140)'); wg.addColorStop(0.35, 'rgb(60,66,128)'); wg.addColorStop(1, 'rgb(8,24,60)');
      ctx.fillStyle = wg; ctx.fillRect(0, hy, W, wh);
      // wave bands in perspective
      s.waves.forEach(w => {
        const y = hy + w.d * w.d * wh + 3, amp = 0.6 + w.d * 5;
        ctx.beginPath(); for (let x = 0; x <= W; x += 8) { const yy = y + Math.sin(x * (0.02 - w.d * 0.012) + t * w.sp + w.ph) * amp; x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
        ctx.strokeStyle = `rgba(20,24,70,${0.12 + w.d * 0.22})`; ctx.lineWidth = 1 + w.d * 3; ctx.stroke();
        ctx.beginPath(); for (let x = 0; x <= W; x += 8) { const yy = y - 1 - w.d * 2 + Math.sin(x * (0.02 - w.d * 0.012) + t * w.sp + w.ph) * amp; x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); }
        ctx.strokeStyle = `rgba(255,200,160,${0.06 + w.d * 0.1})`; ctx.lineWidth = 1; ctx.stroke();
      });
      // sun path: a wide additive column plus glittering glints that follow it
      ctx.globalCompositeOperation = 'lighter';
      const pg = ctx.createLinearGradient(0, hy, 0, H); pg.addColorStop(0, 'rgba(255,208,150,.5)'); pg.addColorStop(0.5, 'rgba(255,170,120,.14)'); pg.addColorStop(1, 'rgba(255,170,120,0)');
      ctx.fillStyle = pg; ctx.beginPath(); ctx.moveTo(sx - 30, hy); ctx.lineTo(sx + 30, hy); ctx.lineTo(sx + 260, H); ctx.lineTo(sx - 260, H); ctx.closePath(); ctx.fill();
      s.glints.forEach(g => {
        const y = hy + g.d * g.d * wh + 2, spread = 40 + g.d * 380, x = sx + (g.u - 0.5) * 2 * spread * (0.4 + 0.6 * g.d), w = 3 + g.d * 36;
        const near = Math.exp(-Math.pow((x - sx) / (30 + g.d * 190), 2)), b = Math.max(0, Math.sin(t * g.sp + g.ph));
        ctx.globalAlpha = clamp(b * b * (0.15 + near * 0.9), 0, 1); ctx.fillStyle = near > 0.3 ? 'rgb(255,226,170)' : 'rgb(255,190,150)'; ctx.fillRect(x - w / 2, y, w, 1 + g.d * 1.6);
      });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      // sailboat bobbing on the horizon with its reflection
      const b = s.boat, by = hy + 4 + b.d * wh + Math.sin(t * 1.1) * 1.4, bx = b.x + Math.sin(t * 0.08) * 6, tilt = Math.sin(t * 1.1 + 1) * 0.04;
      ctx.save(); ctx.translate(bx, by); ctx.rotate(tilt);
      ctx.fillStyle = 'rgb(46,24,50)'; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.lineTo(10, 5); ctx.lineTo(-10, 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgb(58,32,60)'; ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(0, -2); ctx.lineTo(11, -2); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-1, -26); ctx.lineTo(-1, -2); ctx.lineTo(-10, -2); ctx.closePath(); ctx.fillStyle = 'rgb(72,40,70)'; ctx.fill();
      ctx.restore();
      ctx.globalAlpha = 0.25; ctx.fillStyle = 'rgb(46,24,50)'; ctx.fillRect(bx - 3, by + 6, 6, 18 + Math.sin(t * 2) * 2); ctx.globalAlpha = 1;
      // a flock of birds now and then
      if (t > s.nextBird) { s.nextBird = t + 10 + Math.random() * 10; const y = hy * (0.18 + Math.random() * 0.4), n = 4 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) s.birds.push({ x: -30 - i * 30, y: y + (i % 2 ? 1 : -1) * i * 7, v: 62 + Math.random() * 12, ph: Math.random() * TAU }); }
      ctx.strokeStyle = 'rgba(48,24,56,.85)'; ctx.lineWidth = 1.7; ctx.lineCap = 'round';
      for (let i = s.birds.length - 1; i >= 0; i--) {
        const bd = s.birds[i]; bd.x += bd.v * dt; if (bd.x > W + 60) { s.birds.splice(i, 1); continue; }
        const fl = Math.sin(t * 7.5 + bd.ph) * 5; ctx.beginPath(); ctx.moveTo(bd.x - 10, bd.y - fl); ctx.quadraticCurveTo(bd.x - 4, bd.y - 4 + fl * 0.3, bd.x, bd.y); ctx.quadraticCurveTo(bd.x + 4, bd.y - 4 + fl * 0.3, bd.x + 10, bd.y - fl); ctx.stroke();
      }
    },
  };

  /* ---------- campfire ---------- */
  scenes.campfire = {
    init(a) {
      const { W, H, pal } = a, s = (a.s = {}), r = rng(23);
      s.fx = W * 0.5; s.fy = H * 0.86;
      s.sky = a.layer(W, H, (g, w, h) => {
        a.vgrad(g, w, h, [[0, [3, 5, 14]], [0.6, [10, 14, 32]], [1, [26, 20, 34]]]);
        for (let i = 0; i < 130 * a.q; i++) { g.fillStyle = `rgba(230,236,255,${0.2 + r() * 0.7})`; const sz = r() > 0.9 ? 1.6 : 0.9; g.fillRect(r() * w, r() * h * 0.7, sz, sz); }
      });
      s.twink = Array.from({ length: a.n(36) }, () => ({ x: r() * W, y: r() * H * 0.65, sp: 0.8 + r() * 2.2, ph: r() * TAU, sz: 3 + r() * 4 }));
      s.tg = a.glow([255, 255, 255], 32);
      s.land = a.layer(W, H, (g, w, h) => {
        a.ridge(g, w, h, h * 0.74, h * 0.06, 51, [[20, 22, 38], [8, 10, 20]], { freq: 0.8 });
        a.pineRow(g, w, h * 0.8, h * 0.12, h * 0.26, 4, 'rgb(8,10,20)', { gap: [14, 30] });
        a.ridge(g, w, h, h * 0.9, h * 0.035, 61, [[14, 14, 22], [6, 6, 10]], { freq: 0.5 });
        // big framing pines
        [[w * 0.06, h * 0.62], [w * 0.2, h * 0.45], [w * 0.93, h * 0.66], [w * 0.8, h * 0.48]].forEach(([x, ht]) => a.pine(g, x, h * 1.02, ht, 'rgb(3,4,8)'));
        g.fillStyle = 'rgb(4,5,9)'; g.fillRect(0, h * 0.93, w, h * 0.07);
      });
      s.sp = [[255, 206, 110], [255, 140, 40], [214, 60, 18]].map(c => a.glow(c, 64));
      s.smk = a.glow([120, 120, 130], 64); s.warm = a.glow([255, 150, 60], 256); s.spark = a.glow([255, 210, 120], 16);
      s.fl = []; s.sk = []; s.sm = []; s.acc = 0;
      s.moon = a.glow([200, 215, 255], 128);
      s.warmup = 45;
    },
    draw(a, t, dt) {
      const { ctx, W, H, s } = a, fx = s.fx, fy = s.fy;
      a.put(s.sky, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      s.twink.forEach(st => { const b = 0.5 + 0.5 * Math.sin(t * st.sp + st.ph); ctx.globalAlpha = 0.2 + 0.8 * b * b; ctx.drawImage(s.tg, st.x - st.sz, st.y - st.sz, st.sz * 2, st.sz * 2); });
      ctx.globalAlpha = 0.55; a.sprite(s.moon, W * 0.2, H * 0.16, 150); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#e6edff'; ctx.beginPath(); ctx.arc(W * 0.2, H * 0.16, 15, 0, TAU); ctx.fill();
      a.put(s.land, 0, 0);
      // flicker + firelight over the whole scene
      const flick = 0.78 + 0.13 * Math.sin(t * 13) + 0.1 * Math.sin(t * 7.3 + 1) + 0.05 * Math.sin(t * 29 + 2);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 * flick; a.sprite(s.warm, fx, fy - 30, H * 1.5);
      ctx.globalAlpha = 0.45 * flick; a.sprite(s.warm, fx, fy + 6, W * 0.5);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      // logs
      ctx.save(); ctx.translate(fx, fy + 4);
      [[-0.32, -16], [0.32, 16]].forEach(([rot, dx]) => { ctx.save(); ctx.translate(dx, 0); ctx.rotate(rot); ctx.fillStyle = 'rgb(40,24,16)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-38, -7, 76, 14, 7) : ctx.rect(-38, -7, 76, 14); ctx.fill(); ctx.fillStyle = `rgba(255,${110 + 40 * flick},40,.55)`; ctx.fillRect(-30, -2, 60, 3); ctx.restore(); });
      ctx.restore();
      // particles
      const rate = 130 * a.q; s.acc += rate * dt;
      while (s.acc > 1) { s.acc--; s.fl.push({ x: fx + (Math.random() - 0.5) * 22, y: fy - 2, vx: (Math.random() - 0.5) * 10, vy: -(90 + Math.random() * 110), life: 0.65 + Math.random() * 0.75, age: 0, sz: 14 + Math.random() * 16, ph: Math.random() * TAU }); }
      if (Math.random() < dt * 14 * a.q) s.sk.push({ x: fx + (Math.random() - 0.5) * 26, y: fy - 16, vx: (Math.random() - 0.5) * 30, vy: -(70 + Math.random() * 110), life: 1.2 + Math.random() * 1.4, age: 0, ph: Math.random() * TAU });
      if (Math.random() < dt * 5 * a.q) s.sm.push({ x: fx + (Math.random() - 0.5) * 18, y: fy - 90, vy: -(25 + Math.random() * 20), life: 3 + Math.random() * 2, age: 0, sz: 30 });
      ctx.globalCompositeOperation = 'lighter';
      for (let i = s.fl.length - 1; i >= 0; i--) {
        const p = s.fl[i]; p.age += dt; if (p.age >= p.life) { s.fl.splice(i, 1); continue; }
        p.x += (p.vx + Math.sin(p.age * 9 + p.ph) * 16) * dt; p.y += p.vy * dt; p.vx *= 0.985;
        const k = p.age / p.life, sz = p.sz * (1 - k * 0.65), spi = k < 0.3 ? 0 : k < 0.62 ? 1 : 2;
        ctx.globalAlpha = (1 - k) * 0.6; a.sprite(s.sp[spi], p.x, p.y + sz * 0.3, sz * 1.9);
      }
      for (let i = s.sk.length - 1; i >= 0; i--) {
        const p = s.sk[i]; p.age += dt; if (p.age >= p.life) { s.sk.splice(i, 1); continue; }
        p.x += (p.vx + Math.sin(p.age * 5 + p.ph) * 40) * dt; p.y += p.vy * dt; p.vy *= 0.995;
        const k = p.age / p.life; ctx.globalAlpha = (1 - k) * (0.6 + 0.4 * Math.sin(p.age * 30)); a.sprite(s.spark, p.x, p.y, 8);
      }
      ctx.globalCompositeOperation = 'source-over';
      for (let i = s.sm.length - 1; i >= 0; i--) {
        const p = s.sm[i]; p.age += dt; if (p.age >= p.life) { s.sm.splice(i, 1); continue; }
        p.y += p.vy * dt; p.x += Math.sin(p.age) * 10 * dt; const k = p.age / p.life;
        ctx.globalAlpha = 0.07 * Math.sin(k * Math.PI); a.sprite(s.smk, p.x, p.y, p.sz * (1 + k * 3));
      }
      ctx.globalAlpha = 1;
    },
  };

  /* ---------- snowy cabin ---------- */
  scenes.snow = {
    init(a) {
      const { W, H, pal } = a, s = (a.s = {}), r = rng(29);
      s.sky = a.layer(W, H, (g, w, h) => {
        a.vgrad(g, w, h, [[0, [6, 12, 34]], [0.42, [24, 42, 90]], [0.7, mix([82, 92, 154], pal.accent, 0.06)], [1, [196, 162, 180]]]);
        for (let i = 0; i < 160 * a.q; i++) { g.fillStyle = `rgba(240,246,255,${0.2 + r() * 0.7})`; const sz = r() > 0.93 ? 1.8 : 1; g.fillRect(r() * w, r() * h * 0.55, sz, sz); }
      });
      s.twink = Array.from({ length: a.n(50) }, () => ({ x: r() * W, y: r() * H * 0.5, sp: 0.7 + r() * 2.4, ph: r() * TAU, sz: 3 + r() * 5 }));
      s.tg = a.glow([255, 255, 255], 32); s.moon = a.glow([220, 232, 255], 256);
      s.mx = W * 0.74; s.my = H * 0.2;
      const bake = (w, h, fn) => a.layer(w, h, fn);
      // far snowy mountains
      s.far = bake(W, H, (g, w, h) => {
        a.ridge(g, w, h, h * 0.58, h * 0.13, 71, [[168, 186, 226], [64, 84, 138]], { freq: 0.55, rough: 1.3 });
        a.pineRow(g, w, h * 0.62, h * 0.04, h * 0.09, 3, 'rgb(48,68,112)', { gap: [8, 18], snow: true });
      });
      // mid forest hill (this layer sways)
      s.mid = bake(W * 1.04, H, (g, w, h) => {
        a.ridge(g, w, h, h * 0.68, h * 0.05, 83, [[124, 144, 196], [78, 98, 150]], { freq: 0.7 });
        a.pineRow(g, w, h * 0.72, h * 0.07, h * 0.15, 9, 'rgb(34,58,92)', { gap: [10, 22], snow: true, jitter: 3 });
      });
      // the cabin hill, drifts and framing trees
      const cabinX = (s.cx = W * 0.3); let cabinY = 0;
      s.cabin = bake(W, H, (g, w, h) => {
        const fy = a.ridge(g, w, h, h * 0.8, h * 0.035, 97, [[206, 220, 246], [160, 182, 224]], { freq: 0.55 });
        cabinY = fy(cabinX) + 2;
        a.pineRow(g, w, h * 0.86, h * 0.1, h * 0.24, 5, 'rgb(24,48,78)', { gap: [34, 80], snow: true, jitter: 3 });
        // ---- the cabin ----
        const sc = Math.max(0.8, H / 760);
        g.save(); g.translate(cabinX, cabinY); g.scale(sc, sc);
        g.fillStyle = 'rgba(40,60,110,.35)'; g.beginPath(); g.ellipse(0, 2, 108, 8, 0, 0, TAU); g.fill();
        g.fillStyle = 'rgb(66,42,38)'; g.fillRect(-78, -62, 156, 62);
        g.fillStyle = 'rgba(0,0,0,.25)'; for (let y = -58; y < 0; y += 9) g.fillRect(-78, y, 156, 1.4);
        g.fillStyle = 'rgba(255,255,255,.07)'; for (let y = -62; y < 0; y += 9) g.fillRect(-78, y, 156, 1.6);
        g.fillStyle = 'rgb(46,30,28)'; [[-78, 0], [72, 0]].forEach(([x]) => g.fillRect(x, -62, 6, 62));
        // chimney
        g.fillStyle = 'rgb(88,78,86)'; g.fillRect(34, -112, 18, 58); g.fillStyle = 'rgb(240,246,255)'; g.fillRect(32, -116, 22, 7);
        // roof with thick snow
        g.fillStyle = 'rgb(54,36,34)'; g.beginPath(); g.moveTo(-96, -58); g.lineTo(0, -112); g.lineTo(96, -58); g.closePath(); g.fill();
        g.fillStyle = 'rgb(244,249,255)'; g.beginPath(); g.moveTo(-100, -56); g.quadraticCurveTo(-60, -84, 0, -118); g.quadraticCurveTo(60, -84, 100, -56); g.quadraticCurveTo(94, -52, 88, -58); g.quadraticCurveTo(50, -76, 0, -108); g.quadraticCurveTo(-50, -76, -88, -58); g.quadraticCurveTo(-94, -52, -100, -56); g.closePath(); g.fill();
        g.fillStyle = 'rgba(190,210,245,.85)'; for (let i = 0; i < 9; i++) { const x = -92 + i * 22 + (i % 2) * 3; g.beginPath(); g.moveTo(x, -55); g.lineTo(x + 3, -55); g.lineTo(x + 1.5, -55 + 6 + (i * 7) % 8); g.closePath(); g.fill(); }
        // windows (dark glass; glow is drawn live), door, porch
        const win = (x, y) => { g.fillStyle = 'rgb(28,18,22)'; g.fillRect(x - 15, y - 13, 30, 26); g.fillStyle = 'rgb(20,18,36)'; g.fillRect(x - 12, y - 10, 24, 20); g.fillStyle = 'rgb(236,240,250)'; g.fillRect(x - 17, y + 12, 34, 4); };
        win(-46, -34); win(24, -34);
        g.fillStyle = 'rgb(38,24,24)'; g.beginPath(); g.moveTo(-70, 0); g.lineTo(-70, -34); g.quadraticCurveTo(-60, -50, -50, -34); g.lineTo(-50, 0); g.closePath(); g.fill();
        g.fillStyle = 'rgb(236,243,255)'; g.fillRect(-84, -4, 38, 6);
        // woodpile
        g.fillStyle = 'rgb(86,58,44)'; for (let i = 0; i < 4; i++) for (let j = 0; j < 3 - (i > 2 ? 1 : 0); j++) { g.beginPath(); g.arc(60 + i * 8, -4 - j * 8, 4, 0, TAU); g.fill(); }
        g.fillStyle = 'rgb(240,246,255)'; g.fillRect(56, -27, 36, 3);
        // lantern post
        g.fillStyle = 'rgb(36,28,34)'; g.fillRect(104, -52, 3, 52); g.fillRect(100, -56, 11, 6);
        g.restore();
        s.sc = sc; s.cabinY = cabinY;
        // foreground drifts + footprints leading from the door
        a.ridge(g, w, h, h * 0.93, h * 0.03, 101, [[240, 246, 255], [200, 216, 244]], { freq: 0.5 });
        for (let i = 0; i < 16; i++) { const u = i / 15, px = cabinX - 60 * sc - u * w * 0.2 + (i % 2 ? 6 : -6), py = cabinY + 6 + Math.pow(u, 1.3) * (h * 0.9 - cabinY); g.fillStyle = 'rgba(110,140,196,.55)'; g.beginPath(); g.ellipse(px, py, 4 + u * 4, 1.8 + u * 1.6, -0.2, 0, TAU); g.fill(); }
        [[w * 0.05, h * 0.54], [w * 0.14, h * 0.36], [w * 0.92, h * 0.6], [w * 0.82, h * 0.4]].forEach(([x, ht]) => a.pine(g, x, h * 1.04, ht, 'rgb(12,30,52)', true));
      });
      s.warm = a.glow([255, 188, 90], 128); s.flake = a.glow([255, 255, 255], 16); s.smk = a.glow([214, 224, 244], 32); s.spark = a.glow([255, 255, 255], 16);
      s.layers = [0, 1, 2].map(li => Array.from({ length: a.n([110, 64, 28][li]) }, () => ({ x: r() * (W + 140), y: r() * H, v: [26, 52, 92][li] * (0.8 + r() * 0.4), sz: [2.4, 4.4, 8][li], sw: 0.5 + r() * 1, ph: r() * TAU, al: [0.5, 0.75, 0.35][li] })));
      s.sparks = Array.from({ length: a.n(30) }, () => ({ x: r() * W, y: H * (0.78 + r() * 0.2), sp: 1 + r() * 3, ph: r() * TAU }));
      s.smoke = []; s.acc = 0; s.shoot = []; s.nextShoot = 4 + r() * 5;
      s.aur = a.layer(W, H * 0.5, (g, w, h) => { g.save(); g.scale(1, h / w); const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(90,255,190,.5)'); gr.addColorStop(1, 'rgba(90,255,190,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); g.restore(); });
    },
    draw(a, t, dt) {
      const { ctx, W, H, s } = a, sc = s.sc || 1, cx = s.cx, cy = s.cabinY;
      const gust = 0.35 + 0.65 * Math.max(0, Math.sin(t * 0.22) * Math.sin(t * 0.37 + 1)); // wind comes and goes
      a.put(s.sky, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      s.twink.forEach(st => { const b = 0.5 + 0.5 * Math.sin(t * st.sp + st.ph); ctx.globalAlpha = 0.2 + 0.8 * b * b; ctx.drawImage(s.tg, st.x - st.sz, st.y - st.sz, st.sz * 2, st.sz * 2); });
      ctx.globalAlpha = 0.16 + 0.1 * Math.sin(t * 0.3); ctx.drawImage(s.aur, W * 0.1, H * 0.34, W * 0.8, H * 0.3);
      ctx.globalAlpha = 0.7; a.sprite(s.moon, s.mx, s.my, H * 0.8); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      const mg = ctx.createRadialGradient(s.mx - 6, s.my - 6, 3, s.mx, s.my, 26); mg.addColorStop(0, '#ffffff'); mg.addColorStop(1, '#dbe5f6'); ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(s.mx, s.my, 25, 0, TAU); ctx.fill();
      // shooting star
      if (t > s.nextShoot) { s.nextShoot = t + 6 + Math.random() * 9; const ang = 0.3 + Math.random() * 0.25; s.shoot.push({ x: Math.random() * W * 0.7, y: Math.random() * H * 0.25, vx: Math.cos(ang) * 850, vy: Math.sin(ang) * 850, age: 0 }); }
      for (let i = s.shoot.length - 1; i >= 0; i--) { const p = s.shoot[i]; p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.age > 0.8) { s.shoot.splice(i, 1); continue; } const al = Math.sin(clamp(p.age / 0.8, 0, 1) * Math.PI), gr = ctx.createLinearGradient(p.x, p.y, p.x - p.vx * 0.15, p.y - p.vy * 0.15); gr.addColorStop(0, `rgba(255,255,255,${al})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); ctx.strokeStyle = gr; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.15, p.y - p.vy * 0.15); ctx.stroke(); }
      a.put(s.far, 0, 0);
      const sway = (layer, baseY, ph, k) => { ctx.save(); const sh = Math.sin(t * 0.5 + ph) * k * (0.6 + gust * 0.8); ctx.transform(1, 0, sh, 1, -sh * baseY, 0); a.put(layer, -W * 0.02, 0); ctx.restore(); };
      sway(s.mid, H * 0.72, 0.7, 0.006);
      a.put(s.cabin, 0, 0);
      // ---- warm light: window glow, spill on the snow, flickering lantern ----
      const fl = 0.78 + 0.14 * Math.sin(t * 5.1) * Math.sin(t * 2.3) + 0.08 * Math.sin(t * 13), lx = cx + 105 * sc, ly = cy - 54 * sc;
      ctx.fillStyle = `rgba(255,${196 + 24 * fl},110,.96)`;
      [[-46, -34], [24, -34]].forEach(([x, y]) => { ctx.fillRect(cx + (x - 12) * sc, cy + (y - 10) * sc, 24 * sc, 20 * sc); });
      ctx.fillStyle = `rgba(80,40,30,.55)`; ctx.fillRect(cx + (-46 - 0.8) * sc, cy + (-34 - 10) * sc, 1.6 * sc, 20 * sc); ctx.fillRect(cx + (24 - 0.8) * sc, cy + (-34 - 10) * sc, 1.6 * sc, 20 * sc);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.8 * fl; a.sprite(s.warm, cx - 46 * sc, cy - 34 * sc, 120 * sc); a.sprite(s.warm, cx + 24 * sc, cy - 34 * sc, 120 * sc);
      ctx.globalAlpha = 0.34 * fl; ctx.drawImage(s.warm, cx - 120 * sc, cy - 20 * sc, 240 * sc, 52 * sc); ctx.drawImage(s.warm, cx - 40 * sc, cy - 10 * sc, 150 * sc, 36 * sc);
      ctx.globalAlpha = 0.9 * fl; a.sprite(s.warm, lx, ly, 70 * sc); ctx.globalAlpha = 0.28 * fl; ctx.drawImage(s.warm, lx - 38 * sc, ly, 76 * sc, 70 * sc);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(255,236,170,${0.9 * fl})`; ctx.fillRect(lx - 3 * sc, ly - 3 * sc, 6 * sc, 7 * sc);
      // chimney smoke curling in the wind
      s.acc += dt * 2.4; while (s.acc > 1) { s.acc--; s.smoke.push({ x: cx + 43 * sc, y: cy - 118 * sc, age: 0, life: 4.5 + Math.random() * 2 }); }
      for (let i = s.smoke.length - 1; i >= 0; i--) { const p = s.smoke[i]; p.age += dt; if (p.age > p.life) { s.smoke.splice(i, 1); continue; } const k = p.age / p.life; p.y -= 18 * dt; p.x += (6 + 26 * k * (0.6 + gust)) * dt + Math.sin(p.age * 1.6) * 6 * dt; ctx.globalAlpha = 0.3 * (1 - k); a.sprite(s.smk, p.x, p.y, 12 * sc + k * 46); }
      ctx.globalAlpha = 1;
      // sparkles on the snow
      ctx.globalCompositeOperation = 'lighter';
      s.sparks.forEach(p => { const b = Math.max(0, Math.sin(t * p.sp + p.ph)); ctx.globalAlpha = b * b * b; a.sprite(s.spark, p.x, p.y, 10); });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      // snowfall (more slanted when it gusts), three depths
      s.layers.forEach((layer, li) => layer.forEach(f => {
        f.y += f.v * dt; f.x -= ([6, 12, 20][li] + gust * [30, 60, 120][li]) * dt; if (f.y > H + 12) { f.y = -12; f.x = Math.random() * (W + 140); } if (f.x < -40) f.x += W + 160;
        const x = f.x + Math.sin(t * f.sw + f.ph) * [10, 18, 30][li];
        ctx.globalAlpha = f.al; a.sprite(s.flake, x, f.y, f.sz * (li === 2 ? 3 : 2));
      }));
      ctx.globalAlpha = 1;
      const vg = ctx.createRadialGradient(W / 2, H * 0.5, H * 0.4, W / 2, H * 0.5, H * 0.98); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.28)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    },
  };

  /* ---------- cherry blossoms ---------- */
  scenes.sakura = {
    init(a) {
      const { W, H, pal } = a, s = (a.s = {}), r = rng(37);
      s.sky = a.layer(W, H, (g, w, h) => a.vgrad(g, w, h, [[0, [30, 26, 70]], [0.45, mix([120, 78, 140], pal.accent, 0.06)], [0.8, [236, 150, 170]], [1, [250, 200, 196]]]));
      s.sun = a.glow([255, 214, 200], 256);
      s.hills = a.layer(W, H, (g, w, h) => {
        a.ridge(g, w, h, h * 0.7, h * 0.09, 91, [[110, 84, 150], [160, 120, 170]], { freq: 0.6 });
        a.ridge(g, w, h, h * 0.8, h * 0.06, 93, [[86, 64, 120], [130, 96, 150]], { freq: 0.8 });
        a.ridge(g, w, h, h * 0.92, h * 0.045, 95, [[52, 36, 78], [30, 20, 48]], { freq: 0.5 });
      });
      // the blossoming branch, drawn once and swayed as a whole
      s.ax = W * 1.02; s.ay = H * 0.05;
      s.branch = a.layer(W, H * 0.7, (g, w, h) => {
        const pts = (x0, y0, x1, y1, cx, cy, n) => Array.from({ length: n + 1 }, (_, i) => { const u = i / n; return [(1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx + u * u * x1, (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy + u * u * y1]; });
        const limb = (p, w0) => { g.strokeStyle = 'rgb(62,38,44)'; g.lineCap = 'round'; for (let i = 0; i < p.length - 1; i++) { g.lineWidth = Math.max(1.5, w0 * (1 - i / p.length)); g.beginPath(); g.moveTo(p[i][0], p[i][1]); g.lineTo(p[i + 1][0], p[i + 1][1]); g.stroke(); } };
        const main = pts(s.ax, s.ay, w * 0.3, h * 0.52, w * 0.7, h * 0.12, 40); limb(main, 16);
        const blossom = (x, y, sc) => { for (let k = 0; k < 5; k++) { const ang = k / 5 * TAU + r() * 0.4; g.fillStyle = r() > 0.5 ? 'rgba(255,200,216,.95)' : 'rgba(255,224,232,.95)'; g.beginPath(); g.ellipse(x + Math.cos(ang) * 4 * sc, y + Math.sin(ang) * 4 * sc, 5 * sc, 3.2 * sc, ang, 0, TAU); g.fill(); } g.fillStyle = 'rgba(214,92,130,.9)'; g.beginPath(); g.arc(x, y, 1.6 * sc, 0, TAU); g.fill(); };
        const cluster = (x, y, n, spread) => { for (let i = 0; i < n; i++) blossom(x + (r() - 0.5) * spread * 2, y + (r() - 0.5) * spread, 0.8 + r() * 0.9); };
        for (let b = 0; b < 7; b++) {
          const u = 0.12 + b * 0.12, [bx, by] = main[Math.floor(u * 40)];
          const ex = bx - rr(r, 40, 130), ey = by + rr(r, 60, 150), tw = pts(bx, by, ex, ey, bx - 30, by + 30, 14); limb(tw, 7);
          tw.forEach((p, i) => { if (i % 3 === 0) cluster(p[0], p[1], 4, 26); });
          cluster(ex, ey, 9, 34);
        }
        for (let i = 0; i <= 40; i += 2) cluster(main[i][0], main[i][1], 3, 34);
      });
      s.petals = Array.from({ length: a.n(70) }, () => ({ x: r() * W, y: r() * H, v: 24 + r() * 40, sw: 0.5 + r() * 1.2, ph: r() * TAU, rot: r() * TAU, spin: (r() - 0.5) * 2.5, flip: r() * TAU, fs: 1 + r() * 2.5, sz: 4 + r() * 5, c: [[255,196,214],[255,222,232],[250,170,196]][Math.floor(r() * 3)] }));
      s.bokeh = Array.from({ length: a.n(14) }, () => ({ x: r() * W, y: r() * H, r: 18 + r() * 44, sp: 0.1 + r() * 0.2, ph: r() * TAU, a: 0.05 + r() * 0.08 }));
      s.bk = a.glow([255, 215, 225], 64);
      s.mist = a.layer(W, H * 0.4, (g, w, h) => a.vgrad(g, w, h, [[0, [255, 210, 220], 0], [1, [255, 210, 220], 0.28]]));
    },
    draw(a, t, dt) {
      const { ctx, W, H, s } = a;
      a.put(s.sky, 0, 0);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.7; a.sprite(s.sun, W * 0.3, H * 0.62, H * 1.1); ctx.globalAlpha = 1;
      s.bokeh.forEach(b => { ctx.globalAlpha = b.a * (0.7 + 0.3 * Math.sin(t * b.sp * 3 + b.ph)); a.sprite(s.bk, b.x + Math.sin(t * b.sp + b.ph) * 22, b.y + Math.cos(t * b.sp * 0.8 + b.ph) * 14, b.r * 2); });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      a.put(s.hills, 0, 0);
      ctx.drawImage(s.mist, 0, H * 0.6, W, H * 0.4);
      ctx.save(); ctx.translate(s.ax, s.ay); ctx.rotate(Math.sin(t * 0.55) * 0.011); ctx.drawImage(s.branch, -s.ax, -s.ay, s.branch._w, s.branch._h); ctx.restore();
      // petals
      s.petals.forEach(p => {
        p.y += p.v * dt; p.rot += p.spin * dt; if (p.y > H + 12) { p.y = -12; p.x = Math.random() * W * 1.1; } if (p.x < -60) p.x += W + 120;
        p.x -= 7 * dt;
        const x = p.x + Math.sin(t * p.sw + p.ph) * 44;
        ctx.save(); ctx.translate(x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.abs(Math.cos(t * p.fs + p.flip)) * 0.8 + 0.2);
        ctx.fillStyle = rgb(p.c, 0.92); ctx.beginPath(); ctx.moveTo(0, -p.sz); ctx.bezierCurveTo(p.sz * 0.9, -p.sz * 0.5, p.sz * 0.7, p.sz * 0.8, 0, p.sz); ctx.bezierCurveTo(-p.sz * 0.7, p.sz * 0.8, -p.sz * 0.9, -p.sz * 0.5, 0, -p.sz); ctx.fill(); ctx.restore();
      });
    },
  };

  /* ======================================================================
     ENGINE
  ====================================================================== */
  function setup(theme) {
    if (!canvas || !canvas.isConnected) return false;
    const rect = canvas.getBoundingClientRect();
    W = Math.max(320, Math.round(rect.width || window.innerWidth));
    H = Math.max(240, Math.round(rect.height || window.innerHeight));
    dpr = Math.min(window.devicePixelRatio || 1, quality < 0.7 ? 1 : 1.5);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    A = buildAPI(theme); // reads the live ctx/W/H/dpr/quality set above
    scene.init(A);
    return true;
  }

  function warm(frames) {
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const n = reduce ? 70 : (A.s && A.s.warmup) || 0;
    for (let i = 0; i < n; i++) { t += 1 / 30; scene.draw(A, t, 1 / 30); }
    return reduce;
  }

  function loop(ts) {
    raf = requestAnimationFrame(loop);
    if (!canvas || !canvas.isConnected) { stop(); return; }
    if (document.hidden) { last = ts; return; }
    if (ts - last < 30) return;
    const dt = Math.min(0.1, (ts - last) / 1000); last = ts; t += dt;
    const t0 = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scene.draw(A, t, dt);
    // adapt: if drawing is consistently slow, lower particle counts and resolution once or twice
    const cost = performance.now() - t0; emaMs = emaMs ? emaMs * 0.9 + cost * 0.1 : cost;
    frames++; slow += cost;
    if (frames === 90) {
      if (slow / frames > 18 && quality > 0.45) { quality = Math.max(0.45, quality * 0.7); setup(curKey.split('|')[1]); }
      frames = 0; slow = 0;
    }
  }

  function stopLoop() { cancelAnimationFrame(raf); raf = 0; }
  function stop() { stopLoop(); curKey = ''; curId = ''; scene = null; if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); window.removeEventListener('resize', onResize); }
  function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (scene && setup(curKey.split('|')[1])) { const reduce = warm(); if (reduce) scene.draw(A, t, 0.033); } }, 220); }

  function start(id, theme) {
    canvas = document.getElementById('bg-canvas');
    if (!canvas || !scenes[id]) { stop(); return; }
    const key = id + '|' + (theme || '');
    if (key === curKey && raf) return;
    stopLoop();
    curKey = key; curId = id; scene = scenes[id]; t = 0; last = 0; frames = 0; slow = 0;
    if (!setup(theme)) return;
    const reduce = warm();
    window.removeEventListener('resize', onResize); window.addEventListener('resize', onResize);
    if (reduce) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); scene.draw(A, t, 0.033); return; }
    raf = requestAnimationFrame(loop);
  }

  window.LiveBG = { start, stop, IDS: Object.keys(scenes), stats: () => ({ ms: Math.round(emaMs * 10) / 10, quality }) };
})();
