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

  /* ---------- value noise: wind, fog, flicker and organic shapes use this instead of sine waves ---------- */
  const NT = 256, NOISE = (() => { const r = rng(90210), t = new Float32Array(NT * NT); for (let i = 0; i < t.length; i++) t[i] = r(); return t; })();
  function n2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, x0 = xi & 255, x1 = (xi + 1) & 255, y0 = yi & 255, y1 = (yi + 1) & 255;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = NOISE[y0 * NT + x0], b = NOISE[y0 * NT + x1], c = NOISE[y1 * NT + x0], d = NOISE[y1 * NT + x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < (oct || 4); i++) { s += a * n2(x * f, y * f); f *= 2; a *= 0.5; } return s; }
  const wind = (t, o) => (fbm(t * 0.11 + (o || 0), 3.7, 3) - 0.47) * 2.4;          // smooth but irregular, about -1..1
  const gustOf = (t, o) => clamp((fbm(t * 0.07 + (o || 0), 9.1, 3) - 0.42) * 3, 0, 1); // calm spells with occasional gusts

  /* ---------- engine state ---------- */
  let canvas = null, ctx = null, raf = 0, curKey = '', curId = '', scene = null;
  let post = null, emaMs = 0, W = 0, H = 0, dpr = 1, quality = 1, t = 0, last = 0, A = null, slow = 0, frames = 0, resizeTimer = 0;

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
      ctx, W, H, dpr, pal, q: quality, rng, n2, fbm, wind, gust: gustOf, clamp, lerp,
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
      // soft focus for distant layers (depth of field); no-op where canvas filters are unsupported
      blur(c, px) {
        if (!('filter' in c.getContext('2d'))) return c;
        const o = document.createElement('canvas'); o.width = c.width; o.height = c.height;
        const g = o.getContext('2d'); g.filter = `blur(${px * dpr}px)`; g.drawImage(c, 0, 0); o._w = c._w; o._h = c._h; return o;
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
      // organic fir: drooping, uneven branch tiers with ragged tips (every tree differs)
      fir(g, x, y, h, color, r, snow) {
        const n = Math.round(rr(r, 13, 17)), w0 = h * rr(r, 0.2, 0.27), lean = (r() - 0.5) * h * 0.06;
        g.fillStyle = color; g.fillRect(x - h * 0.014, y - h * 0.16, h * 0.028, h * 0.16);
        // solid core so branch tiers never leave see-through gaps
        g.beginPath(); g.moveTo(x + lean, y - h); g.lineTo(x - w0 * 0.5, y - h * 0.1); g.lineTo(x + w0 * 0.5, y - h * 0.1); g.closePath(); g.fill();
        for (let i = 0; i < n; i++) {
          const k = i / (n - 1), yT = y - h * 0.97 + k * h * 0.86, cxk = x + lean * (1 - k);
          for (const sd of [-1, 1]) {
            const wi = w0 * (0.1 + 0.9 * Math.pow(k, 0.85)) * rr(r, 0.8, 1.25), dr = h * 0.05 * (0.5 + k) * rr(r, 0.7, 1.3), tx = cxk + sd * wi, ty = yT + dr;
            g.beginPath(); g.moveTo(cxk, yT - h * 0.04);
            g.quadraticCurveTo(cxk + sd * wi * 0.55, yT - h * 0.02 + dr * 0.2, tx, ty);
            g.lineTo(tx - sd * wi * 0.1, ty + h * 0.014); g.lineTo(cxk + sd * wi * 0.7, ty - dr * 0.2 + h * 0.018); g.lineTo(cxk + sd * wi * 0.4, ty - dr * 0.05 + h * 0.026);
            g.lineTo(cxk + sd * wi * 0.18, yT + dr * 0.6 + h * 0.02); g.lineTo(cxk, yT + h * 0.044); g.closePath(); g.fill();
            if (snow && r() > 0.3) {
              g.fillStyle = 'rgba(232,242,255,.9)'; g.beginPath(); g.moveTo(cxk, yT - h * 0.04);
              g.quadraticCurveTo(cxk + sd * wi * 0.55, yT - h * 0.024 + dr * 0.16, tx - sd * wi * 0.14, ty - h * 0.008);
              g.quadraticCurveTo(cxk + sd * wi * 0.5, yT + dr * 0.04, cxk, yT - h * 0.006); g.closePath(); g.fill(); g.fillStyle = color;
            }
          }
        }
      },
      firRow(g, w, baseY, minH, maxH, seed, color, o) {
        o = o || {}; const r = rng(seed); let x = -20;
        while (x < w + 20) {
          const h = rr(r, minH, maxH), c = o.vary ? rgb(mix(color, o.vary, r() * 0.22)) : rgb(color);
          api.fir(g, x, baseY + (o.jitter ? rr(r, -o.jitter, o.jitter) : 0), h, c, r, o.snow);
          x += rr(r, o.gap ? o.gap[0] : 14, o.gap ? o.gap[1] : 30) * (0.55 + (h / maxH) * 0.7);
        }
      },
      // fractal mountain range: ridged noise, slope shading and aerial haze. returns the y function.
      mountains(g, w, h, baseY, amp, seed, cols, o) {
        o = o || {}; const off = seed * 7.31, f = o.freq || 1;
        const fy = x => { const u = x * 0.0021 * f; let v = 0, a = 0.55, fr = 1; for (let i = 0; i < 5; i++) { v += a * (1 - Math.abs(2 * n2(u * fr + off, i * 3.1 + off) - 1)); fr *= 2.1; a *= 0.5; } return baseY - amp * (v * 1.15 - 0.35); };
        g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w + 3; x += 2) g.lineTo(x, fy(x)); g.lineTo(w, h); g.closePath();
        const gr = g.createLinearGradient(0, baseY - amp, 0, h); gr.addColorStop(0, rgb(cols[0])); gr.addColorStop(1, rgb(cols[1])); g.fillStyle = gr; g.fill();
        // light from one side: lit faces vs shaded faces, drawn as thin strokes down each slope
        const lightDir = o.light == null ? 1 : o.light;
        for (let x = 0; x <= w; x += 2) {
          const y = fy(x), sl = (fy(x + 3) - fy(x - 3)) * lightDir, len = amp * (0.25 + 0.5 * n2(x * 0.03 + off, 5));
          const al = clamp(sl * 0.045, -0.5, 0.5);
          const lg = g.createLinearGradient(0, y, 0, y + len); lg.addColorStop(0, al > 0 ? `rgba(220,232,255,${al * (o.lit || 0.32)})` : `rgba(0,0,0,${-al * (o.shade || 0.7)})`); lg.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = lg; g.fillRect(x, y, 2.4, len);
        }
        if (o.snow) { // snow settles on the upper slopes and fades out downhill
          g.save(); g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w + 3; x += 2) g.lineTo(x, fy(x)); g.lineTo(w, h); g.closePath(); g.clip();
          for (let x = 0; x <= w; x += 2) {
            const y = fy(x), alt = clamp((baseY - amp * o.snow - y) / (amp * 0.3) + 0.5, 0, 1); if (alt <= 0) continue;
            const len = amp * (0.1 + 0.22 * n2(x * 0.03 + off, 11)) * (0.4 + alt), sg = g.createLinearGradient(0, y, 0, y + len);
            sg.addColorStop(0, `rgba(222,234,252,${(o.snowA || 0.5) * alt * (0.6 + 0.4 * n2(x * 0.09, 2))})`); sg.addColorStop(1, 'rgba(222,234,252,0)'); g.fillStyle = sg; g.fillRect(x, y, 2.4, len);
          }
          g.restore();
        }
        if (o.haze) {
          g.save(); g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w + 3; x += 2) g.lineTo(x, fy(x)); g.lineTo(w, h); g.closePath(); g.clip();
          const hz = g.createLinearGradient(0, baseY - amp * 0.45, 0, baseY + amp * 0.3); hz.addColorStop(0, rgb(o.haze, 0)); hz.addColorStop(1, rgb(o.haze, o.hazeA || 0.5)); g.fillStyle = hz; g.fillRect(0, baseY - amp * 0.45, w, h); g.restore();
        }
        return fy;
      },
      // soft clouds from fractal noise: density -> alpha, light from (lx,ly) gives lit rims and shaded bellies
      cloudTex(w, h, seed, cols, o) {
        o = o || {}; const off = seed * 5.17, lx = o.lx == null ? 0.7 : o.lx, ly = o.ly == null ? -0.7 : o.ly;
        const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'), id = g.createImageData(w, h), d = id.data;
        const dens = (x, y) => { const q = fbm(x / w * (o.sx || 3.2) + off, y / h * (o.sy || 3.2) + off * 0.5, 5); return clamp((q - (o.cut == null ? 0.46 : o.cut)) * (o.gain || 4.2), 0, 1); };
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          const dd = dens(x, y); if (dd <= 0.003) continue;
          const lit = clamp(0.5 + (dd - dens(x + lx * 4, y + ly * 4)) * 5, 0, 1), edge = 1 - dd, i = (y * w + x) * 4;
          const base = mix(cols.shadow, cols.lit, clamp(lit * 0.85 + 0.15 * (y / h), 0, 1)), col = mix(base, cols.rim, clamp(edge * edge * lit * 1.2, 0, 1));
          // fade near the texture borders so tiles never show a seam
          const fx = Math.min(x, w - 1 - x) / (w * 0.12), fyy = Math.min(y, h - 1 - y) / (h * 0.2), fade = clamp(Math.min(fx, fyy), 0, 1);
          d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = Math.round(255 * dd * (o.alpha == null ? 0.9 : o.alpha) * fade);
        }
        g.putImageData(id, 0, 0); return c;
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
    post: { bloom: 0.42, grade: 'rgb(120,200,150)', gradeA: 0.14, vignette: 0.45, grain: 0.06 },
    init(a) {
      const { W, H, pal } = a, s = (a.s = {}), LW = W * 1.12;
      const fog = mix(pal.bg2, pal.accent, 0.38), blk = [3, 6, 5], leafDark = mix(pal.hill[1], blk, 0.35), leafLit = mix(mix(pal.accent, [200, 230, 90], 0.45), pal.warm, 0.15);
      const bark = d => (d === 0 ? mix(mix(pal.hill[2], fog, 0.5), blk, 0.1) : d === 1 ? mix(mix(pal.hill[1], blk, 0.3), fog, 0.12) : mix(mix(pal.hill[0], blk, 0.55), pal.accent, 0.03));
      s.sky = a.layer(W, H, (g, w, h) => a.vgrad(g, w, h, [[0, mix(pal.bg1, [6, 18, 26], 0.55)], [0.5, mix(pal.bg2, pal.accent, 0.3)], [1, mix(pal.bg2, pal.warm, 0.24)]]));
      s.sun = a.glow(mix(pal.warm, [255, 255, 255], 0.35), 256);

      const leafTuft = (g, x, y, r, n, spread) => { for (let k = 0; k < n; k++) { g.fillStyle = rgb(mix(leafDark, leafLit, r() * 0.4), 0.9); g.save(); g.translate(x + (r() - 0.5) * spread, y + (r() - 0.5) * spread * 0.7); g.rotate(r() * TAU); g.beginPath(); g.ellipse(0, 0, rr(r, 5, 11), rr(r, 2.2, 4), 0, 0, TAU); g.fill(); g.restore(); } };
      const branch = (g, x, y, ang, len, wd, d, r, c) => {
        if (d > 3 || len < 16) return;
        const ex = x + Math.cos(ang) * len, ey = y + Math.sin(ang) * len, cx = x + Math.cos(ang + (r() - 0.5) * 0.5) * len * 0.55, cy = y + Math.sin(ang) * len * 0.5 - len * 0.12;
        g.strokeStyle = c; g.lineWidth = Math.max(1.2, wd); g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(cx, cy, ex, ey); g.stroke();
        if (d >= 2) leafTuft(g, ex, ey, r, 11, 30);
        branch(g, ex, ey, ang + rr(r, 0.3, 0.8), len * rr(r, 0.55, 0.75), wd * 0.62, d + 1, r, c); branch(g, ex, ey, ang - rr(r, 0.3, 0.8), len * rr(r, 0.5, 0.7), wd * 0.58, d + 1, r, c);
      };
      // tall trunks: wobbling outline from noise, root flare, bark furrows, moss, knots, forking branches
      const trunkLayer = (seed, depth, count, wMin, wMax, baseY) => a.layer(LW, H, (g, w, h) => {
        const r = rng(seed), c = bark(depth);
        for (let i = 0; i < count; i++) {
          const x0 = (i + 0.15 + r() * 0.7) * w / count, tw = rr(r, wMin, wMax), by = h * baseY + rr(r, -6, 8), ph = r() * 60, lean = (r() - 0.5) * tw * 0.5;
          const cxAt = y => x0 + (a.n2(y * 0.004 + ph, 2) - 0.5) * tw * 1.3 + lean * (1 - y / h);
          const wAt = y => { const tt = by - y; return tw * 0.5 * (0.88 + 0.24 * a.n2(y * 0.02 + ph, 5)) * (1 - 0.14 * Math.min(1, tt / h)) * (1 + 1.2 * Math.exp(-tt / (tw * 1.6))); };
          g.beginPath();
          for (let y = by; y >= -10; y -= 5) { const cx = cxAt(y) - wAt(y) * (1 + 0.07 * (a.n2(y * 0.11 + ph, 1) - 0.5)); y === by ? g.moveTo(cx, y) : g.lineTo(cx, y); }
          for (let y = -10; y <= by; y += 5) g.lineTo(cxAt(y) + wAt(y) * (1 + 0.07 * (a.n2(y * 0.11 + ph, 8) - 0.5)), y);
          g.closePath();
          const lg = g.createLinearGradient(x0 - tw, 0, x0 + tw, 0);
          lg.addColorStop(0, rgb(mix(c, blk, 0.4))); lg.addColorStop(0.5, rgb(c)); lg.addColorStop(1, rgb(mix(c, mix(pal.warm, pal.accent, 0.4), depth === 0 ? 0.1 : 0.3)));
          g.fillStyle = lg; g.fill();
          if (depth > 0) {
            g.save(); g.clip();
            for (let k = 0; k < 9; k++) { const u = (r() - 0.5) * 0.9; g.strokeStyle = `rgba(0,0,0,${0.12 + r() * 0.18})`; g.lineWidth = Math.max(1, tw * 0.03 * (0.5 + r())); g.beginPath(); for (let y = by; y >= 0; y -= 8) { const px = cxAt(y) + u * wAt(y) * 2 + (a.n2(y * 0.05 + k * 3, 4) - 0.5) * tw * 0.07; y === by ? g.moveTo(px, y) : g.lineTo(px, y); } g.stroke(); }
            const mg = g.createRadialGradient(x0 - tw * 0.25, by - tw * 0.9, 0, x0 - tw * 0.25, by - tw * 0.9, tw * 1.1); mg.addColorStop(0, rgb(pal.accent, depth === 2 ? 0.26 : 0.14)); mg.addColorStop(1, rgb(pal.accent, 0)); g.fillStyle = mg; g.fillRect(x0 - tw * 2, by - tw * 2.6, tw * 4, tw * 3.2);
            for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(cxAt(h * rr(r, 0.3, 0.8)) + (r() - 0.5) * tw * 0.4, h * rr(r, 0.3, 0.85), tw * 0.05, tw * 0.09, 0, 0, TAU); g.fill(); }
            g.restore();
          }
          if (depth >= 1 && r() > 0.25) { const dir = r() > 0.5 ? 1 : -1, y0 = h * rr(r, 0.2, 0.5); branch(g, cxAt(y0), y0, dir > 0 ? -0.35 : Math.PI + 0.35, tw * rr(r, 3.5, 6), tw * 0.2, 0, r, rgb(mix(c, blk, 0.25))); }
        }
      });
      s.far = trunkLayer(21, 0, 22, 7, 15, 0.8); s.mid = trunkLayer(33, 1, 10, 20, 38, 0.92); s.near = trunkLayer(47, 2, 4, 52, 96, 1.04);

      // a canopy made of thousands of individual leaves, lit from the upper right
      s.canopy = a.layer(LW, H, (g, w, h) => {
        const r = rng(61);
        for (let x = -40; x < w + 40; x += 40) { const rad = rr(r, 50, 100), y = rr(r, -40, h * 0.12); g.fillStyle = rgb(mix(leafDark, blk, 0.5)); g.beginPath(); g.arc(x, y, rad, 0, TAU); g.fill(); }
        const N = Math.round(3600 * a.q);
        for (let i = 0; i < N; i++) {
          const x = r() * w, y = Math.pow(r(), 1.55) * h * 0.34 - 14, lit = clamp((1 - y / (h * 0.28)) * (0.25 + 0.75 * x / w) * (0.4 + r() * 0.9), 0, 1);
          g.fillStyle = rgb(mix(mix(leafDark, blk, 0.2 + r() * 0.3), leafLit, lit * lit), 0.92); g.save(); g.translate(x, y); g.rotate(r() * TAU); g.beginPath(); g.ellipse(0, 0, rr(r, 6, 13), rr(r, 2.6, 5.5), 0, 0, TAU); g.fill(); g.restore();
        }
        g.strokeStyle = rgb(mix(pal.hill[1], blk, 0.2)); g.lineCap = 'round';
        for (let i = 0; i < 30; i++) { const x = r() * w, len = rr(r, h * 0.1, h * 0.32); g.lineWidth = rr(r, 1, 2.4); g.beginPath(); g.moveTo(x, h * 0.1); g.bezierCurveTo(x + rr(r, -16, 16), h * 0.1 + len * 0.4, x + rr(r, -22, 22), h * 0.1 + len * 0.7, x + rr(r, -10, 10), h * 0.1 + len); g.stroke(); for (let k = 0; k < 5; k++) leafTuft(g, x + rr(r, -8, 8), h * 0.1 + len * (0.25 + k * 0.18), r, 1, 8); }
        g.globalCompositeOperation = 'source-atop'; const vgr = g.createLinearGradient(0, 0, 0, h * 0.36); vgr.addColorStop(0, 'rgba(0,0,0,.4)'); vgr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = vgr; g.fillRect(0, 0, w, h * 0.36); g.globalCompositeOperation = 'source-over';
      });

      // mossy floor: grass, leaf litter and little glowing mushrooms
      const mushrooms = [];
      s.ground = a.layer(W, H, (g, w, h) => {
        const r = rng(73), gg = g.createLinearGradient(0, h * 0.8, 0, h);
        gg.addColorStop(0, rgb(mix(pal.hill[1], fog, 0.2), 0)); gg.addColorStop(0.35, rgb(mix(pal.hill[1], blk, 0.35), 0.95)); gg.addColorStop(1, rgb(mix(pal.hill[0], blk, 0.65)));
        g.fillStyle = gg; g.fillRect(0, h * 0.8, w, h * 0.2);
        for (let i = 0; i < 380; i++) { g.fillStyle = `rgba(${90 + r() * 60},${60 + r() * 30},${30 + r() * 20},${0.12 + r() * 0.2})`; g.save(); g.translate(r() * w, h * rr(r, 0.9, 1)); g.rotate(r() * TAU); g.beginPath(); g.ellipse(0, 0, rr(r, 3, 8), rr(r, 1.5, 3.5), 0, 0, TAU); g.fill(); g.restore(); }
        for (let i = 0; i < 620; i++) {
          const x = r() * w, y = h * rr(r, 0.88, 1), bh = rr(r, 8, 28) * (0.5 + (y / h - 0.88) * 6), lean = (r() - 0.5) * 9;
          g.fillStyle = rgb(mix(mix(pal.hill[1], pal.accent, rr(r, 0.1, 0.55)), blk, rr(r, 0.1, 0.45)));
          g.beginPath(); g.moveTo(x - 1.6, y); g.quadraticCurveTo(x + lean * 0.3, y - bh * 0.6, x + lean, y - bh); g.quadraticCurveTo(x + lean * 0.4, y - bh * 0.5, x + 1.6, y); g.fill();
        }
        for (let i = 0; i < 9; i++) {
          const x = w * (0.06 + r() * 0.88), y = h * rr(r, 0.93, 0.985), sc = rr(r, 0.7, 1.5);
          g.fillStyle = 'rgba(190,200,190,.8)'; g.fillRect(x - 1.5 * sc, y - 9 * sc, 3 * sc, 9 * sc);
          g.fillStyle = rgb(mix(pal.accent, i % 2 ? [150, 120, 255] : [90, 255, 220], 0.5), 0.95); g.beginPath(); g.ellipse(x, y - 9 * sc, 8 * sc, 5 * sc, 0, Math.PI, TAU); g.fill();
          mushrooms.push({ x, y: y - 9 * sc, sc, c: i % 2 });
        }
      });
      s.mush = mushrooms;
      s.mg = [a.glow(mix(pal.accent, [90, 255, 220], 0.55), 64), a.glow([170, 130, 255], 64)];
      s.mote = a.glow([255, 244, 214], 32); s.spore = [a.glow(mix(pal.accent, [120, 255, 230], 0.5), 32), a.glow([255, 150, 220], 32)]; s.fly = a.glow(mix(pal.warm, [230, 255, 130], 0.5), 32);
      s.fogTex = a.cloudTex(1024, 190, 2, { shadow: mix(fog, [0, 0, 0], 0.1), lit: mix(fog, [255, 255, 255], 0.18), rim: mix(fog, [255, 255, 255], 0.3) }, { sx: 3.2, sy: 1.5, cut: 0.4, gain: 2.2, alpha: 0.6 });
      const r = rng(5);
      s.rays = Array.from({ length: 12 }, (_, i) => ({ x: W * (0.32 + i * 0.06) + r() * 40, w: 16 + r() * 60, ph: r() * 90, len: 0.45 + r() * 0.2 }));
      s.motes = Array.from({ length: a.n(54) }, () => ({ x: W * (0.2 + r() * 0.8), y: r() * H * 0.9, sz: 5 + r() * 9, ph: r() * 90, bl: 0.6 + r() * 1.6 }));
      s.spores = Array.from({ length: a.n(34) }, () => ({ x: r() * W, y: H * (0.5 + r() * 0.5), vy: -(8 + r() * 16), ph: r() * 90, sz: 8 + r() * 14, c: r() > 0.7 ? 1 : 0 }));
      s.flies = Array.from({ length: a.n(26) }, () => ({ x: r() * W, y: H * (0.4 + r() * 0.5), ax: 50 + r() * 90, ay: 24 + r() * 50, sp: 0.5 + r() * 0.8, ph: r() * 90, bl: 0.5 + r() * 1.4, sz: 14 + r() * 14 }));
      s.leaves = Array.from({ length: a.n(14) }, () => ({ x: r() * W, y: r() * H, v: 14 + r() * 24, ph: r() * 90, rot: r() * TAU, sp: 0.6 + r() * 1.6, sz: 3 + r() * 4, c: r() > 0.5 }));
      s.foff = [r() * 900, r() * 900, r() * 900];
      s.ferns = Array.from({ length: 10 }, (_, i) => ({ x: W * (0.03 + i * 0.105 + r() * 0.04), y: H * (0.97 + r() * 0.04), sc: 0.7 + r() * 0.9, ph: r() * 90, n: 7 + Math.floor(r() * 3) }));
    },
    draw(a, t, dt) {
      const { ctx, W, H, s, pal } = a, gust = a.gust(t, 5), wd = a.wind(t, 1);
      s.foff[0] += (5 + gust * 14) * dt; s.foff[1] += (8 + gust * 18) * dt; s.foff[2] += (6 + gust * 10) * dt;
      const slide = (k, amp) => -W * 0.06 + (a.fbm(t * 0.03 + k, 2, 2) - 0.45) * W * amp * 6;
      a.put(s.sky, 0, 0);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.55; a.sprite(s.sun, W * 0.78, H * 0.04, H * 1.1); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      a.put(s.far, slide(0, 0.012), 0);
      const fogBand = (k, y, h, al) => { const w = s.fogTex.width * (h / s.fogTex.height), x0 = -(s.foff[k] % w); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = al; for (let x = x0; x < W; x += w) ctx.drawImage(s.fogTex, x, y, w + 1, h); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; };
      fogBand(0, H * 0.5, H * 0.34, 0.5);
      a.put(s.mid, slide(1.7, 0.02), 0);
      // dappled light shafts whose strength drifts like light through moving leaves, with dust in the beams
      ctx.globalCompositeOperation = 'lighter';
      s.rays.forEach(rw => {
        const al = 0.02 + 0.1 * Math.pow(a.n2(t * 0.09 + rw.ph, 3), 1.4), x0 = rw.x + (a.n2(t * 0.05 + rw.ph, 7) - 0.5) * 40, len = H * rw.len;
        const gr = ctx.createLinearGradient(x0, 0, x0 - len, H); gr.addColorStop(0, rgb(mix(pal.warm, [255, 255, 255], 0.5), al * 1.5)); gr.addColorStop(0.6, rgb(pal.warm, al * 0.5)); gr.addColorStop(1, rgb(pal.warm, 0));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(x0, -10); ctx.lineTo(x0 + rw.w, -10); ctx.lineTo(x0 - len + rw.w * 2.2, H); ctx.lineTo(x0 - len, H); ctx.closePath(); ctx.fill();
      });
      s.motes.forEach(m => {
        m.x += (-6 + (a.n2(m.x * 0.006 + t * 0.07, m.y * 0.006) - 0.5) * 22 + wd * 8) * dt; m.y += (4 + (a.n2(m.x * 0.006, m.y * 0.006 + t * 0.07) - 0.5) * 16) * dt;
        if (m.x < -20 || m.y > H + 10 || m.x > W + 30) { m.x = W * (0.4 + Math.random() * 0.7); m.y = -10; }
        const b = Math.max(0, Math.sin(t * m.bl + m.ph)); ctx.globalAlpha = 0.15 + 0.6 * b * b * (0.5 + a.n2(t * 0.3 + m.ph, 1)); a.sprite(s.mote, m.x, m.y, m.sz);
      });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      a.put(s.near, slide(3.1, 0.035), 0);
      fogBand(1, H * 0.68, H * 0.3, 0.55);
      ctx.save(); const k = wd * 0.004 * (0.5 + gust); ctx.transform(1, 0, k, 1, 0, 0); a.put(s.canopy, -W * 0.06 + (a.fbm(t * 0.04, 4, 2) - 0.45) * W * 0.05, 0); ctx.restore();
      a.put(s.ground, 0, 0);
      ctx.lineCap = 'round';
      s.ferns.forEach(f => {
        const br = a.wind(t * 1.3, f.ph) * 0.08 * (0.5 + gust);
        for (let i = 0; i < f.n; i++) {
          const u = i / (f.n - 1), ang = (-1.25 + u * 2.5) + br + (a.n2(t * 0.8 + f.ph + i, 2) - 0.5) * 0.05, len = (46 + 24 * Math.cos((u - 0.5) * 2.6)) * f.sc;
          const ex = f.x + Math.sin(ang) * len, ey = f.y - Math.cos(ang) * len, cx = f.x + Math.sin(ang) * len * 0.45, cy = f.y - Math.cos(ang) * len * 0.8;
          ctx.strokeStyle = rgb(mix(mix(pal.hill[1], pal.accent, 0.35), [2, 8, 4], i % 2 ? 0.25 : 0.05), 0.95); ctx.lineWidth = 2.4 * f.sc;
          ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.quadraticCurveTo(cx, cy, ex, ey); ctx.stroke();
          ctx.lineWidth = 1.3 * f.sc; for (let j = 1; j < 7; j++) { const q = j / 7, px = (1 - q) * (1 - q) * f.x + 2 * (1 - q) * q * cx + q * q * ex, py = (1 - q) * (1 - q) * f.y + 2 * (1 - q) * q * cy + q * q * ey, sz = (1 - q * 0.6) * 11 * f.sc; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - Math.cos(ang) * sz, py - Math.sin(ang) * sz * 0.6); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(ang) * sz, py + Math.sin(ang) * sz * 0.6); ctx.stroke(); }
        }
      });
      ctx.globalCompositeOperation = 'lighter';
      s.mush.forEach((m, i) => { const p = 0.5 + 0.5 * Math.sin(t * 1.1 + i * 1.9) * (0.7 + 0.5 * a.n2(t * 0.4 + i, 2)); ctx.globalAlpha = 0.4 + 0.5 * p; a.sprite(s.mg[m.c], m.x, m.y, 46 * m.sc + p * 10); });
      s.spores.forEach(p => { p.y += (p.vy + (a.n2(p.x * 0.01 + t * 0.1, p.y * 0.01) - 0.5) * 14) * dt; p.x += (a.n2(p.x * 0.005, p.y * 0.01 + t * 0.12 + p.ph) - 0.5) * 30 * dt; if (p.y < -10) { p.y = H + 10; p.x = Math.random() * W; } const b = 0.5 + 0.5 * Math.sin(t * 1.3 + p.ph); ctx.globalAlpha = 0.15 + 0.7 * b; a.sprite(s.spore[p.c], p.x, p.y, p.sz * (0.8 + 0.4 * b)); });
      s.flies.forEach(f => { const x = f.x + (a.fbm(t * 0.1 * f.sp + f.ph, 1, 2) - 0.47) * 2 * f.ax, y = f.y + (a.fbm(t * 0.09 * f.sp + f.ph, 7, 2) - 0.47) * 2 * f.ay, b = Math.pow(Math.max(0, Math.sin(t * f.bl + f.ph)), 2) * (0.5 + a.n2(t * 0.5 + f.ph, 4)); ctx.globalAlpha = 0.12 + 0.88 * Math.min(1, b); a.sprite(s.fly, x, y, f.sz * (0.7 + 0.5 * b)); });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      s.leaves.forEach(l => {
        l.y += l.v * dt; l.rot += l.sp * dt; if (l.y > H + 10) { l.y = -10; l.x = Math.random() * W; }
        const x = l.x + (a.n2(l.y * 0.01 + l.ph, t * 0.2) - 0.5) * 90 + wd * 20;
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
    post: { bloom: 0.36, grade: 'rgb(90,200,170)', gradeA: 0.1, vignette: 0.4, grain: 0.07 },
    init(a) {
      const { W, H, pal } = a, s = (a.s = {}), r = rng(13);
      const hy = (s.hy = Math.round(H * 0.7));
      s.sky = a.layer(W, hy, (g, w, h) => {
        a.vgrad(g, w, h, [[0, [2, 4, 12]], [0.65, [7, 18, 38]], [1, [16, 38, 62]]]);
        g.save(); g.translate(w * 0.62, h * 0.35); g.rotate(-0.5);
        const mg = g.createLinearGradient(0, -h * 0.28, 0, h * 0.28); mg.addColorStop(0, 'rgba(120,130,200,0)'); mg.addColorStop(0.5, 'rgba(150,160,225,.13)'); mg.addColorStop(1, 'rgba(120,130,200,0)'); g.fillStyle = mg; g.fillRect(-w, -h * 0.28, w * 2, h * 0.56);
        for (let i = 0; i < 900 * a.q; i++) { g.fillStyle = `rgba(215,225,255,${0.12 + r() * 0.5})`; g.fillRect((r() - 0.5) * w * 1.6, (r() + r() + r() - 1.5) * h * 0.16, 1.2, 1.2); }
        g.restore();
        for (let i = 0; i < 260 * a.q; i++) { const c = [[255, 255, 255], [190, 215, 255], [255, 236, 205]][Math.floor(r() * 3)]; g.fillStyle = rgb(c, 0.4 + r() * 0.6); const sz = r() > 0.94 ? 1.9 : r() > 0.7 ? 1.3 : 0.9; g.fillRect(r() * w, r() * h * 0.82, sz, sz); }
        const ag = g.createLinearGradient(0, h * 0.6, 0, h); ag.addColorStop(0, 'rgba(60,160,140,0)'); ag.addColorStop(1, 'rgba(60,170,150,.22)'); g.fillStyle = ag; g.fillRect(0, h * 0.6, w, h * 0.4); // airglow
      });
      s.twink = Array.from({ length: a.n(70) }, () => ({ x: r() * W, y: r() * hy * 0.8, sp: 0.7 + r() * 2.2, ph: r() * TAU, sz: 3 + r() * 5 }));
      s.tg = a.glow([255, 255, 255], 32);
      const mk = c => a.layer(2, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, rgb(mix(c, [190, 60, 200], 0.35), 0)); gr.addColorStop(0.2, rgb(mix(c, [150, 80, 230], 0.25), 0.14)); gr.addColorStop(0.5, rgb(c, 0.8)); gr.addColorStop(0.64, rgb(mix(c, [255, 255, 255], 0.4), 0.92)); gr.addColorStop(0.86, rgb(c, 0.2)); gr.addColorStop(1, rgb(c, 0)); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
      s.rib = [
        { sp: mk(mix([70, 255, 160], pal.accent, 0.2)), base: 0.28, amp: 0.16, h0: 0.36, al: 1, k: 1 },
        { sp: mk(mix([40, 215, 230], pal.accent, 0.12)), base: 0.35, amp: 0.13, h0: 0.3, al: 0.75, k: 2 },
        { sp: mk(mix([175, 95, 245], pal.warm, 0.2)), base: 0.22, amp: 0.1, h0: 0.24, al: 0.6, k: 3 },
        { sp: mk([255, 110, 170]), base: 0.17, amp: 0.08, h0: 0.14, al: 0.32, k: 4 },
      ];
      s.mtn = a.layer(W, hy, (g, w, h) => {
        a.mountains(g, w, h, h * 0.86, h * 0.36, 41, [[70, 92, 140], [10, 16, 34]], { freq: 0.7, snow: 0.45, snowA: 0.28, haze: [50, 120, 130], hazeA: 0.4, lit: 0.22 });
        a.mountains(g, w, h, h * 0.94, h * 0.18, 43, [[30, 46, 78], [6, 10, 22]], { freq: 1.2, light: -1, haze: [50, 110, 120], hazeA: 0.35 });
      });
      s.buf = a.layer(W, hy, () => {}); s.bg = s.buf.getContext('2d');
      s.shore = a.layer(W, H, (g, w, h) => {
        g.fillStyle = 'rgb(5,9,16)'; g.fillRect(0, hy - 1, w, 7);
        a.firRow(g, w, hy + 4, h * 0.06, h * 0.14, 8, [3, 6, 12], { gap: [9, 22], vary: [14, 24, 40] });
        a.ridge(g, w, h, h * 0.97, h * 0.025, 83, [[6, 10, 18], [2, 4, 8]], { freq: 0.4 });
        const fr = rng(31); [[w * 0.03, h * 0.5], [w * 0.11, h * 0.34], [w * 0.95, h * 0.46], [w * 0.88, h * 0.3]].forEach(([x, ht]) => a.fir(g, x, h * 1.03, ht, 'rgb(2,4,8)', fr));
      });
      s.tent = { x: W * 0.24, y: H * 0.955 };
      s.warm = a.glow([255, 170, 80], 128); s.spark = a.glow([255, 210, 130], 16);
      s.fogTex = a.cloudTex(1024, 140, 6, { shadow: [120, 170, 180], lit: [170, 215, 225], rim: [200, 235, 240] }, { sx: 3, sy: 1.4, cut: 0.42, gain: 2.2, alpha: 0.5 }); s.foff = r() * 900;
      s.ripples = []; s.nextRip = 1; s.shoot = []; s.nextShoot = 3 + r() * 4; s.fire = [];
    },
    draw(a, t, dt) {
      const { ctx, W, H, s } = a, hy = s.hy, bg = s.bg, gust = a.gust(t, 2);
      s.foff += (5 + gust * 8) * dt;
      // ---- sky buffer: stars, aurora with fine ray structure, mountains ----
      bg.globalCompositeOperation = 'source-over'; bg.globalAlpha = 1; bg.drawImage(s.sky, 0, 0, W, hy);
      bg.globalCompositeOperation = 'lighter';
      s.twink.forEach(st => { const b = 0.5 + 0.5 * Math.sin(t * st.sp + st.ph) * (0.6 + 0.8 * a.n2(t * 0.5 + st.ph, 1)); bg.globalAlpha = clamp(0.2 + 0.8 * b * b, 0, 1); bg.drawImage(s.tg, st.x - st.sz, st.y - st.sz, st.sz * 2, st.sz * 2); });
      s.rib.forEach(rb => {
        for (let x = 0; x < W; x += 4) {
          const u = x / W, k = rb.k, fold = (a.fbm(u * 2.1 + t * 0.035 * k + k * 7, k, 3) - 0.47) * rb.amp * 5.2 + (a.fbm(u * 5 - t * 0.05, k + 3, 2) - 0.47) * rb.amp * 1.1;
          const cy = hy * (rb.base + fold), env = 0.45 + 0.8 * a.fbm(u * 1.7 + t * 0.03 + k * 2, 5 + k, 3);
          const rays = 0.55 + 0.7 * a.n2(x * 0.045 + t * 0.4 * (k % 2 ? 1 : -1), k * 3.3) * (0.6 + 0.6 * a.n2(x * 0.011 - t * 0.1, k));
          const hh = hy * rb.h0 * 1.05 * clamp(env, 0.15, 1.2) * (1 + 0.1 * Math.sin(x * 0.7 + t));
          bg.globalAlpha = clamp(env * rays * rb.al * 0.4 * (0.7 + 0.5 * a.n2(t * 0.15 + k, 9)), 0, 1);
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

      // ---- lake: dark water with the whole sky mirrored, rippled by noise ----
      const lh = H - hy, wg = ctx.createLinearGradient(0, hy, 0, H); wg.addColorStop(0, 'rgb(10,28,42)'); wg.addColorStop(1, 'rgb(2,6,12)'); ctx.fillStyle = wg; ctx.fillRect(0, hy, W, lh);
      const dpr = a.dpr, sq = hy / lh, calm = 1 - gust * 0.5;
      for (let y = 0; y < lh; y += 3) {
        const k = y / lh, srcH = 3 * sq, srcY = clamp(hy - (y + 3) * sq, 0, hy - srcH);
        const off = (a.n2(y * 0.09 + t * 0.35, 4) - 0.5) * (4 + k * 22) * (0.6 + 0.8 * (1 - calm + 0.5)) + (a.n2(y * 0.3 - t * 0.6, 8) - 0.5) * (1.5 + k * 5);
        ctx.globalAlpha = 0.62 * (1 - k * 0.7) * (0.82 + 0.3 * a.n2(y * 0.2 + t * 0.4, 2));
        ctx.drawImage(s.buf, 0, srcY * dpr, W * dpr, srcH * dpr, off, hy + y, W, 3);
      }
      ctx.globalAlpha = 1;
      if (t > s.nextRip) { s.nextRip = t + 0.7 + Math.random() * 2; s.ripples.push({ x: Math.random() * W, y: hy + 14 + Math.random() * (lh - 40), age: 0 }); }
      ctx.lineWidth = 1;
      for (let i = s.ripples.length - 1; i >= 0; i--) { const p = s.ripples[i]; p.age += dt; const k = p.age / 2.4; if (k >= 1) { s.ripples.splice(i, 1); continue; } ctx.strokeStyle = `rgba(190,230,235,${0.22 * (1 - k)})`; ctx.beginPath(); ctx.ellipse(p.x, p.y, 4 + k * 44, 1 + k * 7, 0, 0, TAU); ctx.stroke(); }
      { const fw = s.fogTex.width * (H * 0.2 / s.fogTex.height), x0 = -(s.foff % fw); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.4; for (let x = x0; x < W; x += fw) ctx.drawImage(s.fogTex, x, hy - H * 0.06, fw + 1, H * 0.2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      a.put(s.shore, 0, 0);
      // ---- tent and a small fire; flicker comes from layered noise ----
      const { x: tx, y: ty } = s.tent, fl = clamp(0.78 + 0.34 * (a.n2(t * 4.2, 3) - 0.5) + 0.22 * (a.n2(t * 11, 7) - 0.5), 0.45, 1);
      ctx.fillStyle = 'rgb(8,10,18)'; ctx.beginPath(); ctx.moveTo(tx - 46, ty); ctx.lineTo(tx, ty - 44); ctx.lineTo(tx + 46, ty); ctx.closePath(); ctx.fill();
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,${150 + 40 * fl},70,${0.55 * fl})`; ctx.beginPath(); ctx.moveTo(tx - 14, ty); ctx.lineTo(tx, ty - 24); ctx.lineTo(tx + 14, ty); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.55 * fl; a.sprite(s.warm, tx + 70, ty + 4, 150); a.sprite(s.warm, tx, ty - 14, 110); ctx.globalAlpha = 1;
      if (Math.random() < dt * 12) s.fire.push({ x: tx + 70 + (Math.random() - 0.5) * 6, y: ty, vx: (Math.random() - 0.5) * 16, vy: -(30 + Math.random() * 40), age: 0, life: 0.7 + Math.random() * 0.8 });
      for (let i = s.fire.length - 1; i >= 0; i--) { const p = s.fire[i]; p.age += dt; if (p.age > p.life) { s.fire.splice(i, 1); continue; } p.x += p.vx * dt; p.y += p.vy * dt; ctx.globalAlpha = (1 - p.age / p.life) * 0.9; a.sprite(s.spark, p.x, p.y, 9 * (1 - p.age / p.life) + 3); }
      ctx.globalAlpha = 0.18 * fl; ctx.drawImage(s.warm, tx + 44, ty - 70, 52, 80); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    },
  };

  /* ---------- sunset ocean ---------- */
  scenes.ocean = {
    post: { bloom: 0.34, grade: 'rgb(255,150,100)', gradeA: 0.16, vignette: 0.3, grain: 0.05 },
    init(a) {
      const { W, H, pal } = a, s = (a.s = {}), r = rng(17);
      const hy = (s.hy = Math.round(H * 0.56)); s.sx = W * 0.6;
      s.sky = a.layer(W, hy + 2, (g, w, h) => {
        a.vgrad(g, w, h, [[0, [12, 16, 58]], [0.22, mix([58, 42, 112], pal.accent, 0.05)], [0.46, [150, 76, 132]], [0.7, [236, 118, 104]], [0.88, [255, 172, 108]], [1, [255, 210, 146]]]);
        for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,240,230,${0.1 + r() * 0.45})`; g.fillRect(r() * w, r() * h * 0.32, 1.2, 1.2); }
      });
      s.sun = a.glow([255, 196, 128], 256); s.sunHot = a.glow([255, 240, 200], 128);
      // clouds are generated from fractal noise and lit from the sun (violet bellies, glowing rims)
      s.cA = a.cloudTex(640, 200, 3, { shadow: [78, 52, 112], lit: [250, 150, 108], rim: [255, 214, 158] }, { sx: 3.4, sy: 2.4, cut: 0.5, gain: 4, alpha: 0.95, lx: 0.2, ly: 0.9 });
      s.cB = a.cloudTex(720, 110, 9, { shadow: [140, 90, 138], lit: [255, 170, 124], rim: [255, 224, 176] }, { sx: 5.5, sy: 1.5, cut: 0.52, gain: 3.4, alpha: 0.78, lx: 0.2, ly: 0.9 });
      s.cC = a.cloudTex(720, 140, 5, { shadow: [190, 120, 150], lit: [255, 184, 150], rim: [255, 230, 196] }, { sx: 2, sy: 7, cut: 0.54, gain: 3, alpha: 0.5, lx: 0.2, ly: 0.9 });
      s.off = [r() * 600, r() * 700, r() * 700];
      s.island = a.layer(W, hy + 6, (g, w, h) => { a.mountains(g, w, h, hy + 2, 34, 52, [[132, 86, 128], [170, 104, 128]], { freq: 0.45, haze: [255, 176, 130], hazeA: 0.6, light: -1, lit: 0.3 }); });
      // the water is shaded per pixel at low resolution: ripples in perspective, Fresnel sky reflection, sun glitter
      const dv = a.q < 0.7 ? 5 : 3, wb = (s.wb = { w: Math.max(200, Math.round(W / dv)), h: Math.max(60, Math.round((H - hy) / dv)) });
      wb.cv = document.createElement('canvas'); wb.cv.width = wb.w; wb.cv.height = wb.h; wb.cx = wb.cv.getContext('2d'); wb.id = wb.cx.createImageData(wb.w, wb.h); wb.u32 = new Uint32Array(wb.id.data.buffer);
      s.birds = []; s.nextBird = 4; s.boat = { x: W * 0.8, y: hy + (H - hy) * 0.035 };
    },
    draw(a, t, dt) {
      const { ctx, W, H, s } = a, hy = s.hy, sx = s.sx, sy = hy - 12, gust = a.gust(t, 3), wd = 0.5 + a.wind(t, 2) * 0.4;
      s.off[0] += (4 + gust * 5) * dt * wd; s.off[1] += (7 + gust * 8) * dt * wd; s.off[2] += (2.5 + gust * 3) * dt;
      a.put(s.sky, 0, 0);
      // sun glow, irregular crepuscular rays
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 11; i++) {
        const base = -1.3 + i * 0.26 + (a.n2(i * 3.3, 1) - 0.5) * 0.3, w = 0.07 + a.n2(i, 4) * 0.09, al = 0.012 + 0.07 * a.n2(t * 0.06 + i * 7.1, 3) * a.n2(i * 1.7, 8), len = H * (0.8 + a.n2(i, 6) * 0.7);
        const gr = ctx.createRadialGradient(sx, sy, 0, sx, sy, len); gr.addColorStop(0, `rgba(255,200,140,${al})`); gr.addColorStop(0.6, `rgba(255,186,130,${al * 0.5})`); gr.addColorStop(1, 'rgba(255,170,120,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.sin(base - w) * len, sy - Math.cos(base - w) * len); ctx.lineTo(sx + Math.sin(base + w) * len, sy - Math.cos(base + w) * len); ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 0.95; a.sprite(s.sun, sx, sy, H * 1.2); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, hy); ctx.clip();
      ctx.fillStyle = 'rgb(255,242,214)'; ctx.beginPath(); ctx.arc(sx, sy + 2, 32, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.9; a.sprite(s.sunHot, sx, sy, 170); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      const tile = (img, off, y, h, al, wScale) => { const w = img.width * (h / img.height) * wScale, x0 = -(off % w); ctx.globalAlpha = al; for (let x = x0; x < W; x += w) ctx.drawImage(img, x, y, w + 1, h); ctx.globalAlpha = 1; };
      tile(s.cC, s.off[2], hy * 0.02, hy * 0.42, 0.7, 1.15);
      tile(s.cA, s.off[0], hy * 0.1, hy * 0.5, 1, 1.0);
      tile(s.cB, s.off[1], hy * 0.55, hy * 0.28, 0.9, 1.0);
      ctx.restore();
      a.put(s.island, 0, 0);
      // atmospheric haze over the horizon
      const hg = ctx.createLinearGradient(0, hy - 46, 0, hy + 10); hg.addColorStop(0, 'rgba(255,196,130,0)'); hg.addColorStop(0.75, 'rgba(255,212,150,.5)'); hg.addColorStop(1, 'rgba(255,196,130,0)'); ctx.fillStyle = hg; ctx.fillRect(0, hy - 46, W, 56);

      // ---- per-pixel water ----
      const wb = s.wb, u32 = wb.u32, ww = wb.w, wh = wb.h, bumpy = 0.8 + gust * 0.5, cs = 0.866, sn = 0.5;
      for (let j = 0; j < wh; j++) {
        const yy = (j + 0.5) / wh, z = 1 / (yy * 0.96 + 0.04), fres = clamp(0.06 + 0.72 * Math.pow(1 - yy, 2.6), 0, 1), el = yy * 0.7;
        // the sky as mirrored by the water at this distance: low warm sky near the horizon, higher violet sky closer to us
        const sk = el < 0.12 ? [250, 170, 118] : el < 0.3 ? mix([250, 170, 118], [214, 98, 112], (el - 0.12) / 0.18) : mix([214, 98, 112], [62, 50, 124], clamp((el - 0.3) / 0.4, 0, 1));
        const deep = mix([24, 64, 98], [6, 20, 48], Math.pow(yy, 0.7)), detail = 1 / (1 + z * 0.1), spread = 0.003 + yy * 0.028;
        for (let i = 0; i < ww; i++) {
          const xx = (i + 0.5) / ww, wx = (xx - 0.5) * z * 2.4, wz = z * 1.2 - t * 0.5;
          const ux = wx * cs - wz * sn, uz = wx * sn + wz * cs;
          const swell = a.n2(ux * 0.9 + 4, uz * 0.7) * 0.6 + a.n2(ux * 2.3 + 11, uz * 1.9 - t * 0.1) * 0.4;
          // many fine ripples, stretched across the view like real wind ripples
          const q1 = a.n2(wx * 6 + 2, wz * 13 - t * 0.5), q1b = a.n2(wx * 6 + 2, (wz + 0.03) * 13 - t * 0.5);
          const q2 = a.n2(wx * 14 + 9, wz * 28 + t * 0.8), q2b = a.n2(wx * 14 + 9, (wz + 0.015) * 28 + t * 0.8);
          const slope = ((q1b - q1) * 9 + (q2b - q2) * 6 * detail) * bumpy;
          const f = clamp(fres * (0.6 + 0.8 * swell) + slope * 0.05, 0, 1);
          let R = deep[0] * (1 - f) + sk[0] * f, G = deep[1] * (1 - f) + sk[1] * f, B = deep[2] * (1 - f) + sk[2] * f;
          const dx = (xx - sx / W) + slope * 0.004, pw = Math.exp(-(dx * dx) / spread);
          const glint = clamp(slope * 0.9 - 0.34 + (swell - 0.5) * 0.5, 0, 1) * pw * (1 - yy * 0.5);
          R += 255 * glint * 2.1; G += 218 * glint * 2.1; B += 156 * glint * 1.9;
          const sheen = pw * 0.16 * (1 - yy * 0.45); R += 230 * sheen; G += 126 * sheen; B += 80 * sheen;
          u32[j * ww + i] = (255 << 24) | (clamp(B, 0, 255) << 16) | (clamp(G, 0, 255) << 8) | clamp(R, 0, 255);
        }
      }
      wb.cx.putImageData(wb.id, 0, 0);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(wb.cv, 0, hy, W, H - hy);

      // sailboat, reflected and bobbing irregularly
      const b = s.boat, bob = (a.n2(t * 0.5, 4) - 0.5) * 3, bx = b.x + (a.n2(t * 0.03, 6) - 0.5) * 16, by = b.y + bob, tilt = (a.n2(t * 0.4 + 9, 2) - 0.5) * 0.09;
      ctx.save(); ctx.translate(bx, by); ctx.rotate(tilt);
      ctx.fillStyle = 'rgb(40,20,44)'; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.lineTo(10, 5); ctx.lineTo(-10, 5); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgb(62,34,62)'; ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(0, -2); ctx.lineTo(11, -2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgb(84,46,76)'; ctx.beginPath(); ctx.moveTo(-1, -26); ctx.lineTo(-1, -2); ctx.lineTo(-10, -2); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.globalAlpha = 0.22; ctx.fillStyle = 'rgb(40,20,44)'; ctx.fillRect(bx - 3, by + 6, 6, 16 + a.n2(t, 3) * 6); ctx.globalAlpha = 1;
      // birds
      if (t > s.nextBird) { s.nextBird = t + 11 + Math.random() * 12; const y = hy * (0.14 + Math.random() * 0.36), n = 3 + Math.floor(Math.random() * 4); for (let i = 0; i < n; i++) s.birds.push({ x: -30 - i * (24 + Math.random() * 14), y: y + (Math.random() - 0.5) * 30, v: 52 + Math.random() * 18, ph: Math.random() * TAU, fr: 5 + Math.random() * 3, dr: Math.random() * 100 }); }
      ctx.strokeStyle = 'rgba(46,22,54,.85)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      for (let i = s.birds.length - 1; i >= 0; i--) {
        const bd = s.birds[i]; bd.x += bd.v * dt; if (bd.x > W + 60) { s.birds.splice(i, 1); continue; }
        const yy = bd.y + (a.n2(t * 0.3 + bd.dr, 5) - 0.5) * 22, fl = Math.sin(t * bd.fr + bd.ph) * 5;
        ctx.beginPath(); ctx.moveTo(bd.x - 10, yy - fl); ctx.quadraticCurveTo(bd.x - 4, yy - 4 + fl * 0.3, bd.x, yy); ctx.quadraticCurveTo(bd.x + 4, yy - 4 + fl * 0.3, bd.x + 10, yy - fl); ctx.stroke();
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
    post: { bloom: 0.26, grade: 'rgb(120,150,230)', gradeA: 0.14, vignette: 0.34, grain: 0.06 },
    init(a) {
      const { W, H, pal } = a, s = (a.s = {}), r = rng(29);
      s.sky = a.layer(W, H, (g, w, h) => {
        a.vgrad(g, w, h, [[0, [5, 10, 30]], [0.42, [22, 40, 88]], [0.7, mix([80, 90, 152], pal.accent, 0.05)], [1, [196, 164, 182]]]);
        for (let i = 0; i < 190 * a.q; i++) { g.fillStyle = `rgba(240,246,255,${0.2 + r() * 0.7})`; const sz = r() > 0.93 ? 1.8 : 1; g.fillRect(r() * w, r() * h * 0.55, sz, sz); }
      });
      s.twink = Array.from({ length: a.n(50) }, () => ({ x: r() * W, y: r() * H * 0.5, sp: 0.7 + r() * 2.4, ph: r() * TAU, sz: 3 + r() * 5 }));
      s.tg = a.glow([255, 255, 255], 32); s.moon = a.glow([220, 232, 255], 256); s.mx = W * 0.74; s.my = H * 0.2;
      s.mcloud = a.cloudTex(768, 170, 4, { shadow: [30, 44, 96], lit: [150, 172, 224], rim: [226, 236, 255] }, { sx: 3.4, sy: 2.2, cut: 0.52, gain: 3, alpha: 0.5, lx: -0.7, ly: -0.5 }); s.coff = r() * 800;
      // distant range (fractal, haze, soft focus) and a hazy fir slope
      s.far = a.blur(a.layer(W, H, (g, w, h) => { a.mountains(g, w, h, h * 0.6, h * 0.3, 71, [[154, 176, 226], [56, 76, 130]], { freq: 0.5, snow: 0.3, haze: [150, 170, 216], hazeA: 0.55 }); }), 1.4);
      s.mid = a.blur(a.layer(W * 1.04, H, (g, w, h) => {
        a.ridge(g, w, h, h * 0.68, h * 0.045, 83, [[118, 138, 192], [76, 96, 150]], { freq: 0.7 });
        a.firRow(g, w, h * 0.72, h * 0.07, h * 0.16, 9, [32, 56, 92], { gap: [9, 20], snow: true, jitter: 3, vary: [70, 96, 140] });
      }), 0.8);
      // cabin hill
      const cabinX = (s.cx = W * 0.3); let cabinY = 0;
      s.cabin = a.layer(W, H, (g, w, h) => {
        const fy = a.ridge(g, w, h, h * 0.8, h * 0.032, 97, [[208, 222, 248], [158, 180, 224]], { freq: 0.55 });
        cabinY = fy(cabinX) + 2;
        a.firRow(g, w, h * 0.86, h * 0.1, h * 0.26, 5, [22, 46, 76], { gap: [30, 76], snow: true, jitter: 3, vary: [60, 86, 130] });
        const sc = Math.max(0.8, H / 760), cr = rng(555);
        g.save(); g.translate(cabinX, cabinY); g.scale(sc, sc);
        g.fillStyle = 'rgba(40,60,110,.35)'; g.beginPath(); g.ellipse(0, 2, 110, 8, 0, 0, TAU); g.fill();
        for (let y = -62; y < 0; y += 8) { const jit = (cr() - 0.5) * 12; g.fillStyle = `rgb(${70 + jit},${44 + jit * 0.6},${38 + jit * 0.4})`; g.fillRect(-78, y, 156, 8.4); g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(-78, y + 7, 156, 1.3); g.fillStyle = 'rgba(255,230,200,.07)'; g.fillRect(-78, y, 156, 1.1); g.fillStyle = 'rgb(54,34,30)'; g.beginPath(); g.arc(-78, y + 4, 4.4, 0, TAU); g.fill(); g.beginPath(); g.arc(78, y + 4, 4.4, 0, TAU); g.fill(); }
        g.fillStyle = 'rgb(86,76,84)'; g.fillRect(34, -112, 18, 58); g.fillStyle = 'rgb(240,246,255)'; g.fillRect(32, -116, 22, 7);
        g.fillStyle = 'rgb(52,34,32)'; g.beginPath(); g.moveTo(-98, -58); g.lineTo(0, -114); g.lineTo(98, -58); g.closePath(); g.fill();
        g.fillStyle = 'rgb(244,249,255)'; g.beginPath(); g.moveTo(-102, -56); g.quadraticCurveTo(-62, -84, 0, -120); g.quadraticCurveTo(62, -84, 102, -56); g.quadraticCurveTo(96, -49, 90, -58); for (let x = 90; x > -90; x -= 9) g.lineTo(x, -57 + (cr() - 0.3) * 6 - Math.abs(x) * 0.09 * 0.0); g.quadraticCurveTo(-96, -49, -102, -56); g.closePath(); g.fill();
        g.fillStyle = 'rgba(190,212,248,.85)'; for (let i = 0; i < 13; i++) { const x = -94 + i * 15 + cr() * 6; g.beginPath(); g.moveTo(x, -55); g.lineTo(x + 3, -55); g.lineTo(x + 1.5, -55 + 4 + cr() * 11); g.closePath(); g.fill(); }
        const win = (x, y) => { g.fillStyle = 'rgb(28,18,22)'; g.fillRect(x - 15, y - 13, 30, 26); g.fillStyle = 'rgb(20,18,36)'; g.fillRect(x - 12, y - 10, 24, 20); g.fillStyle = 'rgb(236,240,250)'; g.fillRect(x - 17, y + 12, 34, 4); };
        win(-46, -34); win(24, -34);
        g.fillStyle = 'rgb(38,24,24)'; g.beginPath(); g.moveTo(-70, 0); g.lineTo(-70, -34); g.quadraticCurveTo(-60, -50, -50, -34); g.lineTo(-50, 0); g.closePath(); g.fill();
        g.fillStyle = 'rgb(236,243,255)'; g.fillRect(-84, -4, 38, 6);
        g.fillStyle = 'rgb(86,58,44)'; for (let i = 0; i < 4; i++) for (let j = 0; j < 3 - (i > 2 ? 1 : 0); j++) { g.beginPath(); g.arc(60 + i * 8, -4 - j * 8, 4, 0, TAU); g.fill(); }
        g.fillStyle = 'rgb(240,246,255)'; g.fillRect(56, -27, 36, 3);
        g.fillStyle = 'rgb(36,28,34)'; g.fillRect(104, -52, 3, 52); g.fillRect(100, -56, 11, 6);
        g.restore(); s.sc = sc; s.cabinY = cabinY;
        a.ridge(g, w, h, h * 0.93, h * 0.03, 101, [[240, 246, 255], [198, 214, 244]], { freq: 0.5 });
        for (let i = 0; i < 16; i++) { const u = i / 15, px = cabinX - 60 * sc - u * w * 0.2 + (i % 2 ? 6 : -6), py = cabinY + 6 + Math.pow(u, 1.3) * (h * 0.9 - cabinY); g.fillStyle = 'rgba(110,140,196,.55)'; g.beginPath(); g.ellipse(px, py, 4 + u * 4, 1.8 + u * 1.6, -0.2, 0, TAU); g.fill(); }
        const fr = rng(777);
        [[w * 0.05, h * 0.56], [w * 0.14, h * 0.38], [w * 0.92, h * 0.62], [w * 0.82, h * 0.42]].forEach(([x, ht]) => a.fir(g, x, h * 1.04, ht, 'rgb(12,30,52)', fr, true));
      });
      s.warm = a.glow([255, 188, 90], 128); s.flake = a.glow([255, 255, 255], 16); s.smk = a.glow([214, 224, 244], 32); s.spark = a.glow([255, 255, 255], 16);
      s.layers = [0, 1, 2].map(li => Array.from({ length: a.n([120, 66, 26][li]) }, () => ({ x: r() * (W + 140), y: r() * H, v: [24, 50, 90][li] * (0.8 + r() * 0.4), sz: [2.4, 4.4, 8][li], ph: r() * 90, al: [0.5, 0.75, 0.35][li] })));
      s.sparks = Array.from({ length: a.n(34) }, () => ({ x: r() * W, y: H * (0.78 + r() * 0.2), sp: 1 + r() * 3, ph: r() * TAU }));
      s.smoke = []; s.acc = 0; s.shoot = []; s.nextShoot = 4 + r() * 5;
      s.aur = a.layer(W, H * 0.5, (g, w, h) => { g.save(); g.scale(1, h / w); const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(90,255,190,.5)'); gr.addColorStop(1, 'rgba(90,255,190,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); g.restore(); });
    },
    draw(a, t, dt) {
      const { ctx, W, H, s } = a, sc = s.sc || 1, cx = s.cx, cy = s.cabinY, gust = a.gust(t, 1), wnd = a.wind(t, 4);
      s.coff += (3 + gust * 8) * dt;
      a.put(s.sky, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      s.twink.forEach(st => { const b = 0.5 + 0.5 * Math.sin(t * st.sp + st.ph); ctx.globalAlpha = 0.2 + 0.8 * b * b; ctx.drawImage(s.tg, st.x - st.sz, st.y - st.sz, st.sz * 2, st.sz * 2); });
      ctx.globalAlpha = 0.14 + 0.12 * a.n2(t * 0.12, 3); ctx.drawImage(s.aur, W * 0.1, H * 0.34, W * 0.8, H * 0.3);
      ctx.globalAlpha = 0.75; a.sprite(s.moon, s.mx, s.my, H * 0.85); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      const mg = ctx.createRadialGradient(s.mx - 6, s.my - 6, 3, s.mx, s.my, 26); mg.addColorStop(0, '#ffffff'); mg.addColorStop(1, '#dbe5f6'); ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(s.mx, s.my, 25, 0, TAU); ctx.fill();
      { const cw = s.mcloud.width * (H * 0.3 / s.mcloud.height), x0 = -(s.coff % cw); ctx.globalAlpha = 0.85; for (let x = x0; x < W; x += cw) ctx.drawImage(s.mcloud, x, H * 0.04, cw + 1, H * 0.3); ctx.globalAlpha = 1; }
      if (t > s.nextShoot) { s.nextShoot = t + 6 + Math.random() * 9; const ang = 0.3 + Math.random() * 0.25; s.shoot.push({ x: Math.random() * W * 0.7, y: Math.random() * H * 0.25, vx: Math.cos(ang) * 850, vy: Math.sin(ang) * 850, age: 0 }); }
      for (let i = s.shoot.length - 1; i >= 0; i--) { const p = s.shoot[i]; p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.age > 0.8) { s.shoot.splice(i, 1); continue; } const al = Math.sin(clamp(p.age / 0.8, 0, 1) * Math.PI), gr = ctx.createLinearGradient(p.x, p.y, p.x - p.vx * 0.15, p.y - p.vy * 0.15); gr.addColorStop(0, `rgba(255,255,255,${al})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); ctx.strokeStyle = gr; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.15, p.y - p.vy * 0.15); ctx.stroke(); }
      a.put(s.far, 0, 0);
      const sway = (layer, baseY, ph, k) => { ctx.save(); const sh = (a.wind(t * 0.9, ph) * 0.7 + gust * 0.6) * k; ctx.transform(1, 0, sh, 1, -sh * baseY, 0); a.put(layer, -W * 0.02, 0); ctx.restore(); };
      sway(s.mid, H * 0.72, 0.7, 0.006);
      a.put(s.cabin, 0, 0);
      // warm light: window glow, spill on the snow, flickering lantern (flicker comes from noise, not a sine)
      const fl = clamp(0.74 + 0.3 * (a.n2(t * 3.1, 2) - 0.5) + 0.2 * (a.n2(t * 9, 6) - 0.5), 0.45, 1), lx = cx + 105 * sc, ly = cy - 54 * sc;
      ctx.fillStyle = `rgba(255,${196 + 24 * fl},110,.96)`;
      [[-46, -34], [24, -34]].forEach(([x, y]) => { ctx.fillRect(cx + (x - 12) * sc, cy + (y - 10) * sc, 24 * sc, 20 * sc); });
      ctx.fillStyle = 'rgba(80,40,30,.55)'; ctx.fillRect(cx + (-46 - 0.8) * sc, cy + (-34 - 10) * sc, 1.6 * sc, 20 * sc); ctx.fillRect(cx + (24 - 0.8) * sc, cy + (-34 - 10) * sc, 1.6 * sc, 20 * sc);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.8 * fl; a.sprite(s.warm, cx - 46 * sc, cy - 34 * sc, 120 * sc); a.sprite(s.warm, cx + 24 * sc, cy - 34 * sc, 120 * sc);
      ctx.globalAlpha = 0.34 * fl; ctx.drawImage(s.warm, cx - 120 * sc, cy - 20 * sc, 240 * sc, 52 * sc); ctx.drawImage(s.warm, cx - 40 * sc, cy - 10 * sc, 150 * sc, 36 * sc);
      ctx.globalAlpha = 0.9 * fl; a.sprite(s.warm, lx, ly, 70 * sc); ctx.globalAlpha = 0.28 * fl; ctx.drawImage(s.warm, lx - 38 * sc, ly, 76 * sc, 70 * sc);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = `rgba(255,236,170,${0.9 * fl})`; ctx.fillRect(lx - 3 * sc, ly - 3 * sc, 6 * sc, 7 * sc);
      // chimney smoke rises, then the wind takes it
      s.acc += dt * 2.4; while (s.acc > 1) { s.acc--; s.smoke.push({ x: cx + 43 * sc, y: cy - 118 * sc, age: 0, life: 4.5 + Math.random() * 2, ph: Math.random() * 90 }); }
      for (let i = s.smoke.length - 1; i >= 0; i--) { const p = s.smoke[i]; p.age += dt; if (p.age > p.life) { s.smoke.splice(i, 1); continue; } const k = p.age / p.life; p.y -= (16 - k * 6) * dt; p.x += ((4 + wnd * 6) + (10 + 40 * gust) * k + (a.n2(p.age * 0.7 + p.ph, 3) - 0.5) * 24) * dt; ctx.globalAlpha = 0.3 * (1 - k); a.sprite(s.smk, p.x, p.y, 12 * sc + k * 46); }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
      s.sparks.forEach(p => { const b = Math.max(0, Math.sin(t * p.sp + p.ph)); ctx.globalAlpha = b * b * b; a.sprite(s.spark, p.x, p.y, 10); });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      // snowfall carried by a turbulent wind: flakes swirl, drift in clumps and slant harder when it gusts
      s.layers.forEach((layer, li) => layer.forEach(f => {
        const turb = (a.n2(f.x * 0.006 + t * 0.12, f.y * 0.006) - 0.5) * [30, 60, 110][li], vx = -([8, 14, 22][li] + gust * [36, 70, 130][li]) + turb + wnd * 12;
        f.y += f.v * dt * (0.85 + 0.3 * a.n2(f.ph + t * 0.2, 1)); f.x += vx * dt;
        if (f.y > H + 12) { f.y = -12; f.x = Math.random() * (W + 140); } if (f.x < -40) f.x += W + 160; if (f.x > W + 100) f.x -= W + 140;
        ctx.globalAlpha = f.al * (li === 2 ? 0.8 : 1); a.sprite(s.flake, f.x + Math.sin(t * 0.8 + f.ph) * [4, 7, 12][li], f.y, f.sz * (li === 2 ? 3 : 2));
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
    post = makePost();
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
    applyPost(scene.post);
    // adapt: if drawing is consistently slow, lower particle counts and resolution once or twice
    const cost = performance.now() - t0; emaMs = emaMs ? emaMs * 0.9 + cost * 0.1 : cost;
    frames++; slow += cost;
    if (frames === 90) {
      if (slow / frames > 18 && quality > 0.45) { quality = Math.max(0.45, quality * 0.7); setup(curKey.split('|')[1]); }
      frames = 0; slow = 0;
    }
  }

  /* photographic finishing: bloom around bright areas, colour grade, vignette and film grain */
  function makePost() {
    const grainTile = document.createElement('canvas'); grainTile.width = grainTile.height = 160;
    const gctx = grainTile.getContext('2d'), gd = gctx.createImageData(160, 160), rg = rng(4242);
    for (let i = 0; i < gd.data.length; i += 4) { const v = rg() > 0.5 ? 255 : 0; gd.data[i] = gd.data[i + 1] = gd.data[i + 2] = v; gd.data[i + 3] = Math.round(rg() * 30); }
    gctx.putImageData(gd, 0, 0);
    const bw = Math.max(64, Math.ceil(W / 5)), bh = Math.max(48, Math.ceil(H / 5));
    const bloom = document.createElement('canvas'); bloom.width = bw; bloom.height = bh;
    const bctx = bloom.getContext('2d'), canFilter = 'filter' in bctx;
    const vig = document.createElement('canvas'); vig.width = 256; vig.height = 256;
    const vctx = vig.getContext('2d'), vg = vctx.createRadialGradient(128, 128, 60, 128, 128, 190);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,1)'); vctx.fillStyle = vg; vctx.fillRect(0, 0, 256, 256);
    return { grainTile, grain: ctx.createPattern(grainTile, 'repeat'), bloom, bctx, bw, bh, canFilter, vig };
  }
  function applyPost(cfg) {
    if (!cfg || !post) return;
    ctx.save();
    if (cfg.bloom) {
      post.bctx.filter = post.canFilter ? 'brightness(1.15) contrast(1.9) blur(1.5px)' : 'none';
      post.bctx.clearRect(0, 0, post.bw, post.bh); post.bctx.drawImage(canvas, 0, 0, post.bw, post.bh); post.bctx.filter = 'none';
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = cfg.bloom; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(post.bloom, 0, 0, W, H);
      ctx.globalAlpha = cfg.bloom * 0.6; ctx.drawImage(post.bloom, -6, -4, W + 12, H + 8);
    }
    if (cfg.grade) { ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = cfg.gradeA == null ? 0.35 : cfg.gradeA; ctx.fillStyle = cfg.grade; ctx.fillRect(0, 0, W, H); }
    ctx.globalCompositeOperation = 'source-over';
    if (cfg.vignette) { ctx.globalAlpha = cfg.vignette; ctx.drawImage(post.vig, 0, 0, W, H); }
    if (cfg.grain) {
      ctx.globalAlpha = cfg.grain; ctx.fillStyle = post.grain; ctx.translate(-Math.random() * 160, -Math.random() * 160); ctx.fillRect(0, 0, W + 160, H + 160);
    }
    ctx.restore();
  }

  function stopLoop() { cancelAnimationFrame(raf); raf = 0; }
  function stop() { stopLoop(); curKey = ''; curId = ''; scene = null; if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); window.removeEventListener('resize', onResize); }
  function onResize() { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (scene && setup(curKey.split('|')[1])) { const reduce = warm(); if (reduce) { scene.draw(A, t, 0.033); applyPost(scene.post); } } }, 220); }

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
    if (reduce) { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); scene.draw(A, t, 0.033); applyPost(scene.post); return; }
    raf = requestAnimationFrame(loop);
  }

  window.LiveBG = { start, stop, IDS: Object.keys(scenes), stats: () => ({ ms: Math.round(emaMs * 10) / 10, quality }) };
})();
