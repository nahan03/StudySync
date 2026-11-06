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
  let W = 0, H = 0, dpr = 1, quality = 1, t = 0, last = 0, A = null, slow = 0, frames = 0, resizeTimer = 0;

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
      const { W, H, pal } = a, s = (a.s = {});
      s.sky = a.layer(W, H, (g, w, h) => a.vgrad(g, w, h, [
        [0, mix(pal.bg1, [10, 16, 40], 0.55)], [0.5, mix(pal.bg2, pal.accent, 0.3)], [1, mix(pal.bg2, pal.warm, 0.3)]]));
      const LW = W * 1.16;
      const haze = mix(pal.bg2, pal.accent, 0.3);
      const col = i => (i === 2 ? mix(mix(pal.hill[2], pal.accent, 0.12), haze, 0.5) : i === 1 ? mix(pal.hill[1], haze, 0.18) : mix(pal.hill[0], pal.accent, 0.07));
      s.far = a.layer(LW, H, (g, w, h) => { a.pineRow(g, w, h * 0.7, h * 0.16, h * 0.3, 21, rgb(col(2), 0.95), { gap: [10, 22] }); g.fillStyle = rgb(col(2)); g.fillRect(0, h * 0.69, w, h * 0.31); });
      s.mid = a.layer(LW, H, (g, w, h) => { a.pineRow(g, w, h * 0.84, h * 0.26, h * 0.46, 33, rgb(col(1)), { gap: [14, 30], jitter: 5 }); g.fillStyle = rgb(col(1)); g.fillRect(0, h * 0.83, w, h * 0.17); });
      s.near = a.layer(LW, H, (g, w, h) => { a.pineRow(g, w, h * 1.03, h * 0.5, h * 0.82, 47, rgb(col(0)), { gap: [90, 190], jitter: 8 }); g.fillStyle = rgb(col(0)); g.fillRect(0, h * 0.95, w, h * 0.05);
        g.globalCompositeOperation = 'source-atop'; const rim = g.createLinearGradient(0, 0, w, 0); rim.addColorStop(0, 'rgba(0,0,0,.35)'); rim.addColorStop(0.6, 'rgba(0,0,0,0)'); rim.addColorStop(1, rgb(mix(pal.warm, pal.accent, 0.3), 0.22)); g.fillStyle = rim; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over'; });
      s.sun = a.glow(mix(pal.warm, [255, 255, 255], 0.3), 256);
      s.fireGlow = a.glow(mix(pal.warm, pal.accent, 0.5), 32);
      s.fog = a.layer(512, 160, (g, w, h) => { const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); r.addColorStop(0, 'rgba(255,255,255,.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.save(); g.scale(1, h / w); g.fillStyle = r; g.fillRect(0, 0, w, w); g.restore(); });
      const r = rng(5);
      s.flies = Array.from({ length: a.n(42) }, () => ({ x: r() * W, y: H * (0.35 + r() * 0.6), ax: 20 + r() * 50, ay: 10 + r() * 30, sp: 0.2 + r() * 0.5, ph: r() * TAU, bl: 0.6 + r() * 1.6, sz: 14 + r() * 18 }));
      s.leaves = Array.from({ length: a.n(16) }, () => ({ x: r() * W, y: r() * H, v: 18 + r() * 28, sw: 0.6 + r() * 1.2, ph: r() * TAU, rot: r() * TAU, sp: 0.6 + r() * 1.4, sz: 3 + r() * 4, c: r() > 0.5 }));
      s.rays = Array.from({ length: 6 }, (_, i) => ({ x: W * (0.05 + i * 0.17 + r() * 0.05), w: 40 + r() * 90, sp: 0.15 + r() * 0.2, ph: r() * TAU }));
      s.fogs = Array.from({ length: 4 }, (_, i) => ({ y: H * (0.5 + i * 0.12), sp: 6 + r() * 10, off: r() * W, sc: 1 + r() * 0.8, al: 0.1 + r() * 0.1 }));
    },
    draw(a, t, dt) {
      const { ctx, W, H, s, pal } = a;
      a.put(s.sky, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5; a.sprite(s.sun, W * 0.74, H * 0.16, H * 0.9); ctx.globalAlpha = 1;
      // god rays
      s.rays.forEach(rw => {
        const al = 0.035 + 0.03 * (0.5 + 0.5 * Math.sin(t * rw.sp + rw.ph));
        const x0 = rw.x + Math.sin(t * 0.08 + rw.ph) * 24, gr = ctx.createLinearGradient(x0, 0, x0 - H * 0.35, H);
        gr.addColorStop(0, rgb(pal.warm, al)); gr.addColorStop(1, rgb(pal.warm, 0));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x0, -10); ctx.lineTo(x0 + rw.w, -10); ctx.lineTo(x0 - H * 0.35 + rw.w * 2.4, H); ctx.lineTo(x0 - H * 0.35, H); ctx.closePath(); ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
      const slide = (k, amp) => -W * 0.08 + Math.sin(t * 0.045 + k) * W * amp;
      a.put(s.far, slide(0, 0.018), 0);
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.9;
      s.fogs.forEach((f, i) => { const x = ((f.off + t * f.sp) % (W + 700)) - 600; ctx.globalAlpha = f.al * 0.55; ctx.drawImage(s.fog, x, f.y, 700 * f.sc, 170 * f.sc); });
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      a.put(s.mid, slide(1.7, 0.03), 0);
      ctx.globalCompositeOperation = 'screen';
      s.fogs.forEach((f, i) => { if (i % 2) return; const x = ((f.off * 1.7 + t * f.sp * 1.4) % (W + 700)) - 600; ctx.globalAlpha = f.al * 0.6; ctx.drawImage(s.fog, x, f.y + H * 0.1, 760 * f.sc, 190 * f.sc); });
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      a.put(s.near, slide(3.1, 0.05), 0);
      const vg = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.3, W / 2, H * 0.45, H * 0.95); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.34)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      // fireflies
      ctx.globalCompositeOperation = 'lighter';
      s.flies.forEach(f => {
        const x = f.x + Math.sin(t * f.sp + f.ph) * f.ax, y = f.y + Math.cos(t * f.sp * 1.3 + f.ph) * f.ay;
        const b = 0.5 + 0.5 * Math.sin(t * f.bl + f.ph * 2);
        ctx.globalAlpha = 0.15 + 0.85 * b * b; a.sprite(s.fireGlow, x, y, f.sz * (0.7 + 0.5 * b));
      });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      // leaves
      s.leaves.forEach(l => {
        l.y += l.v * dt; l.rot += l.sp * dt; if (l.y > H + 10) { l.y = -10; l.x = Math.random() * W; }
        const x = l.x + Math.sin(t * l.sw + l.ph) * 34;
        ctx.save(); ctx.translate(x, l.y); ctx.rotate(l.rot); ctx.scale(1, 0.55 + 0.45 * Math.cos(t * l.sp + l.ph));
        ctx.fillStyle = l.c ? rgb(pal.warm, 0.75) : rgb(pal.accent, 0.7); ctx.beginPath(); ctx.ellipse(0, 0, l.sz, l.sz * 0.55, 0, 0, TAU); ctx.fill(); ctx.restore();
      });
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
      s.hy = H * 0.76; // horizon / lake line
      s.sky = a.layer(W, H, (g, w, h) => {
        a.vgrad(g, w, h, [[0, [2, 5, 14]], [0.7, [8, 20, 40]], [1, [14, 36, 58]]]);
        for (let i = 0; i < 150 * a.q; i++) { g.fillStyle = `rgba(225,235,255,${0.2 + r() * 0.7})`; const sz = r() > 0.92 ? 1.6 : 0.9; g.fillRect(r() * w, r() * h * 0.7, sz, sz); }
      });
      const mk = c => a.layer(2, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, rgb(c, 0)); gr.addColorStop(0.2, rgb(c, 0.18)); gr.addColorStop(0.55, rgb(c, 0.85)); gr.addColorStop(0.85, rgb(c, 0.3)); gr.addColorStop(1, rgb(c, 0)); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
      s.rib = [
        { sp: mk(mix([60, 255, 160], pal.accent, 0.25)), base: 0.30, f1: 1.3, a1: 0.07, f2: 3.1, a2: 0.025, s1: 0.18, s2: 0.31, h0: 0.34, g1: 2.2, g2: 3.4, al: 0.9 },
        { sp: mk(mix([40, 220, 220], pal.accent, 0.15)), base: 0.38, f1: 0.9, a1: 0.06, f2: 2.4, a2: 0.03, s1: 0.13, s2: 0.27, h0: 0.28, g1: 1.7, g2: 2.6, al: 0.7 },
        { sp: mk(mix([170, 90, 240], pal.warm, 0.2)), base: 0.26, f1: 1.7, a1: 0.05, f2: 3.8, a2: 0.02, s1: 0.22, s2: 0.36, h0: 0.22, g1: 2.9, g2: 4.1, al: 0.55 },
      ];
      s.land = a.layer(W, H, (g, w, h) => {
        a.ridge(g, w, h, s.hy, h * 0.1, 41, [[16, 26, 40], [6, 10, 18]], { freq: 0.8 });
        a.pineRow(g, w, s.hy + 4, h * 0.06, h * 0.12, 8, 'rgb(4,8,14)', { gap: [14, 34] });
      });
      s.lake = a.layer(W, H - s.hy, (g, w, h) => a.vgrad(g, w, h, [[0, [8, 18, 30], 0.55], [1, [2, 6, 12], 0.95]]));
    },
    draw(a, t, dt) {
      const { ctx, W, H, s } = a;
      a.put(s.sky, 0, 0);
      const curtains = (alphaMul) => {
        ctx.globalCompositeOperation = 'lighter';
        s.rib.forEach(rb => {
          for (let x = 0; x < W; x += 3) {
            const u = x / W, cy = H * (rb.base + Math.sin(u * TAU * rb.f1 + t * rb.s1) * rb.a1 + Math.sin(u * TAU * rb.f2 - t * rb.s2) * rb.a2);
            const hh = H * rb.h0 * (0.65 + 0.35 * Math.sin(u * TAU * rb.g1 + t * rb.s1 * 1.7));
            ctx.globalAlpha = clamp((0.5 + 0.4 * Math.sin(u * TAU * rb.g2 + t * rb.s2 * 1.3)) * rb.al * alphaMul * 0.62, 0, 1);
            ctx.drawImage(rb.sp, 0, 0, 2, 256, x - 3, cy - hh * 0.55, 8, hh);
          }
        });
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      };
      curtains(1);
      a.put(s.land, 0, 0);
      // lake with the aurora reflected
      ctx.save(); ctx.beginPath(); ctx.rect(0, s.hy, W, H - s.hy); ctx.clip();
      a.put(s.lake, 0, s.hy);
      ctx.translate(0, s.hy * 2); ctx.scale(1, -1); ctx.globalAlpha = 1; curtains(0.32);
      ctx.restore();
    },
  };

  /* ---------- sunset ocean ---------- */
  scenes.ocean = {
    init(a) {
      const { W, H, pal } = a, s = (a.s = {}), r = rng(17);
      s.hy = H * 0.56; s.sx = W * 0.62;
      s.sky = a.layer(W, H, (g, w, h) => {
        a.vgrad(g, w, s.hy, [[0, [22, 30, 82]], [0.45, mix([118, 70, 140], pal.accent, 0.08)], [0.8, [238, 128, 108]], [1, [255, 196, 124]]]);
        a.vgrad(g, w, h, [[0, [0, 0, 0], 0], [1, [0, 0, 0], 0]]);
      });
      s.sun = a.glow([255, 190, 120], 256);
      s.cloud = a.layer(380, 90, (g, w, h) => { for (let i = 0; i < 7; i++) { const x = w * (0.26 + i * 0.075), y = h * (0.42 + r() * 0.16), rad = h * (0.28 + r() * 0.14); g.save(); g.translate(x, y); g.scale(2.1, 1); const gr = g.createRadialGradient(0, 0, 0, 0, 0, rad); gr.addColorStop(0, 'rgba(255,176,156,.5)'); gr.addColorStop(1, 'rgba(255,176,156,0)'); g.fillStyle = gr; g.fillRect(-rad, -rad, rad * 2, rad * 2); g.restore(); } });
      s.clouds = Array.from({ length: 5 }, () => ({ x: r() * W, y: s.hy * (0.2 + r() * 0.55), sp: 3 + r() * 6, sc: 0.8 + r() * 1.2 }));
      s.waves = Array.from({ length: 7 }, (_, k) => ({ y: s.hy + (k + 0.4) * (H - s.hy) / 7, amp: 1.5 + k * 2.4, f: 0.012 - k * 0.0009, sp: 0.5 + k * 0.12, ph: r() * TAU }));
      s.birds = []; s.nextBird = 3;
    },
    draw(a, t, dt) {
      const { ctx, W, H, s } = a;
      a.put(s.sky, 0, 0);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.9; a.sprite(s.sun, s.sx, s.hy - 6, H * 1.1); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgb(255,240,214)'; ctx.beginPath(); ctx.arc(s.sx, s.hy - 4, 30, Math.PI, TAU); ctx.fill();
      s.clouds.forEach(c => { const x = ((c.x + t * c.sp) % (W + 460)) - 420; ctx.globalAlpha = 0.8; ctx.drawImage(s.cloud, x, c.y, 380 * c.sc, 90 * c.sc); }); ctx.globalAlpha = 1;
      // water
      const wg = ctx.createLinearGradient(0, s.hy, 0, H); wg.addColorStop(0, 'rgb(238,138,116)'); wg.addColorStop(0.18, 'rgb(86,92,148)'); wg.addColorStop(1, 'rgb(8,34,70)');
      ctx.fillStyle = wg; ctx.fillRect(0, s.hy, W, H - s.hy);
      s.waves.forEach((w, k) => {
        const f = k / 6; ctx.beginPath(); ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 6) ctx.lineTo(x, w.y + Math.sin(x * w.f + t * w.sp + w.ph) * w.amp + Math.sin(x * w.f * 2.3 - t * w.sp * 1.3) * w.amp * 0.4);
        ctx.lineTo(W, H); ctx.closePath();
        ctx.fillStyle = `rgba(${Math.round(lerp(60, 6, f))},${Math.round(lerp(96, 38, f))},${Math.round(lerp(150, 76, f))},${0.55 + f * 0.3})`; ctx.fill();
        if (k > 1) { ctx.strokeStyle = `rgba(255,225,200,${0.05 + f * 0.1})`; ctx.lineWidth = 1; ctx.stroke(); }
      });
      // sun glitter path
      ctx.globalCompositeOperation = 'lighter';
      for (let y = s.hy + 5, i = 0; y < H; y += 6, i++) {
        const k = (y - s.hy) / (H - s.hy), w = lerp(16, 150, k) * (0.45 + 0.55 * Math.sin(t * 2.6 + i * 1.7)) , off = Math.sin(t * 1.4 + i) * (4 + k * 14);
        ctx.fillStyle = `rgba(255,208,150,${0.34 * (1 - k * 0.55)})`; ctx.fillRect(s.sx - w / 2 + off, y, Math.max(2, w), 2);
      }
      ctx.globalCompositeOperation = 'source-over';
      // birds
      if (t > s.nextBird) { s.nextBird = t + 9 + Math.random() * 10; const y = s.hy * (0.25 + Math.random() * 0.4), n = 3 + Math.floor(Math.random() * 3); for (let i = 0; i < n; i++) s.birds.push({ x: -40 - i * 34, y: y + i * 9 * (i % 2 ? 1 : -1), v: 70 + Math.random() * 10, ph: Math.random() * TAU }); }
      ctx.strokeStyle = 'rgba(40,24,50,.8)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      for (let i = s.birds.length - 1; i >= 0; i--) {
        const b = s.birds[i]; b.x += b.v * dt; if (b.x > W + 60) { s.birds.splice(i, 1); continue; }
        const fl = Math.sin(t * 7 + b.ph) * 5; ctx.beginPath(); ctx.moveTo(b.x - 9, b.y - fl); ctx.quadraticCurveTo(b.x - 4, b.y - 4 + fl * 0.3, b.x, b.y); ctx.quadraticCurveTo(b.x + 4, b.y - 4 + fl * 0.3, b.x + 9, b.y - fl); ctx.stroke();
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
        a.vgrad(g, w, h, [[0, [10, 22, 52]], [0.5, mix([52, 84, 138], pal.accent, 0.08)], [0.78, [170, 150, 190]], [1, [240, 190, 180]]]);
        for (let i = 0; i < 90 * a.q; i++) { g.fillStyle = `rgba(240,245,255,${0.2 + r() * 0.6})`; g.fillRect(r() * w, r() * h * 0.5, 1, 1); }
      });
      let cabinY = 0; const cabinX = W * 0.2;
      s.hills = a.layer(W, H, (g, w, h) => {
        a.ridge(g, w, h, h * 0.66, h * 0.07, 71, [[120, 148, 200], [170, 190, 226]], { freq: 0.7 });
        a.pineRow(g, w, h * 0.7, h * 0.07, h * 0.15, 3, 'rgb(40,66,96)', { gap: [12, 26], snow: true });
        const fy = a.ridge(g, w, h, h * 0.8, h * 0.05, 83, [[190, 208, 238], [226, 236, 252]], { freq: 0.6 });
        cabinY = fy(cabinX);
        a.pineRow(g, w, h * 0.86, h * 0.1, h * 0.22, 9, 'rgb(28,52,78)', { gap: [30, 70], snow: true, jitter: 3 });
        a.ridge(g, w, h, h * 0.94, h * 0.035, 97, [[236, 243, 255], [212, 226, 248]], { freq: 0.5 });
        [[w * 0.08, h * 0.5], [w * 0.9, h * 0.58], [w * 0.74, h * 0.4]].forEach(([x, ht]) => a.pine(g, x, h * 1.03, ht, 'rgb(14,32,52)', true));
        // cabin
        g.save(); g.translate(cabinX, cabinY + 2); g.fillStyle = 'rgb(46,32,36)'; g.fillRect(-26, -26, 52, 28);
        g.beginPath(); g.moveTo(-32, -26); g.lineTo(0, -48); g.lineTo(32, -26); g.closePath(); g.fillStyle = 'rgb(236,243,255)'; g.fill();
        g.fillStyle = 'rgb(46,32,36)'; g.fillRect(14, -52, 8, 18); g.fillStyle = 'rgb(236,243,255)'; g.fillRect(13, -54, 10, 4); g.restore();
      });
      s.cabin = [cabinX, cabinY];
      s.warm = a.glow([255, 190, 90], 64); s.flake = a.glow([255, 255, 255], 16); s.smk = a.glow([210, 220, 240], 32);
      s.layers = [0, 1, 2].map(li => Array.from({ length: a.n([90, 55, 26][li]) }, () => ({ x: r() * (W + 100), y: r() * H, v: [28, 55, 95][li] * (0.8 + r() * 0.4), sz: [2.5, 4.5, 8][li], sw: 0.5 + r() * 1, ph: r() * TAU, al: [0.5, 0.75, 0.35][li] })));
      s.spark = Array.from({ length: a.n(26) }, () => ({ x: r() * W, y: H * (0.7 + r() * 0.28), sp: 1 + r() * 3, ph: r() * TAU }));
      s.smoke = []; s.acc = 0; s.moon = a.glow([255, 240, 220], 256);
    },
    draw(a, t, dt) {
      const { ctx, W, H, s } = a;
      a.put(s.sky, 0, 0);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5; a.sprite(s.moon, W * 0.72, H * 0.58, H * 0.7); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      a.put(s.hills, 0, 0);
      const [cx, cy] = s.cabin, fl = 0.75 + 0.25 * Math.sin(t * 5) * Math.sin(t * 2.3);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.85 * fl; a.sprite(s.warm, cx - 6, cy - 12, 70); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(255,${190 + 30 * fl},110,.95)`; ctx.fillRect(cx - 12, cy - 18, 11, 9);
      // chimney smoke
      s.acc += dt * 2.2; while (s.acc > 1) { s.acc--; s.smoke.push({ x: cx + 18, y: cy - 54, age: 0, life: 4 + Math.random() * 2 }); }
      for (let i = s.smoke.length - 1; i >= 0; i--) { const p = s.smoke[i]; p.age += dt; if (p.age > p.life) { s.smoke.splice(i, 1); continue; } const k = p.age / p.life; p.y -= 16 * dt; p.x += (10 + 16 * k) * dt; ctx.globalAlpha = 0.28 * (1 - k); a.sprite(s.smk, p.x, p.y, 10 + k * 40); }
      ctx.globalAlpha = 1;
      // twinkles on snow
      ctx.globalCompositeOperation = 'lighter';
      s.spark.forEach(p => { const b = Math.max(0, Math.sin(t * p.sp + p.ph)); ctx.globalAlpha = b * b * b; a.sprite(s.flake, p.x, p.y, 9); });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      // falling snow
      s.layers.forEach((layer, li) => layer.forEach(f => {
        f.y += f.v * dt; if (f.y > H + 12) { f.y = -12; f.x = Math.random() * (W + 100); } if (f.x < -40) f.x += W + 140;
        f.x -= [2, 4, 7][li] * dt;
        const x = f.x + Math.sin(t * f.sw + f.ph) * [10, 18, 30][li];
        ctx.globalAlpha = f.al; a.sprite(s.flake, x, f.y, f.sz * (li === 2 ? 3 : 2));
      }));
      ctx.globalAlpha = 1;
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
    frames++; slow += performance.now() - t0;
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

  window.LiveBG = { start, stop, IDS: Object.keys(scenes) };
})();
