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
  const small = (window.matchMedia && matchMedia('(pointer: coarse)').matches) || Math.min(screen.width || 9999, screen.height || 9999) <= 820;   // phones and tablets
  let post = null, emaMs = 0, W = 0, H = 0, dpr = 1, quality = small ? 0.6 : 1, lastW = 0, lastH = 0, fEma = 33, fN = 0, prevTs = 0, t = 0, last = 0, A = null, slow = 0, frames = 0, resizeTimer = 0;

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
      // darkness with pools of light cut out of it: draw it over a scene so only lit areas stay bright
      lightmap(w, h, o) {
        return api.layer(w, h, g => {
          g.fillStyle = rgb(o.color || [4, 3, 6], o.ambient); g.fillRect(0, 0, w, h);
          g.globalCompositeOperation = 'destination-out';
          (o.holes || []).forEach(poly => { g.globalAlpha = o.holeA == null ? 1 : o.holeA; g.fillStyle = '#000'; g.beginPath(); poly.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill(); g.globalAlpha = 1; });
          (o.lights || []).forEach(L => { const gr = g.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r); gr.addColorStop(0, `rgba(0,0,0,${L.s})`); gr.addColorStop(0.45, `rgba(0,0,0,${L.s * 0.5})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2); });
        });
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
      { const rr_ = rng(77); s.rain = [a.n(110), a.n(90), a.n(46)].map((n, b) => Array.from({ length: n }, () => ({ x: rr_() * W * 1.2 - W * 0.1, y: rr_() * H, v: [520, 760, 1100][b] * (0.85 + rr_() * 0.3), len: [16, 26, 44][b] * (0.8 + rr_() * 0.4) }))); s.rip = []; }

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
      // rain: three depth bands of slanted streaks, gusting with the wind, plus splashes on the ground
      { const wetK = 0.62 + 0.38 * a.n2(t * 0.04, 9), slant = 0.16 + wd * 0.05 + gust * 0.12;
        ctx.save(); ctx.fillStyle = 'rgba(14,30,38,' + (0.12 * wetK) + ')'; ctx.fillRect(0, 0, W, H); ctx.lineCap = 'round';
        for (let b = 0; b < 3; b++) {
          ctx.beginPath();
          s.rain[b].forEach(d => { d.y += d.v * dt; d.x += d.v * slant * dt; if (d.y > H + 20) { d.y = -d.len; d.x = Math.random() * W * 1.2 - W * 0.1; if (b === 2 && Math.random() < 0.5) s.rip.push({ x: d.x, y: H * (0.84 + Math.random() * 0.14), age: 0 }); } if (d.x > W + 30) d.x -= W + 60; ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.len * slant, d.y - d.len); });
          ctx.strokeStyle = 'rgba(200,225,235,' + ([0.16, 0.24, 0.34][b] * wetK) + ')'; ctx.lineWidth = [0.8, 1.2, 1.9][b]; ctx.stroke();
        }
        for (let i = s.rip.length - 1; i >= 0; i--) { const q = s.rip[i]; q.age += dt; if (q.age > 0.6) { s.rip.splice(i, 1); continue; } const k = q.age / 0.6; ctx.strokeStyle = 'rgba(200,225,235,' + (0.4 * (1 - k)) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(q.x, q.y, 3 + k * 16, 1 + k * 4.5, 0, 0, TAU); ctx.stroke(); }
        ctx.restore(); }
      s.leaves.forEach(l => {
        l.y += l.v * dt; l.rot += l.sp * dt; if (l.y > H + 10) { l.y = -10; l.x = Math.random() * W; }
        const x = l.x + (a.n2(l.y * 0.01 + l.ph, t * 0.2) - 0.5) * 90 + wd * 20;
        ctx.save(); ctx.translate(x, l.y); ctx.rotate(l.rot); ctx.scale(1, 0.55 + 0.45 * Math.cos(t * l.sp + l.ph));
        ctx.fillStyle = l.c ? rgb(pal.warm, 0.75) : rgb(pal.accent, 0.7); ctx.beginPath(); ctx.ellipse(0, 0, l.sz, l.sz * 0.55, 0, 0, TAU); ctx.fill(); ctx.restore();
      });
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

  /* ---------- winter lakeside: a frozen lake with skaters, a glowing street lamp, a snowy bench and lit chalets ---------- */
  scenes.snow = {
    post: { bloom: 0.3, grade: 'rgb(150,140,190)', gradeA: 0.09, vignette: 0.5, grain: 0.075, halo: 0.07, haloColor: 'rgb(255,150,90)' },
    init(a) {
      const { W, H } = a, s = (a.s = {}), r = rng(53), sc = Math.max(0.75, Math.min(1.4, H / 760));
      const shoreY = H * 0.57, lamp = (s.lamp = { x: W * 0.31, top: H * 0.3, base: H * 0.93 });
      const edge = u => ({ x: W * (0.19 + 0.85 * u), y: H * (0.665 + 0.2 * u) }); s.edge = edge;
      /* warm the things the lamp lights, and leave the rest cold: a radial wash applied on top of a layer's own pixels */
      const lit = (g, w, h, a0, rad) => { g.globalCompositeOperation = 'source-atop'; const gr = g.createRadialGradient(lamp.x, lamp.top + 20 * sc, 0, lamp.x, lamp.top + 20 * sc, rad); gr.addColorStop(0, `rgba(255,176,96,${a0})`); gr.addColorStop(0.5, `rgba(255,150,90,${a0 * 0.4})`); gr.addColorStop(1, 'rgba(255,150,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over'; };
      const soft = (g, x, y, z, c, al) => { const gr = g.createRadialGradient(x, y, 0, x, y, z); gr.addColorStop(0, rgb(c, al)); gr.addColorStop(0.55, rgb(c, al * 0.7)); gr.addColorStop(1, rgb(c, 0)); g.fillStyle = gr; g.fillRect(x - z, y - z, z * 2, z * 2); };

      // ---- the night sky and the mountains, thick with falling snow ----
      s.back = a.layer(W, H, (g, w, h) => {
        a.vgrad(g, w, h, [[0, [30, 28, 44]], [0.4, [52, 50, 70]], [0.62, [84, 80, 102]], [1, [104, 98, 118]]]);
        const cl = a.cloudTex(1024, 240, 5, { shadow: [32, 30, 48], lit: [74, 70, 94], rim: [100, 94, 120] }, { sx: 2.2, sy: 1.5, cut: 0.35, gain: 2, alpha: 0.6 });
        g.drawImage(cl, 0, 0, w, h * 0.45);
        // far ridge, then nearer wooded slopes: dark forests that fade into the haze
        a.peaks(g, w, h, h * 0.5, h * 0.3, 71, [[40, 40, 62], [20, 22, 36]], { freq: 0.7 });
        a.firRow(g, w, h * 0.5, h * 0.03, h * 0.07, 7, [34, 40, 58], { gap: [3, 8], snow: true, vary: [66, 72, 92], jitter: 2 });
        const hz = g.createLinearGradient(0, h * 0.28, 0, h * 0.58); hz.addColorStop(0, 'rgba(108,102,128,0)'); hz.addColorStop(1, 'rgba(108,102,128,.3)'); g.fillStyle = hz; g.fillRect(0, h * 0.28, w, h * 0.3);
        a.peaks(g, w, h, h * 0.57, h * 0.17, 73, [[40, 44, 62], [24, 28, 42]], { freq: 1.1 });
        a.firRow(g, w, h * 0.585, h * 0.05, h * 0.12, 4, [24, 32, 44], { gap: [4, 12], snow: true, vary: [58, 66, 84], jitter: 3 });
      });
      s.shore = a.blur(a.layer(W, H, (g, w, h) => {
        const bg = g.createLinearGradient(0, shoreY - 14 * sc, 0, shoreY + 14 * sc); bg.addColorStop(0, 'rgb(128,128,152)'); bg.addColorStop(1, 'rgb(70,72,94)'); g.fillStyle = bg; g.beginPath(); g.moveTo(0, shoreY + 12 * sc); for (let x = 0; x <= w; x += 10) g.lineTo(x, shoreY - (3 + 6 * a.fbm(x * 0.012 + 4, 2, 3)) * sc); g.lineTo(w, shoreY + 14 * sc); g.closePath(); g.fill();
        s.win = [];
        [[0.56, 0.1, 0.07], [0.655, 0.095, 0.065], [0.745, 0.08, 0.06], [0.86, 0.1, 0.075], [0.98, 0.1, 0.08]].forEach(([fx, fw, fh]) => {
          const x = w * fx - w * fw / 2, bw = w * fw, bh = h * fh, y = shoreY - bh;
          const wg = g.createLinearGradient(0, y, 0, y + bh); wg.addColorStop(0, 'rgb(74,50,40)'); wg.addColorStop(1, 'rgb(40,28,26)'); g.fillStyle = wg; g.fillRect(x, y, bw, bh);
          for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(20,10,6,.3)'; g.fillRect(x, y + bh * (k + 1) / 7, bw, 1.4); }
          const rg = g.createLinearGradient(0, y - bh * 0.5, 0, y + bh * 0.15); rg.addColorStop(0, 'rgb(236,236,248)'); rg.addColorStop(1, 'rgb(170,170,196)'); g.fillStyle = rg; g.beginPath(); g.moveTo(x - bw * 0.1, y + bh * 0.14); g.quadraticCurveTo(x + bw * 0.1, y - bh * 0.1, x + bw * 0.5, y - bh * 0.5); g.quadraticCurveTo(x + bw * 0.9, y - bh * 0.1, x + bw * 1.1, y + bh * 0.14); g.closePath(); g.fill();
          for (let k = 0; k < 3; k++) { const wx = x + bw * (0.12 + k * 0.3), wy = y + bh * 0.36, ww = bw * 0.17, wh = bh * 0.34; const wl = g.createLinearGradient(0, wy, 0, wy + wh); wl.addColorStop(0, 'rgb(255,214,140)'); wl.addColorStop(1, 'rgb(236,150,70)'); g.fillStyle = wl; g.fillRect(wx, wy, ww, wh); s.win.push({ x: wx + ww / 2, y: wy + wh / 2, w: ww, ph: r() * 9 }); }
        });
        const fr = rng(81); [0.04, 0.1, 0.17, 0.47, 0.52, 0.61, 0.7, 0.8, 0.92, 0.97].forEach((fx, i) => a.fir(g, w * fx, shoreY + 4 * sc, h * (0.12 + fr() * 0.1), `rgb(${20 + i},${30 + i * 2},${38 + i})`, fr, true));
        const hz = g.createLinearGradient(0, shoreY - h * 0.12, 0, shoreY + 6); hz.addColorStop(0, 'rgba(100,96,124,0)'); hz.addColorStop(1, 'rgba(100,96,124,.3)'); g.fillStyle = hz; g.fillRect(0, shoreY - h * 0.12, w, h * 0.13);
        for (let i = 0; i < 7; i++) soft(g, w * (0.27 + i * 0.042), shoreY - 2 * sc, 6 * sc, [255, 196, 120], 0.8);
      }), 1.7 * sc);

      // ---- the frozen lake: pale blue ice with frost, long skate scratches, a few cracks and a snowy edge ----
      s.river = a.layer(W, H, (g, w, h) => {
        const bot = h * 0.9, gr = g.createLinearGradient(0, shoreY, 0, bot);
        gr.addColorStop(0, 'rgb(116,128,158)'); gr.addColorStop(0.3, 'rgb(80,94,132)'); gr.addColorStop(1, 'rgb(44,54,90)'); g.fillStyle = gr; g.fillRect(0, shoreY, w, h * 0.4);
        g.save(); g.beginPath(); g.rect(0, shoreY, w, bot - shoreY); g.clip();
        const depth = y => 0.4 + (y - shoreY) / (h * 0.3);
        for (let i = 0; i < 60; i++) {            // frost and thin snow: soft, wide, flat patches
          const y = shoreY + r() * h * 0.33, x = r() * w, z = (30 + r() * 120) * sc * depth(y), c = r() > 0.5 ? '228,236,252' : '150,166,208';
          const gp = g.createRadialGradient(x, y, 0, x, y, z); gp.addColorStop(0, `rgba(${c},.16)`); gp.addColorStop(1, `rgba(${c},0)`);
          g.save(); g.translate(x, y); g.scale(1, 0.22); g.translate(-x, -y); g.fillStyle = gp; g.fillRect(x - z, y - z, z * 2, z * 2); g.restore();
        }
        for (let i = 0; i < 150; i++) {           // skate scratches running along the lake
          const y = shoreY + (0.02 + r() * 0.3) * h, x = r() * w, L = (40 + r() * 260) * sc * depth(y), bend = (r() - 0.5) * 6 * sc;
          g.strokeStyle = `rgba(${r() > 0.3 ? '224,232,252' : '30,36,66'},${0.05 + r() * 0.09})`; g.lineWidth = 0.7 + r() * 1.1;
          g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + L / 2, y + bend, x + L, y + bend * 0.4); g.stroke();
        }
        for (let i = 0; i < 9; i++) {             // cracks
          let x = r() * w, y = shoreY + (0.05 + r() * 0.27) * h; const dx = r() > 0.5 ? 1 : -1;
          g.strokeStyle = 'rgba(216,228,252,.22)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(x, y);
          for (let k = 0; k < 9; k++) { x += dx * (10 + r() * 34) * sc; y += (r() - 0.5) * 12 * sc; g.lineTo(x, y); } g.stroke();
        }
        const ed = g.createLinearGradient(0, shoreY, 0, shoreY + 18 * sc); ed.addColorStop(0, 'rgba(208,212,236,.5)'); ed.addColorStop(1, 'rgba(208,212,236,0)'); g.fillStyle = ed; g.fillRect(0, shoreY, w, 18 * sc);
        g.restore();
      });

      // ---- the near bank: deep, soft snow with footprints ----
      s.ground = a.blur(a.layer(W, H, (g, w, h) => {
        g.beginPath(); g.moveTo(0, h * 0.64); for (let i = 0; i <= 24; i++) { const e = edge(i / 24); g.lineTo(e.x, e.y + 8 * sc + 3 * sc * Math.sin(i * 1.7)); } g.lineTo(w, h); g.lineTo(0, h); g.closePath();
        const gr = g.createLinearGradient(0, h * 0.64, 0, h); gr.addColorStop(0, 'rgb(70,66,92)'); gr.addColorStop(0.45, 'rgb(100,92,118)'); gr.addColorStop(1, 'rgb(138,126,146)'); g.fillStyle = gr; g.fill();
        g.save(); g.clip();
        for (let i = 0; i < 70; i++) soft(g, r() * w, h * (0.68 + r() * 0.32), (60 + r() * 150) * sc, r() > 0.5 ? [220,208,232] : [92,86,116], 0.18);   // drifts and hollows
        for (let i = 0; i < 2600; i++) { const x = r() * w, y = h * (0.68 + r() * 0.32); g.fillStyle = `rgba(${r() > 0.5 ? '240,232,250' : '70,64,92'},${0.05 + r() * 0.1})`; g.fillRect(x, y, 2 + r() * 3, 1 + r() * 1.4); }
        for (let i = 0; i < 44; i++) { const k = i / 44, x = w * (0.34 + k * 0.3) + Math.sin(i * 0.5) * 10 * sc, y = h * (0.995 - k * 0.2), z = 5 + (1 - k) * 12; g.fillStyle = 'rgba(70,62,92,.3)'; g.beginPath(); g.ellipse(x + (i % 2 ? 12 : -12) * sc * (1 - k * 0.5), y, z * 0.7, z * 0.34, 0.3, 0, TAU); g.fill(); }
        g.restore();
      }), 1.1 * sc);
      s.fence = a.blur(a.layer(W, H, (g, w, h) => {
        const posts = 15, pts = [];
        for (let i = 0; i <= posts; i++) { const u = Math.pow(i / posts, 0.9), e = edge(u); pts.push({ x: e.x, y: e.y, ph: (34 + 92 * u) * sc, pw: (7 + 15 * u) * sc }); }
        [0.32, 0.68].forEach(fr => { for (let i = 0; i < posts; i++) { const p = pts[i], q = pts[i + 1], lw = (4 + 9 * (i / posts)) * sc; g.strokeStyle = 'rgb(58,36,26)'; g.lineWidth = lw; g.lineCap = 'butt'; g.beginPath(); g.moveTo(p.x, p.y - p.ph * fr); g.lineTo(q.x, q.y - q.ph * fr); g.stroke();
          g.strokeStyle = 'rgba(214,208,232,.88)'; g.lineWidth = lw * (0.35 + 0.25 * a.n2(i * 3.1 + fr * 9, 1)); g.beginPath(); g.moveTo(p.x, p.y - p.ph * fr - lw * 0.5); g.lineTo(q.x, q.y - q.ph * fr - lw * 0.5); g.stroke(); } });
        pts.forEach((p, i) => { const gx = g.createLinearGradient(p.x - p.pw / 2, 0, p.x + p.pw / 2, 0); gx.addColorStop(0, 'rgb(86,54,36)'); gx.addColorStop(1, 'rgb(40,24,18)'); g.fillStyle = gx; g.fillRect(p.x - p.pw / 2, p.y - p.ph, p.pw, p.ph);
          for (let k = 0; k < 4; k++) { g.strokeStyle = 'rgba(20,10,4,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(p.x - p.pw / 2 + r() * p.pw, p.y - p.ph); g.lineTo(p.x - p.pw / 2 + r() * p.pw, p.y); g.stroke(); }
          const sh = p.pw * (0.7 + 0.35 * a.n2(i * 1.9, 4)); soft(g, p.x, p.y - p.ph - 2, sh * 1.3, [200,194,224], 0.85); g.fillStyle = 'rgba(206,200,230,.92)'; g.beginPath(); g.ellipse(p.x, p.y - p.ph, sh, sh * 0.55, 0, Math.PI, TAU); g.fill(); });
        lit(g, w, h, 0.5, H * 0.75);
      }), 0.9 * sc);

      // ---- the street lamp ----
      s.lampArt = a.blur(a.layer(W, H, (g, w, h) => {
        const L = lamp; const pg = g.createLinearGradient(L.x - 5 * sc, 0, L.x + 5 * sc, 0); pg.addColorStop(0, 'rgb(40,36,40)'); pg.addColorStop(0.5, 'rgb(16,14,18)'); pg.addColorStop(1, 'rgb(6,5,8)'); g.fillStyle = pg;
        g.fillRect(L.x - 4 * sc, L.top + 54 * sc, 8 * sc, L.base - L.top - 54 * sc); g.fillRect(L.x - 11 * sc, L.base - 70 * sc, 22 * sc, 70 * sc);
        g.beginPath(); g.moveTo(L.x - 26 * sc, L.base); g.quadraticCurveTo(L.x - 12 * sc, L.base - 18 * sc, L.x - 11 * sc, L.base - 46 * sc); g.lineTo(L.x + 11 * sc, L.base - 46 * sc); g.quadraticCurveTo(L.x + 12 * sc, L.base - 18 * sc, L.x + 26 * sc, L.base); g.closePath(); g.fill();
        soft(g, L.x, L.base - 70 * sc, 20 * sc, [240,236,250], 0.95); g.fillStyle = 'rgba(232,226,248,.95)'; g.beginPath(); g.ellipse(L.x, L.base - 70 * sc, 14 * sc, 6 * sc, 0, Math.PI, TAU); g.fill();
        g.fillStyle = 'rgb(12,10,14)'; g.fillRect(L.x - 24 * sc, L.top + 30 * sc, 48 * sc, 9 * sc);
        const lg = g.createLinearGradient(0, L.top, 0, L.top + 30 * sc); lg.addColorStop(0, 'rgb(255,244,190)'); lg.addColorStop(1, 'rgb(255,176,84)'); g.fillStyle = lg; g.beginPath(); g.moveTo(L.x - 15 * sc, L.top); g.lineTo(L.x + 15 * sc, L.top); g.lineTo(L.x + 21 * sc, L.top + 30 * sc); g.lineTo(L.x - 21 * sc, L.top + 30 * sc); g.closePath(); g.fill();
        g.strokeStyle = 'rgb(14,12,16)'; g.lineWidth = 3 * sc; [-1, 0, 1].forEach(k => { g.beginPath(); g.moveTo(L.x + k * 8 * sc, L.top); g.lineTo(L.x + k * 11 * sc, L.top + 30 * sc); g.stroke(); });
        g.fillStyle = 'rgb(12,10,14)'; g.beginPath(); g.moveTo(L.x - 22 * sc, L.top); g.lineTo(L.x, L.top - 16 * sc); g.lineTo(L.x + 22 * sc, L.top); g.closePath(); g.fill();
        soft(g, L.x, L.top - 10 * sc, 18 * sc, [236,230,250], 0.9); g.fillStyle = 'rgba(230,224,246,.95)'; g.beginPath(); g.ellipse(L.x, L.top - 9 * sc, 14 * sc, 6 * sc, 0, Math.PI, TAU); g.fill();
      }), 0.7 * sc);

      // ---- the bench: a foreground object, a little out of focus, heaped with snow ----
      s.bench = a.blur(a.layer(W, H, (g, w, h) => {
        const bx = -w * 0.02, by = h * 0.81, bw = w * 0.32;
        g.strokeStyle = 'rgb(12,10,14)'; g.lineWidth = 8 * sc; g.lineCap = 'round';
        g.beginPath(); g.moveTo(bx + 24 * sc, by + 106 * sc); g.bezierCurveTo(bx + 14 * sc, by + 54 * sc, bx + 34 * sc, by + 26 * sc, bx + 64 * sc, by + 22 * sc); g.stroke();
        g.beginPath(); g.moveTo(bx + bw * 0.78, by + 90 * sc); g.bezierCurveTo(bx + bw * 0.76, by + 58 * sc, bx + bw * 0.84, by + 38 * sc, bx + bw * 0.92, by + 34 * sc); g.stroke();
        g.lineWidth = 3.4 * sc; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(bx + 46 * sc + k * 15 * sc, by + 92 * sc, 15 * sc, Math.PI, TAU * 0.96); g.stroke(); }
        const slat = (y0, hh, skew) => { const sg = g.createLinearGradient(0, y0, 0, y0 + hh); sg.addColorStop(0, 'rgb(112,72,46)'); sg.addColorStop(1, 'rgb(52,30,20)'); g.fillStyle = sg; g.beginPath(); g.moveTo(bx + 6 * sc, y0 + skew); g.lineTo(bx + bw, y0); g.lineTo(bx + bw + 8 * sc, y0 + hh); g.lineTo(bx + 14 * sc, y0 + hh + skew); g.closePath(); g.fill(); };
        [0, 1, 2].forEach(k => slat(by - 120 * sc + k * 34 * sc, 22 * sc, 12 * sc)); [0, 1, 2].forEach(k => slat(by + 8 * sc + k * 20 * sc, 14 * sc, 10 * sc));
        const heap = (x0, y0, w0, h0) => { g.beginPath(); g.moveTo(x0, y0 + h0); for (let i = 0; i <= 24; i++) { const u = i / 24; g.lineTo(x0 + w0 * u, y0 + h0 * (1 - Math.pow(Math.sin(u * Math.PI), 0.8) * (0.75 + 0.4 * (a.fbm(u * 7 + y0 * 0.1, 3, 3) - 0.4)))); } g.lineTo(x0 + w0, y0 + h0); g.closePath(); const sg = g.createLinearGradient(0, y0, 0, y0 + h0); sg.addColorStop(0, 'rgb(232,226,248)'); sg.addColorStop(1, 'rgb(150,142,180)'); g.fillStyle = sg; g.fill(); };
        heap(bx + 8 * sc, by - 132 * sc, bw * 0.97, 42 * sc); heap(bx + 8 * sc, by - 98 * sc, bw * 0.97, 38 * sc); heap(bx + 14 * sc, by - 6 * sc, bw, 42 * sc); heap(bx + 10 * sc, by + 24 * sc, bw * 0.5, 22 * sc);
        lit(g, w, h, 0.45, H * 0.8);
      }), 2.2 * sc);

      // people out for a walk: a few small figures on the far path, and walkers (sometimes a pair, sometimes under an umbrella) on the near bank
      s.people = []; s.nextPerson = 1.5;
      s.coats = [[128, 44, 52], [44, 62, 112], [74, 74, 84], [166, 116, 66], [44, 98, 84], [196, 192, 208], [92, 50, 108]];
      s.skins = [[255, 226, 200], [241, 200, 164], [214, 164, 122], [176, 123, 84], [128, 84, 56], [88, 56, 40]];   // very fair .. deep brown
      s.hats = [[222, 220, 232], [160, 44, 56], [40, 40, 52], [226, 176, 80], [60, 110, 150]];
      const pk = arr => arr[Math.floor(r() * arr.length)];
      s.skaters = [[0.5, 0.2, -1], [0.78, 0.55, 1], [0.9, 0.38, -1], [0.62, 0.72, 1], [0.3, 0.45, 1]].map(([fx, f, dir], i) => ({ skin: s.skins[[1, 4, 0, 5, 3][i]], bare: r() < 0.4, helper: null, target: null, reach: 0, side: 1, aided: false, slide: 0, k: 30, skate: true, near: false, dir, x: W * fx, f, v: 26 + r() * 22, ph: r() * 6, talk: 0, sayPh: r() * 6, mission: 'help', st: 'skate', fall: 0, t: 6 + r() * 26, coat: pk(s.coats), hat: pk(s.hats), scarf: pk(s.coats) }));
      s.talkers = []; s.puffs = []; s.chatT = 14 + r() * 10;
      { const mkT = (near, x, dir, sayPh) => ({ talk: 1, near, dir, x, ph: r() * 6, sayPh, coat: pk(s.coats), hat: pk(s.hats), scarf: pk(s.coats), skin: pk(s.skins), bare: r() < 0.35, puffT: r() * 2 });
        const ux = u => W * (0.19 + 0.85 * u), kk = u => (96 + 150 * u) * sc;
        s.talkers.push(mkT(true, ux(0.55), 1, 0), mkT(true, ux(0.55) + kk(0.58) * 0.62, -1, Math.PI), mkT(false, W * 0.43, 1, 0), mkT(false, W * 0.43 + 22 * sc, -1, Math.PI)); }
      s.breath = (p, x, y, k, dt) => {   // a little cloud of cold breath while someone is talking
        if ((p.talk || 0) < 0.8) return; p.puffT = (p.puffT || 0) - dt;
        if (p.puffT <= 0) { p.puffT = 1.4 + Math.random() * 1.8; s.puffs.push({ x: x + p.dir * k * 0.08, y: y - k * 0.9, vx: p.dir * k * 0.12, vy: -k * 0.1, life: 1.6, max: 1.6, sz: k * 0.1 }); }
      };
      s.drawPerson = (ctx, p, x, y, k) => {
        /* a walker in profile, ~9 heads tall: two-segment legs with a bending knee, long winter coat, swinging arms, scarf and hat,
           lit warmly on the side that faces the lamp */
        const LB = 0.45, tk = p.talk || 0, ph = p.ph, hip = -0.5 * k, sh = -0.8 * k, bob = p.skate || tk ? 0 : Math.abs(Math.sin(ph)) * k * 0.012;
        const lampSide = Math.sign(s.lamp.x - x) * p.dir || 1, lampK = clamp(1 - Math.abs(s.lamp.x - x) / (W * 0.7), 0, 1);
        const joint = (x0, y0, ang, len) => [x0 + Math.sin(ang) * len, y0 + Math.cos(ang) * len];
        const leg = (phi, isNear) => {
          const pu = Math.max(0, Math.sin(phi));   // skating: one leg glides, the other pushes out behind and lifts
          const th0 = p.skate ? 0.16 - 0.8 * pu : 0.46 * Math.sin(phi), bend0 = p.skate ? 0.42 * (1 - pu) + 0.08 * pu : 0.12 + 0.75 * Math.max(0, Math.sin(phi + 1.15)), th = th0 + ((isNear ? 0.1 : -0.06) - th0) * tk, bend = bend0 + (0.06 - bend0) * tk, ang0 = th - bend;
          const thE = th + ((isNear ? 2.0 : 1.5) - LB - th) * fa, saE = ang0 + ((isNear ? 1.2 : 1.5) - LB - ang0) * fa;   // seated: thigh forward, shin out or down
          const kn = joint(0, hip - bob, thE, 0.25 * k), an = joint(kn[0], kn[1], saE, 0.25 * k);
          return { kn, an, ang: saE };
        };
        const drawLeg = (L, col, wd) => {
          ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = wd; ctx.beginPath(); ctx.moveTo(0, hip - bob); ctx.lineTo(L.kn[0], L.kn[1]); ctx.lineWidth = wd * 0.86; ctx.lineTo(L.an[0], L.an[1]); ctx.stroke();
          ctx.fillStyle = 'rgb(14,12,18)'; ctx.beginPath(); ctx.ellipse(L.an[0] + k * 0.035, L.an[1] + k * 0.012, k * 0.058, k * 0.026, L.ang * 0.3, 0, TAU); ctx.fill();   // boot
          if (p.skate) { ctx.strokeStyle = 'rgba(218,228,248,.95)'; ctx.lineWidth = Math.max(1, k * 0.012); ctx.beginPath(); ctx.moveTo(L.an[0] - k * 0.05, L.an[1] + k * 0.04); ctx.lineTo(L.an[0] + k * 0.1, L.an[1] + k * 0.04); ctx.stroke(); }   // blade
        };
        const drawArm = (phi, col, glove) => {
          const a1b = p.skate ? (0.8 * Math.sin(phi)) * (1 - fa) - 0.8 * fa + fw * 1.5 * Math.sin(phi * 1.7 + 1) : -0.42 * Math.sin(phi),
              a1r = p.reach ? a1b * (1 - p.reach) + (1.3 * (p.side || 1) + 0.1 * Math.sin(phi)) * p.reach : a1b,
              say = clamp(0.5 + 0.9 * Math.sin(ph * 0.33 + (p.sayPh || 0)), 0, 1), gest = 0.25 + 0.95 * say * Math.abs(Math.sin(phi * 1.7 + 0.4)),   // talking: the hands come up while they speak
              a1 = a1r + (gest - a1r) * tk, el = joint(0, sh + k * 0.02 - bob, a1, 0.17 * k), a2 = a1 + (p.skate ? 0.15 * (1 - fa) - 0.05 * fa : 0.25 + 0.35 * Math.max(0, Math.sin(phi + 0.6))) + tk * (0.3 + 0.6 * say), hd = joint(el[0], el[1], a2, 0.16 * k);
          ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineWidth = k * 0.062; ctx.beginPath(); ctx.moveTo(0, sh + k * 0.02 - bob); ctx.lineTo(el[0], el[1]); ctx.lineWidth = k * 0.054; ctx.lineTo(hd[0], hd[1]); ctx.stroke();
          ctx.fillStyle = p.bare ? rgb(p.skin || [222, 184, 164]) : glove; ctx.beginPath(); ctx.arc(hd[0], hd[1], k * 0.03, 0, TAU); ctx.fill();
        };
        const coat = rgb(p.coat), coatDark = rgb(mix(p.coat, [0, 0, 8], 0.5)), coatLight = rgb(mix(p.coat, [255, 190, 130], 0.4));
        ctx.save(); ctx.translate(x, y); ctx.scale(p.dir, 1);
        if (p.skate) { const rg = ctx.createLinearGradient(0, 0, 0, k * 0.55); rg.addColorStop(0, rgb(p.coat, 0.3)); rg.addColorStop(1, rgb(p.coat, 0)); ctx.fillStyle = rg; ctx.fillRect(-k * 0.12, 0, k * 0.24, k * 0.55); }   // coat colour mirrored in the ice
        const fl = p.skate ? clamp(p.fall || 0, 0, 1) : 0, fa = fl * fl * (3 - 2 * fl), fw = p.skate ? 4 * fl * (1 - fl) : 0;   // fa: 0 upright .. 1 sitting on the ice; fw: arm-flailing, strongest mid-fall
        ctx.translate(0, k * 0.46 * fa); ctx.rotate(p.skate ? 0.13 * (1 - fa) * (1 - tk) : 0.025);
        if (fa > 0) { ctx.translate(0, hip); ctx.rotate(-LB * fa); ctx.translate(0, -hip); }   // lean back from the hips
        // soft shadow stretched away from the lamp
        ctx.fillStyle = 'rgba(14,10,28,.38)'; ctx.beginPath(); ctx.ellipse(-lampSide * p.dir * k * 0.12, 0, k * 0.26, k * 0.05, 0, 0, TAU); ctx.fill();
        const far = leg(ph + Math.PI, false), near = leg(ph, true);
        drawLeg(far, 'rgb(18,16,24)', k * 0.085); drawArm(ph, coatDark, 'rgb(26,22,30)');
        // the coat: shoulders, a belted waist, a hem that swings with the stride
        const sw = Math.sin(ph) * k * 0.025, hemY = (-0.27 * (1 - fa) - 0.44 * fa) * k;
        const body = new Path2D(); body.moveTo(-k * 0.085, sh - bob); body.quadraticCurveTo(-k * 0.115, sh + k * 0.16 - bob, -k * 0.1, hip - bob); body.quadraticCurveTo(-k * 0.16 - sw, hip + k * 0.12 - bob, -k * 0.17 - sw, hemY - bob);
        body.lineTo(k * 0.15 + sw, hemY - bob); body.quadraticCurveTo(k * 0.15 + sw, hip + k * 0.1 - bob, k * 0.1, hip - bob); body.quadraticCurveTo(k * 0.115, sh + k * 0.16 - bob, k * 0.085, sh - bob); body.closePath();
        ctx.fillStyle = coat; ctx.fill(body);
        const side = ctx.createLinearGradient(lampSide * -k * 0.16, 0, lampSide * k * 0.16, 0); side.addColorStop(0, `rgba(255,176,104,${0.5 * lampK})`); side.addColorStop(0.45, 'rgba(255,176,104,0)'); side.addColorStop(1, 'rgba(10,8,24,.38)'); ctx.fillStyle = side; ctx.fill(body);
        ctx.strokeStyle = coatDark; ctx.lineWidth = Math.max(1, k * 0.012); ctx.beginPath(); ctx.moveTo(-k * 0.1, hip - bob + k * 0.01); ctx.lineTo(k * 0.1, hip - bob + k * 0.01); ctx.stroke();   // belt
        drawLeg(near, 'rgb(10,9,16)', k * 0.09); drawArm(ph + Math.PI, coat, 'rgb(30,26,34)');
        // scarf, head and hat
        ctx.fillStyle = rgb(p.scarf); ctx.beginPath(); ctx.ellipse(k * 0.01, sh - k * 0.012 - bob, k * 0.075, k * 0.036, 0, 0, TAU); ctx.fill(); ctx.fillRect(-k * 0.06, sh - k * 0.01 - bob, k * 0.04, k * 0.1);
        ctx.fillStyle = rgb(p.skin || [222, 184, 164]); ctx.beginPath(); ctx.ellipse(k * 0.022, sh - k * 0.085 - bob, k * 0.05, k * 0.058, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = rgb(mix(p.skin || [222, 184, 164], [196, 84, 84], 0.35), 0.5); ctx.beginPath(); ctx.ellipse(k * 0.045, sh - k * 0.075 - bob, k * 0.016, k * 0.014, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = rgb(p.hat); ctx.beginPath(); ctx.ellipse(k * 0.012, sh - k * 0.105 - bob, k * 0.062, k * 0.052, 0, Math.PI * 0.95, TAU * 1.02); ctx.fill(); ctx.fillRect(-k * 0.05, sh - k * 0.112 - bob, k * 0.13, k * 0.026);
        ctx.fillStyle = 'rgba(244,240,255,.85)'; ctx.beginPath(); ctx.ellipse(k * 0.012, sh - k * 0.15 - bob, k * 0.04, k * 0.014, 0, 0, TAU); ctx.fill(); ctx.fillRect(-k * 0.09, sh - k * 0.006 - bob, k * 0.17, k * 0.014);   // snow on hat and shoulders
        if (p.umb) { ctx.strokeStyle = 'rgb(24,20,30)'; ctx.lineWidth = Math.max(1, k * 0.012); ctx.beginPath(); ctx.moveTo(k * 0.1, sh + k * 0.1 - bob); ctx.lineTo(k * 0.1, sh - k * 0.3 - bob); ctx.stroke(); ctx.fillStyle = rgb(p.umb); ctx.beginPath(); ctx.ellipse(k * 0.1, sh - k * 0.3 - bob, k * 0.3, k * 0.14, 0, Math.PI, TAU); ctx.fill(); ctx.fillStyle = 'rgba(240,236,252,.9)'; ctx.beginPath(); ctx.ellipse(k * 0.1, sh - k * 0.325 - bob, k * 0.26, k * 0.06, 0, Math.PI, TAU); ctx.fill(); }
        ctx.restore();
      };
      s.warm = a.glow([255, 170, 90], 256); s.win_g = a.glow([255, 200, 120], 32); s.flake = a.glow([255, 255, 255], 16); s.streak = a.glow([255, 168, 84], 32);
      s.flakes = [0, 1, 2].map(li => Array.from({ length: a.n([520, 220, 52][li]) }, () => ({ x: r() * W, y: r() * H, v: [38, 78, 150][li] * (0.8 + r() * 0.4), sz: [2.2, 4.6, 12][li], ph: r() * 90, al: [0.5, 0.62, 0.4][li] * (0.7 + r() * 0.5) })));
    },
    draw(a, t, dt) {
      const { ctx, W, H, s } = a, sc = Math.max(0.75, Math.min(1.4, H / 760)), gust = a.gust(t, 1), wnd = a.wind(t, 4), L = s.lamp, shoreY = H * 0.57;
      a.put(s.back, 0, 0);
      ctx.drawImage(s.shore, 0, 0, W, H);
      // ---- walkers: spawn now and then, move along their lane, swing their legs ----
      s.talkers.forEach(p => { p.ph += dt * 1.2; });
      s.nextPerson -= dt;
      if (s.nextPerson <= 0 && s.people.length < 5) {
        s.nextPerson = 9 + Math.random() * 16; const near = Math.random() < 0.72, dir = Math.random() < 0.5 ? 1 : -1, pair = near && Math.random() < 0.45, pick = arr => arr[Math.floor(Math.random() * arr.length)];
        const x0 = near ? (dir > 0 ? W * 0.2 : W * 1.1) : (dir > 0 ? W * 0.18 : W * 0.56), v = (near ? 44 : 11) * sc * (0.8 + Math.random() * 0.4), ph = Math.random() * 6;
        const mk = off => ({ near, dir, x: x0 - dir * off, v, ph: ph + off * 0.05, coat: pick(s.coats), hat: pick(s.hats), scarf: pick(s.coats), skin: pick(s.skins), bare: Math.random() < 0.35, umb: near && Math.random() < 0.28 ? pick(s.coats) : null });
        s.people.push(mk(0)); if (pair) s.people.push(mk(0.05 * W * sc / 1.4));
      }
      s.people.forEach(p => { p.x += p.dir * p.v * dt * (p.near ? 0.4 + 0.9 * clamp((p.x / W - 0.19) / 0.85, 0, 1) : 1); p.ph += dt * (p.near ? 5.2 : 3.4); });
      s.people = s.people.filter(p => p.dir > 0 ? p.x < (p.near ? W * 1.14 : W * 0.6) : p.x > (p.near ? W * 0.16 : W * 0.14));
      s.people.filter(p => !p.near).concat(s.talkers.filter(p => !p.near)).forEach(p => { s.drawPerson(ctx, p, p.x, shoreY + 4 * sc, 26 * sc); s.breath(p, p.x, shoreY + 4 * sc, 26 * sc, dt); });
      a.put(s.river, 0, 0);
      // reflections: soft vertical smears that wobble sideways, stronger near the surface
      ctx.globalCompositeOperation = 'lighter';
      s.win.forEach(wd => { const tw = 0.7 + 0.3 * a.n2(t * 0.5 + wd.ph, 2); for (let k = 0; k < 9; k++) { const ry = shoreY + 8 * sc + k * (H * 0.03), off = (a.n2(ry * 0.03 + wd.ph, t * 0.5) - 0.5) * 2 * sc; ctx.globalAlpha = 0.3 * tw * (1 - k / 10); ctx.drawImage(s.streak, wd.x + off - wd.w * 0.9, ry - H * 0.012, wd.w * 1.8, H * 0.05); } });
      for (let k = 0; k < 8; k++) { const ry = shoreY + 6 * sc + k * (H * 0.034), off = (a.n2(ry * 0.03, t * 0.5) - 0.5) * 4 * sc; ctx.globalAlpha = 0.22 * (1 - k / 9); ctx.drawImage(s.streak, W * 0.36 + off - 12 * sc, ry - H * 0.014, 26 * sc, H * 0.06); }
      s.win.forEach(wd => { ctx.globalAlpha = 0.5 + 0.2 * a.n2(t * 0.4 + wd.ph, 4); a.sprite(s.win_g, wd.x, wd.y, 38 * sc); });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      s.chatT -= dt;       // now and then two skaters stop to have a chat
      if (s.chatT <= 0) {
        s.chatT = 18 + Math.random() * 30;
        const free = s.skaters.filter(q => q.st === 'skate' && q.t > 12);
        if (free.length >= 2) { const A = free[Math.floor(Math.random() * free.length)], B = free.filter(q => q !== A).sort((m, n) => Math.abs(m.x - A.x) - Math.abs(n.x - A.x))[0]; A.st = 'wait'; A.t = 40; A.slide = 1; B.st = 'go'; B.target = A; B.t = 40; B.mission = 'chat'; }
      }
      s.skaters.forEach(p => {
        const u0 = clamp((p.x / W - 0.19) / 0.85, 0, 1), top = shoreY + 14 * sc, bottom = s.edge(u0).y - 12 * sc;
        p.y = top + p.f * Math.max(8 * sc, bottom - top); p.k = (22 + 120 * clamp((p.y - shoreY) / (H * 0.3), 0, 1.1)) * sc;
        p.t -= dt;
        const dep = 0.45 + (p.y - shoreY) / (H * 0.3);
        let glide = 0, spin = 1.9, want = 0;
        if (p.st === 'skate') {
          glide = 1;
          if (p.t <= 0) {                                    // trips; the nearest skater who is gliding comes to help
            p.st = 'fall'; p.t = 0.75; p.helper = null; p.slide = 0.7;
            const h = s.skaters.filter(q => q !== p && q.st === 'skate' && q.t > 4).sort((m, n) => Math.abs(m.x - p.x) - Math.abs(n.x - p.x))[0];
            if (h && Math.random() < 0.85) { h.st = 'go'; h.target = p; h.t = 30; h.mission = 'help'; p.helper = h; }
          }
        } else if (p.st === 'fall') {
          glide = p.slide; spin = 7; p.fall = Math.min(1, p.fall + dt / 0.75);
          if (p.t <= 0) { p.st = 'down'; p.t = p.helper ? 18 : 2.6 + Math.random() * 2.4; }
        } else if (p.st === 'down') {
          p.slide *= Math.pow(0.12, dt); glide = p.slide; spin = 0.9;
          if (p.t <= 0) { p.st = 'rise'; p.t = 1.4; p.helper = null; }
        } else if (p.st === 'rise') {
          p.fall = Math.max(0, p.fall - dt / 1.4); spin = 2.4; want = p.aided ? 1 : 0;
          if (p.t <= 0) { p.st = 'skate'; p.fall = 0; p.aided = false; p.t = 16 + Math.random() * 30; }
        } else if (p.st === 'go') {                           // skate over to the person on the ice
          const A = p.target;
          if (!A || (p.mission === 'chat' ? A.st !== 'wait' && A.st !== 'chat' : A.st === 'skate' || A.st === 'rise')) { p.st = 'skate'; p.target = null; p.t = 10 + Math.random() * 10; }
          else {
            const dx = A.x - p.x, gap = Math.max(A.k || 30, 30 * sc) * (p.mission === 'chat' ? 0.62 : 0.78);
            p.dir = dx >= 0 ? 1 : -1; p.f += (A.f - p.f) * Math.min(1, dt * 0.9);
            glide = Math.abs(dx) <= gap ? 0 : Math.abs(dx) < gap * 3 ? 1.2 : 3.4;
            if (Math.abs(dx) <= gap && p.mission === 'chat' && A.st === 'wait') { p.st = 'chat'; p.t = A.t = 7 + Math.random() * 6; A.st = 'chat'; A.dir = p.x >= A.x ? 1 : -1; p.sayPh = 0; A.sayPh = Math.PI; }
            else if (Math.abs(dx) <= gap && p.mission !== 'chat' && A.st === 'down') { p.st = 'assist'; p.t = 2; A.st = 'rise'; A.t = 1.5; A.helper = null; A.aided = true; A.side = (p.x >= A.x ? 1 : -1) * A.dir; }
          }
        } else if (p.st === 'wait') {                         // slows to a stop and waits for a friend
          p.slide *= Math.pow(0.2, dt); glide = p.slide; spin = 1;
          if (p.t <= 0) { p.st = 'skate'; p.t = 14 + Math.random() * 20; }
        } else if (p.st === 'chat') {                         // stand face to face and talk, then skate off together or apart
          glide = 0; spin = 1.1;
          if (p.t <= 0) { const o = s.skaters.find(q => q !== p && q.st === 'chat' && Math.abs(q.x - p.x) < 4 * (p.k || 30)), d = Math.sign(p.x - (o ? o.x : 0)) || 1, together = Math.random() < 0.5; p.st = 'skate'; p.t = 14 + Math.random() * 30; p.dir = d; if (o) { o.st = 'skate'; o.t = 14 + Math.random() * 30; o.dir = together ? d : -d; } }
        } else if (p.st === 'assist') {                      // stands there with a hand out until they are back on their feet
          glide = 0; spin = 0.3; want = 1; p.side = 1;
          if (p.t <= 0) { const A = p.target; p.st = 'skate'; p.t = 14 + Math.random() * 30; p.target = null; const d = Math.sign(p.x - (A ? A.x : 0)) || 1; p.dir = d; if (A) A.dir = d; }
        }
        p.reach += (want - p.reach) * Math.min(1, dt * 6); p.talk += ((p.st === 'chat' ? 1 : 0) - p.talk) * Math.min(1, dt * 4);
        p.x = clamp(p.x + p.dir * p.v * sc * dep * dt * glide, W * 0.03, W * 1.0); p.ph += dt * spin;
        if (p.st === 'skate' && ((p.dir > 0 && p.x > W * 0.97) || (p.dir < 0 && p.x < W * 0.1))) p.dir = -p.dir;
      });
      s.skaters.slice().sort((m, n) => (m.y - n.y) || ((m.st === 'assist') - (n.st === 'assist'))).forEach(p => { s.drawPerson(ctx, p, p.x, p.y, p.k); s.breath(p, p.x, p.y, p.k, dt); });
      ctx.drawImage(s.ground, 0, 0, W, H);
      ctx.drawImage(s.fence, 0, 0, W, H);
      s.people.filter(p => p.near).concat(s.talkers.filter(p => p.near)).sort((m, n) => m.x - n.x).forEach(p => { const u = clamp((p.x / W - 0.19) / 0.85, -0.2, 1.2), e = s.edge(u), k = (96 + 150 * u) * sc, y = e.y + (46 + 70 * u) * sc; s.drawPerson(ctx, p, p.x, y, k); s.breath(p, p.x, y, k, dt); });
      ctx.drawImage(s.lampArt, 0, 0, W, H);
      ctx.drawImage(s.bench, 0, 0, W, H);
      const fl = clamp(0.92 + 0.08 * (a.n2(t * 2.2, 5) - 0.5) * 2, 0.78, 1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.3 * fl; a.sprite(s.warm, L.x, L.top + 14 * sc, H * 1.1);
      ctx.globalAlpha = 0.34 * fl; a.sprite(s.warm, L.x, L.top + 10 * sc, 120 * sc);
      ctx.globalAlpha = 0.26 * fl; a.sprite(s.warm, L.x + W * 0.04, L.base - 40 * sc, H * 0.9);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      s.puffs = s.puffs.filter(q => (q.life -= dt) > 0);
      s.puffs.forEach(q => { const u = 1 - q.life / q.max; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.985; ctx.globalAlpha = 0.34 * Math.sin(Math.min(1, u * 1.6) * Math.PI * 0.5) * (1 - u); a.sprite(s.flake, q.x, q.y, q.sz * (1 + u * 2.4) * 2); });
      ctx.globalAlpha = 1;
      // snow in three depths; the nearest flakes are big, soft and stretched by their speed
      s.flakes.forEach((layer, li) => layer.forEach(p => {
        const turb = (a.n2(p.x * 0.004 + t * 0.12, p.y * 0.004) - 0.5) * [40, 80, 140][li], vx = -[10, 20, 36][li] - gust * [30, 60, 110][li] + turb + wnd * 10;
        p.y += p.v * dt * (0.85 + 0.3 * a.n2(p.ph + t * 0.2, 1)); p.x += vx * dt;
        if (p.y > H + 12) { p.y = -12; p.x = Math.random() * (W + 80); } if (p.x < -30) p.x += W + 60; if (p.x > W + 30) p.x -= W + 60;
        const x = p.x + Math.sin(t * 0.8 + p.ph) * [5, 9, 16][li]; ctx.globalAlpha = p.al;
        if (li === 2) ctx.drawImage(s.flake, x - p.sz, p.y - p.sz * 1.5, p.sz * 2, p.sz * 3); else a.sprite(s.flake, x, p.y, p.sz * 2);
      }));
      ctx.globalAlpha = 1;
    },
  };

  /* ---------- city at dusk: a bedroom window onto a skyline, a river and a lit bridge ---------- */
  scenes.city = {
    post: { bloom: 0.55, grade: 'rgb(255,150,120)', gradeA: 0.1, vignette: 0.58, grain: 0.085, halo: 0.14, haloColor: 'rgb(255,130,90)' },
    init(a) {
      const { W, H } = a, s = (a.s = {}), r = rng(41), sc = Math.max(0.75, Math.min(1.4, H / 760)), portrait = W < H * 0.95;
      const win = (s.win = portrait ? { x: W * 0.3, y: H * 0.03, w: W * 0.66, h: H * 0.62 } : { x: W * 0.33, y: H * 0.05, w: W * 0.6, h: H * 0.64 });
      const hy = (s.hy = Math.round(win.h * 0.6)); // horizon, inside the window
      // ---- the view (window sized) ----
      s.sky = a.layer(win.w, win.h, (g, w, h) => {
        a.vgrad(g, w, h, [[0, [14, 18, 44]], [0.28, [40, 38, 86]], [0.5, [96, 62, 112]], [0.66, [196, 96, 98]], [0.76, [248, 130, 80]], [1, [255, 170, 96]]]);
        for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,240,230,${0.1 + r() * 0.4})`; g.fillRect(r() * w, r() * h * 0.3, 1.1, 1.1); }
      });
      const cols = { shadow: [20, 22, 54], lit: [200, 98, 96], rim: [255, 168, 104] };
      s.cA = a.cloudTex(768, 220, 4, cols, { sx: 3.2, sy: 2.4, cut: 0.48, gain: 3.8, alpha: 0.95, lx: 0.1, ly: 0.9 });
      s.cB = a.cloudTex(768, 110, 8, { shadow: [40, 34, 74], lit: [232, 120, 88], rim: [255, 188, 112] }, { sx: 5.5, sy: 1.6, cut: 0.5, gain: 3.4, alpha: 0.85, lx: 0.1, ly: 0.9 });
      s.off = [r() * 600, r() * 600];
      const lights = []; s.lit = lights;
      const towers = (g, w, base, cnt, hMin, hMax, col, seed, o) => {
        const q = rng(seed); let x = -8;
        while (x < w + 10) {
          const bw = rr(q, o.wMin, o.wMax) * sc, bh = rr(q, hMin, hMax) * (q() > 0.93 ? 1.55 : 1);
          g.fillStyle = rgb(col); g.fillRect(x, base - bh, bw, bh + 6);
          if (q() > 0.8) { g.fillRect(x + bw * 0.42, base - bh - bh * 0.18, 1.8 * sc, bh * 0.18); if (o.beacons) lights.push({ x: x + bw * 0.42 + 0.9, y: base - bh - bh * 0.18, red: true, ph: q() * 9 }); }
          if (q() > 0.7) g.fillRect(x + bw * 0.15, base - bh - 5 * sc, bw * 0.7, 5 * sc);
          for (let wy = base - bh + 6 * sc; wy < base - 4; wy += 7 * sc) for (let wx = x + 3 * sc; wx < x + bw - 3 * sc; wx += 5.2 * sc) if (q() < o.lit) {
            const warm = q() > 0.3, c = warm ? [255, rr(q, 190, 226), rr(q, 120, 170)] : [220, 232, 255];
            g.fillStyle = rgb(c, o.al * rr(q, 0.55, 1)); g.fillRect(wx, wy, 2.2 * sc, 3 * sc);
            if (q() < 0.2 && o.refl) lights.push({ x: wx, y: wy, c, ph: q() * 9 });
          }
          x += bw + rr(q, 0, 3);
        }
      };
      s.farCity = a.layer(win.w, win.h, (g, w, h) => {
        towers(g, w, hy, 0, h * 0.06, h * 0.2, [26, 28, 56], 11, { wMin: 14, wMax: 34, lit: 0.18, al: 0.55, refl: false });
        const hz = g.createLinearGradient(0, hy - h * 0.2, 0, hy); hz.addColorStop(0, 'rgba(255,150,90,0)'); hz.addColorStop(1, 'rgba(255,150,90,.4)'); g.globalCompositeOperation = 'source-atop'; g.fillStyle = hz; g.fillRect(0, hy - h * 0.2, w, h * 0.2); g.globalCompositeOperation = 'source-over';
      });
      s.nearCity = a.layer(win.w, win.h, (g, w, h) => {
        towers(g, w, hy, 0, h * 0.07, h * 0.24, [14, 16, 34], 23, { wMin: 16, wMax: 40, lit: 0.34, al: 0.9, refl: true, beacons: true });
        // the tall landmark with a stepped crown and a spire
        const tx = w * 0.62, tw = 18 * sc, th = h * 0.4; g.fillStyle = 'rgb(12,14,30)'; g.fillRect(tx - tw / 2, hy - th, tw, th + 6); g.fillRect(tx - tw * 0.36, hy - th - 14 * sc, tw * 0.72, 14 * sc); g.fillRect(tx - tw * 0.2, hy - th - 30 * sc, tw * 0.4, 16 * sc); g.fillRect(tx - 1, hy - th - 62 * sc, 2, 32 * sc);
        for (let wy = hy - th + 6; wy < hy - 4; wy += 6 * sc) for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(255,214,150,.85)'; g.fillRect(tx - tw / 2 + 2 + k * 5.4 * sc, wy, 3.2 * sc, 4 * sc); }
        g.fillStyle = 'rgba(255,240,210,.95)'; g.fillRect(tx - tw * 0.36, hy - th - 14 * sc, tw * 0.72, 3 * sc); lights.push({ x: tx, y: hy - th - 62 * sc, red: true, ph: 2 }); s.spire = { x: tx, y: hy - th - 62 * sc };
        const hz = g.createLinearGradient(0, hy - h * 0.1, 0, hy); hz.addColorStop(0, 'rgba(255,140,80,0)'); hz.addColorStop(1, 'rgba(255,140,80,.32)'); g.globalCompositeOperation = 'source-atop'; g.fillStyle = hz; g.fillRect(0, hy - h * 0.1, w, h * 0.1); g.globalCompositeOperation = 'source-over';
      });
      s.shore = a.layer(win.w, win.h, (g, w, h) => {
        const q = rng(61); g.fillStyle = 'rgb(8,10,22)'; g.beginPath(); g.moveTo(0, h); let x = 0; g.lineTo(0, h * 0.9); while (x < w) { const bw = rr(q, 24, 70) * sc, bh = rr(q, 0.02, 0.09) * h; g.lineTo(x, h * 0.93 - bh); g.lineTo(x + bw, h * 0.93 - bh); x += bw; } g.lineTo(w, h); g.closePath(); g.fill();
        for (let i = 0; i < 90; i++) { const c = q() > 0.35 ? [255, 206, 140] : [255, 240, 220]; g.fillStyle = rgb(c, 0.5 + q() * 0.4); g.fillRect(q() * w, h * rr(q, 0.88, 0.99), 2 * sc, 1.6 * sc); }
      });
      s.glow = a.glow([255, 214, 150], 32); s.red = a.glow([255, 70, 60], 32); s.warm = a.glow([255, 168, 84], 256); s.cool = a.glow([200, 220, 255], 128);
      // the bridge runs across the river, with long-exposure light trails
      s.bz = { p0: [-30, win.h * 0.97], c: [win.w * 0.45, win.h * 0.74], p1: [win.w * 1.05, win.h * 0.625] };
      s.cars = Array.from({ length: a.n(40) }, (_, i) => ({ u: r(), v: 0.07 + r() * 0.08, lane: i % 2 ? 1 : -1, len: 0.07 + r() * 0.1 }));
      s.planes = []; s.nextPlane = 8;
      // ---- the bedroom ----
      const cand = [], bulbs = [];
      s.room = a.blur(a.layer(W, H, (g, w, h) => {
        const wl = g.createLinearGradient(0, 0, 0, h); wl.addColorStop(0, 'rgb(34,28,28)'); wl.addColorStop(0.5, 'rgb(74,58,50)'); wl.addColorStop(1, 'rgb(36,28,26)'); g.fillStyle = wl; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(255,230,200,${0.01 + r() * 0.02})`; g.fillRect(r() * w, r() * h, rr(r, 1, 3), rr(r, 1, 3)); }
        g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.fillRect(win.x, win.y, win.w, win.h); g.globalCompositeOperation = 'source-over';
        // black window frame (thick on the right and top), thin pale bar on the left
        const fr = (x0, y0, w0, h0, c1, c2) => { const lg = g.createLinearGradient(x0, 0, x0 + w0, 0); lg.addColorStop(0, c1); lg.addColorStop(1, c2); g.fillStyle = lg; g.fillRect(x0, y0, w0, h0); };
        fr(win.x + win.w, win.y - 20 * sc, W - (win.x + win.w), win.h + 20 * sc, 'rgb(8,8,10)', 'rgb(22,22,26)'); fr(win.x - 8 * sc, win.y - 24 * sc, win.w + 8 * sc, 24 * sc, 'rgb(12,12,14)', 'rgb(8,8,10)');
        fr(win.x - 14 * sc, win.y - 24 * sc, 14 * sc, win.h + 24 * sc, 'rgb(190,182,170)', 'rgb(120,114,104)');
        g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(win.x + win.w, win.y - 20 * sc, 2, win.h + 20 * sc);
        // sill with two glass candles, a stack of books and baby's-breath
        const sy = win.y + win.h, sg = g.createLinearGradient(0, sy, 0, sy + 30 * sc); sg.addColorStop(0, 'rgb(146,134,118)'); sg.addColorStop(1, 'rgb(78,70,62)'); g.fillStyle = sg; g.fillRect(win.x - 36 * sc, sy, win.w + 40 * sc, 26 * sc); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(win.x - 36 * sc, sy + 26 * sc, win.w + 40 * sc, 10 * sc);
        const candle = (cx, cy, k) => { g.fillStyle = 'rgba(210,220,230,.28)'; g.fillRect(cx - 14 * k, cy - 38 * k, 28 * k, 38 * k); g.fillStyle = 'rgb(240,230,208)'; g.fillRect(cx - 10 * k, cy - 28 * k, 20 * k, 28 * k); g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 1; g.strokeRect(cx - 14 * k, cy - 38 * k, 28 * k, 38 * k); cand.push({ x: cx, y: cy - 32 * k, ph: r() * 9 }); };
        candle(win.x + win.w * 0.08, sy, sc); candle(win.x + win.w * 0.94, sy - 4 * sc, sc);
        [[0.2, 22, [60, 52, 48]], [0.2, 36, [128, 96, 70]], [0.2, 50, [44, 40, 40]]].forEach(([fx, hh, c], i) => { g.fillStyle = rgb(c); g.fillRect(win.x + win.w * fx - 4 * sc * i, sy - hh * sc, 74 * sc, 14 * sc); });
        for (let i = 0; i < 40; i++) { const bx = win.x + win.w * 0.93 + (r() - 0.5) * 50 * sc, by = sy - 40 * sc - r() * 60 * sc; g.strokeStyle = 'rgba(180,170,150,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(win.x + win.w * 0.93, sy - 20 * sc); g.lineTo(bx, by); g.stroke(); g.fillStyle = 'rgba(246,240,230,.85)'; g.beginPath(); g.arc(bx, by, 2.4 * sc, 0, TAU); g.fill(); }
        // the wall to the left: poster, a collage of photos, a vinyl record, fairy lights
        const lw = win.x - 24 * sc;
        g.fillStyle = 'rgb(160,152,136)'; g.fillRect(lw * 0.08, h * 0.17, lw * 0.52, h * 0.24); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(lw * 0.08 + lw * 0.52, h * 0.17 + 4, 4, h * 0.24);
        for (let i = 0; i < 9; i++) { g.fillStyle = 'rgba(40,36,34,.8)'; g.fillRect(lw * 0.13, h * 0.2 + i * 14 * sc, lw * (0.12 + (i % 3 === 1 ? 0.22 : 0.1) + r() * 0.08), 4 * sc); }
        for (let i = 0; i < 15; i++) { const px = lw * (0.04 + r() * 0.84), py = h * (0.05 + r() * 0.44), pw = rr(r, 30, 62) * sc, ph = pw * rr(r, 1.1, 1.4); if (px > lw * 0.06 && px < lw * 0.64 && py > h * 0.15 && py < h * 0.43) continue; g.save(); g.translate(px, py); g.rotate((r() - 0.5) * 0.18); g.fillStyle = 'rgb(168,160,146)'; g.fillRect(-pw / 2, -ph / 2, pw, ph); const pg = g.createLinearGradient(0, -ph / 2, 0, ph / 2); pg.addColorStop(0, `rgb(${40 + r() * 40},${38 + r() * 30},${36 + r() * 30})`); pg.addColorStop(1, 'rgb(14,12,12)'); g.fillStyle = pg; g.fillRect(-pw / 2 + 3, -ph / 2 + 3, pw - 6, ph - 14 * sc); g.fillStyle = 'rgba(200,190,170,.45)'; g.beginPath(); g.arc(0, -ph * 0.05, pw * 0.16, 0, TAU); g.fill(); g.fillRect(-pw * 0.2, ph * 0.02, pw * 0.4, ph * 0.3); g.restore(); }
        const vx = lw * 0.5, vy = h * 0.52, vr = 44 * sc; const vg = g.createRadialGradient(vx, vy, vr * 0.2, vx, vy, vr); vg.addColorStop(0, 'rgb(26,22,22)'); vg.addColorStop(1, 'rgb(8,8,8)'); g.fillStyle = vg; g.beginPath(); g.arc(vx, vy, vr, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1; for (let k = 1; k < 9; k++) { g.beginPath(); g.arc(vx, vy, vr * (0.35 + k * 0.07), 0, TAU); g.stroke(); } g.fillStyle = 'rgb(176,52,46)'; g.beginPath(); g.arc(vx, vy, vr * 0.3, 0, TAU); g.fill(); g.fillStyle = 'rgb(16,12,12)'; g.beginPath(); g.arc(vx, vy, 3 * sc, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(30,24,20,.7)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(0, h * 0.12); for (let x = 0; x <= lw; x += 6) g.lineTo(x, h * 0.12 + Math.sin(x / lw * Math.PI * 2.4) * 16 * sc + x * 0.05); g.stroke();
        for (let i = 0; i < 18; i++) { const u = i / 17, x = u * lw, y = h * 0.12 + Math.sin(u * Math.PI * 2.4) * 16 * sc + x * 0.05; bulbs.push({ x, y: y + 4, ph: r() * 9 }); }
        // trailing ivy along the window's left edge
        for (let k = 0; k < 3; k++) { const x0 = win.x - 22 * sc - k * 14 * sc, len = rr(r, 0.5, 0.78) * h; g.strokeStyle = 'rgb(30,66,40)'; g.lineWidth = 2 * sc; g.beginPath(); g.moveTo(x0, win.y - 14 * sc); g.bezierCurveTo(x0 + 10, h * 0.2, x0 - 12, h * 0.36, x0 + 4, win.y + len * 0.8); g.stroke(); for (let i = 0; i < 26; i++) { const u = i / 25; g.fillStyle = rgb(mix([30, 78, 46], [70, 130, 70], r())); g.beginPath(); g.ellipse(x0 + (r() - 0.5) * 22 * sc, win.y + u * len * 0.8, 8 * sc, 5 * sc, r() * 3, 0, TAU); g.fill(); } }
        // bedside chest of drawers with a candle, a vase of tulips and books
        const nx = 0, ny = h * 0.66, nw = lw * 0.62, nh = h * 0.24;
        const ng = g.createLinearGradient(0, ny, 0, ny + nh); ng.addColorStop(0, 'rgb(216,208,192)'); ng.addColorStop(1, 'rgb(112,102,90)'); g.fillStyle = ng; g.fillRect(nx, ny, nw, nh);
        g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 1.4; for (let k = 1; k < 3; k++) { g.beginPath(); g.moveTo(nx, ny + nh * k / 3); g.lineTo(nx + nw, ny + nh * k / 3); g.stroke(); g.fillStyle = 'rgba(60,54,48,.8)'; g.fillRect(nx + nw * 0.46, ny + nh * (k - 1) / 3 + nh * 0.12, nw * 0.12, 4); }
        candle(nx + nw * 0.18, ny, sc * 0.9);
        g.fillStyle = 'rgba(190,210,220,.25)'; g.fillRect(nx + nw * 0.55, ny - 60 * sc, 28 * sc, 60 * sc);
        for (let i = 0; i < 6; i++) { const ang = -Math.PI / 2 + (i - 2.5) * 0.28, len = rr(r, 50, 86) * sc; g.strokeStyle = 'rgb(54,96,54)'; g.lineWidth = 2.4 * sc; g.beginPath(); g.moveTo(nx + nw * 0.55 + 14 * sc, ny - 50 * sc); g.lineTo(nx + nw * 0.55 + 14 * sc + Math.cos(ang) * len * 0.5, ny - 50 * sc + Math.sin(ang) * len); g.stroke(); g.fillStyle = 'rgb(216,98,36)'; g.beginPath(); g.ellipse(nx + nw * 0.55 + 14 * sc + Math.cos(ang) * len * 0.5, ny - 50 * sc + Math.sin(ang) * len, 6 * sc, 9 * sc, ang + Math.PI / 2, 0, TAU); g.fill(); }
      }), 1.5 * sc);
      s.cand = cand; s.bulbs = bulbs;
      s.dark = a.lightmap(W, H, { color: [5, 4, 9], ambient: 0.55, holes: [[[win.x, win.y], [win.x + win.w, win.y], [win.x + win.w, win.y + win.h], [win.x, win.y + win.h]]], lights: [
        ...cand.map(c => ({ x: c.x, y: c.y, r: 110 * sc, s: 0.6 })),
        ...bulbs.map(b => ({ x: b.x, y: b.y, r: 60 * sc, s: 0.35 })),
        { x: win.x + win.w * 0.5, y: win.y + win.h, r: win.w * 0.7, s: 0.45 },
        { x: W * 0.55, y: H * 0.86, r: W * 0.3, s: 0.5 }] });
      // ---- foreground: rumpled bedding, an open book, a camera and a glowing laptop ----
      s.bed = a.blur(a.layer(W, H, (g, w, h) => {
        const top = x => h * (0.8 - 0.05 * a.fbm(x * 0.004 + 9, 3, 3));
        g.beginPath(); g.moveTo(0, h); for (let x = 0; x <= w; x += 6) g.lineTo(x, top(x)); g.lineTo(w, h); g.closePath();
        const bg = g.createLinearGradient(0, h * 0.74, 0, h); bg.addColorStop(0, 'rgb(132,122,112)'); bg.addColorStop(1, 'rgb(58,52,48)'); g.fillStyle = bg; g.fill();
        g.save(); g.clip();
        for (let k = 0; k < 70; k++) { const x0 = r() * w, y0 = h * rr(r, 0.78, 1), len = rr(r, 60, 240) * sc; g.strokeStyle = r() > 0.5 ? `rgba(255,248,236,${0.05 + r() * 0.08})` : `rgba(20,14,12,${0.12 + r() * 0.16})`; g.lineWidth = rr(r, 3, 16) * sc; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + len * 0.4, y0 - len * 0.16, x0 + len, y0 + (r() - 0.5) * 40); g.stroke(); }
        g.fillStyle = 'rgb(38,34,32)'; g.beginPath(); g.moveTo(w * 0.42, h * 0.98); g.quadraticCurveTo(w * 0.5, h * 0.8, w * 0.7, h * 0.84); g.quadraticCurveTo(w * 0.95, h * 0.88, w, h * 0.82); g.lineTo(w, h); g.closePath(); g.fill();
        for (let k = 0; k < 18; k++) { g.strokeStyle = `rgba(255,255,255,${0.012 + r() * 0.02})`; g.lineWidth = rr(r, 6, 14) * sc; g.beginPath(); g.moveTo(w * (0.45 + r() * 0.5), h * rr(r, 0.84, 0.98)); g.quadraticCurveTo(w * (0.55 + r() * 0.3), h * rr(r, 0.8, 0.95), w * (0.7 + r() * 0.3), h * rr(r, 0.84, 1)); g.stroke(); }
        g.restore();
        // open book
        const bx = w * 0.27, by = h * 0.9; g.save(); g.translate(bx, by); g.rotate(-0.1); g.fillStyle = 'rgb(222,212,190)'; g.beginPath(); g.moveTo(-84 * sc, 6 * sc); g.lineTo(-4 * sc, -20 * sc); g.lineTo(-4 * sc, 18 * sc); g.lineTo(-84 * sc, 36 * sc); g.closePath(); g.fill(); g.fillStyle = 'rgb(236,226,204)'; g.beginPath(); g.moveTo(4 * sc, -20 * sc); g.lineTo(88 * sc, 4 * sc); g.lineTo(88 * sc, 34 * sc); g.lineTo(4 * sc, 18 * sc); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(60,52,44,.4)'; g.lineWidth = 1; for (let k = 0; k < 8; k++) { g.beginPath(); g.moveTo(-76 * sc, 10 * sc + k * 3.4 * sc); g.lineTo(-10 * sc, -12 * sc + k * 3.2 * sc); g.stroke(); g.beginPath(); g.moveTo(10 * sc, -12 * sc + k * 3.2 * sc); g.lineTo(80 * sc, 8 * sc + k * 3.4 * sc); g.stroke(); } g.restore();
        // camera and its strap
        g.fillStyle = 'rgb(18,18,20)'; g.beginPath(); g.roundRect ? g.roundRect(w * 0.14, h * 0.92, 74 * sc, 44 * sc, 8 * sc) : g.rect(w * 0.14, h * 0.92, 74 * sc, 44 * sc); g.fill(); g.fillStyle = 'rgb(40,40,44)'; g.beginPath(); g.arc(w * 0.14 + 30 * sc, h * 0.92 + 24 * sc, 17 * sc, 0, TAU); g.fill(); g.strokeStyle = 'rgba(20,20,22,.9)'; g.lineWidth = 4 * sc; g.beginPath(); g.moveTo(w * 0.14, h * 0.95); g.bezierCurveTo(w * 0.05, h * 1.0, w * 0.06, h * 1.03, w * 0.12, h * 1.0); g.stroke();
        // laptop lid, seen from behind
        g.save(); g.translate(w * 0.8, h * 0.88); g.rotate(0.06); g.fillStyle = 'rgb(50,52,58)'; g.beginPath(); g.roundRect ? g.roundRect(-72 * sc, -48 * sc, 144 * sc, 98 * sc, 8 * sc) : g.rect(-72 * sc, -48 * sc, 144 * sc, 98 * sc); g.fill(); const lgd = g.createLinearGradient(-72 * sc, 0, 72 * sc, 0); lgd.addColorStop(0, 'rgba(255,255,255,.22)'); lgd.addColorStop(1, 'rgba(0,0,0,.3)'); g.fillStyle = lgd; g.fill(); g.restore();
        s.laptop = { x: w * 0.8, y: h * 0.88 };
      }), 1.1 * sc);
      s.warmup = 0;
    },
    draw(a, t, dt) {
      const { ctx, W, H, s } = a, win = s.win, hy = s.hy, sc = Math.max(0.75, Math.min(1.4, H / 760)), gust = a.gust(t, 3);
      s.off[0] += (3 + gust * 5) * dt; s.off[1] += (6 + gust * 8) * dt;
      // ---- the view, clipped to the window ----
      ctx.save(); ctx.beginPath(); ctx.rect(win.x, win.y, win.w, win.h); ctx.clip(); ctx.translate(win.x, win.y);
      ctx.drawImage(s.sky, 0, 0, win.w, win.h);
      const tile = (img, off, y, h, al) => { const w = img.width * (h / img.height), x0 = -(off % w); ctx.globalAlpha = al; for (let x = x0; x < win.w; x += w) ctx.drawImage(img, x, y, w + 1, h); ctx.globalAlpha = 1; };
      tile(s.cA, s.off[0], win.h * 0.02, win.h * 0.5, 1); tile(s.cB, s.off[1], win.h * 0.34, win.h * 0.26, 0.9);
      ctx.drawImage(s.farCity, 0, 0, win.w, win.h); ctx.drawImage(s.nearCity, 0, 0, win.w, win.h);
      // the river: dark water with a glowing sky reflection on the left and the city's lights smeared downward
      const wg = ctx.createLinearGradient(0, hy, 0, win.h); wg.addColorStop(0, 'rgb(40,36,70)'); wg.addColorStop(0.25, 'rgb(20,22,48)'); wg.addColorStop(1, 'rgb(8,10,24)'); ctx.fillStyle = wg; ctx.fillRect(0, hy, win.w, win.h - hy);
      const sg = ctx.createRadialGradient(win.w * 0.22, hy, 0, win.w * 0.22, hy, win.w * 0.62); sg.addColorStop(0, 'rgba(255,140,90,.55)'); sg.addColorStop(0.6, 'rgba(255,120,90,.16)'); sg.addColorStop(1, 'rgba(255,120,90,0)'); ctx.save(); ctx.beginPath(); ctx.rect(0, hy, win.w, win.h - hy); ctx.clip(); ctx.fillStyle = sg; ctx.fillRect(0, hy, win.w, win.h - hy); ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
      s.lit.forEach(l => {
        const tw = l.red ? Math.max(0, Math.sin(t * 1.8 + l.ph)) : 0.6 + 0.4 * a.n2(t * 0.6 + l.ph, 2);
        if (l.red) { ctx.globalAlpha = tw; a.sprite(s.red, l.x, l.y, 12 * sc); return; }
        const ry = hy + (hy - l.y) * 0.85 + 4, off = (a.n2(ry * 0.08 + l.ph, t * 0.5) - 0.5) * 6, len = 8 + (hy - l.y) * 0.16;
        ctx.globalAlpha = 0.11 * tw; ctx.fillStyle = rgb(l.c, 1); for (let q = 0; q < 3; q++) { const yy = ry + q * len / 3, ww = 5 + (hy - l.y) * 0.05 + 4 * a.n2(t * 0.8 + q + l.ph, 5); ctx.fillRect(l.x + (a.n2(yy * 0.1 + l.ph, t * 0.7) - 0.5) * 8 - ww / 2, yy, ww, 1.3); }
        ctx.globalAlpha = 0.5 * tw; ctx.fillRect(l.x, l.y, 2 * sc, 2.6 * sc);
      });
      // bridge deck and its traffic trails
      const b = s.bz, bp = u => [(1 - u) * (1 - u) * b.p0[0] + 2 * (1 - u) * u * b.c[0] + u * u * b.p1[0], (1 - u) * (1 - u) * b.p0[1] + 2 * (1 - u) * u * b.c[1] + u * u * b.p1[1]];
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.strokeStyle = 'rgb(10,10,22)'; ctx.lineCap = 'round';
      for (let i = 0; i < 24; i++) { const u0 = i / 24, u1 = (i + 1) / 24, p0 = bp(u0), p1 = bp(u1); ctx.lineWidth = (22 - 13 * u0) * sc; ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke(); if (i % 4 === 1) { ctx.save(); ctx.lineWidth = (6 - 3.5 * u0) * sc; ctx.strokeStyle = 'rgba(8,8,22,.95)'; ctx.beginPath(); ctx.moveTo(p0[0], p0[1] + 8 * sc); ctx.lineTo(p0[0], p0[1] + win.h * 0.14 * (1 - u0 * 0.6)); ctx.stroke(); ctx.restore(); } }
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 30; i++) { const p = bp(i / 29); ctx.globalAlpha = 0.5; a.sprite(s.glow, p[0], p[1] - (7 - 4 * i / 29) * sc, 8 * sc); }
      s.cars.forEach(c => {
        c.u += c.lane * c.v * dt; if (c.u > 1.05) c.u = -0.05; if (c.u < -0.05) c.u = 1.05;
        const p = bp(clamp(c.u, 0, 1)), q = bp(clamp(c.u - c.lane * c.len, 0, 1)), off = (c.lane > 0 ? 1 : -1) * (3.4 - 2 * c.u) * sc;
        const gr = ctx.createLinearGradient(p[0], p[1] + off, q[0], q[1] + off); gr.addColorStop(0, c.lane > 0 ? 'rgba(255,238,196,.95)' : 'rgba(255,72,60,.95)'); gr.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.globalAlpha = 1; ctx.strokeStyle = gr; ctx.lineWidth = (3.6 - 1.8 * c.u) * sc; ctx.beginPath(); ctx.moveTo(p[0], p[1] + off); ctx.lineTo(q[0], q[1] + off); ctx.stroke();
      });
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(s.shore, 0, 0, win.w, win.h);
      // a plane now and then, blinking
      if (t > s.nextPlane) { s.nextPlane = t + 22 + Math.random() * 20; s.planes.push({ x: -10, y: win.h * (0.12 + Math.random() * 0.2), v: 34 + Math.random() * 20 }); }
      for (let i = s.planes.length - 1; i >= 0; i--) { const p = s.planes[i]; p.x += p.v * dt; if (p.x > win.w + 10) { s.planes.splice(i, 1); continue; } ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 + 0.5 * Math.max(0, Math.sin(t * 5)); a.sprite(Math.sin(t * 5) > 0 ? s.red : s.glow, p.x, p.y, 8 * sc); ctx.globalAlpha = 0.4; a.sprite(s.glow, p.x + 6, p.y + 1, 5 * sc); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
      const gl = ctx.createLinearGradient(0, 0, win.w, win.h); gl.addColorStop(0, 'rgba(255,255,255,.05)'); gl.addColorStop(0.45, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(255,170,110,.05)'); ctx.fillStyle = gl; ctx.fillRect(0, 0, win.w, win.h);
      // a faint reflection of the room in the glass, and the haze of a cold evening against it
      ctx.globalCompositeOperation = 'lighter'; s.cand.forEach((c, i) => { ctx.globalAlpha = 0.06 * clamp(0.6 + 0.4 * a.n2(t * 4 + i, 3), 0, 1); a.sprite(s.warm, win.w * 0.5 + (win.x + win.w * 0.5 - c.x) * 0.5, win.h * 0.3, 120 * sc); }); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      const hzy = ctx.createLinearGradient(0, win.h * 0.75, 0, win.h); hzy.addColorStop(0, 'rgba(200,180,200,0)'); hzy.addColorStop(1, 'rgba(200,180,200,.16)'); ctx.fillStyle = hzy; ctx.fillRect(0, win.h * 0.75, win.w, win.h * 0.25);
      ctx.restore();
      a.put(s.room, 0, 0); ctx.drawImage(s.dark, 0, 0, W, H);
      ctx.drawImage(s.bed, 0, 0, W, H);
      // ---- light in the room: city glow through the glass, candles, fairy lights, the laptop screen ----
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.16; ctx.drawImage(s.warm, win.x, win.y + win.h * 0.5, win.w, H * 0.5);
      s.cand.forEach((c, i) => { ctx.globalAlpha = clamp(0.8 + 0.3 * (a.n2(t * 3.4 + c.ph, i) - 0.5), 0.5, 1) * 0.95; a.sprite(s.warm, c.x, c.y, 130 * sc); ctx.globalAlpha = 0.55; a.sprite(s.warm, c.x, c.y, H * 0.5); });
      s.bulbs.forEach(bu => { ctx.globalAlpha = clamp(0.5 + 0.5 * Math.sin(t * 1.5 + bu.ph) * a.n2(t * 0.5 + bu.ph, 1), 0.25, 1); a.sprite(s.glow, bu.x, bu.y, 14 * sc); });
      ctx.globalAlpha = 0.5; a.sprite(s.cool, s.laptop.x, s.laptop.y, 190 * sc); ctx.globalAlpha = 0.9; a.sprite(s.cool, s.laptop.x, s.laptop.y, 56 * sc);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    },
  };

  /* ---------- cherry blossoms: a wooden veranda looking into a big tree in full bloom, with a tiled roof beyond ---------- */
  scenes.sakura = {
    post: { bloom: 0.2, grade: 'rgb(150,110,130)', gradeA: 0.1, vignette: 0.4, grain: 0.04, halo: 0.04, haloColor: 'rgb(255,170,190)' },
    init(a) {
      const { W, H } = a, s = (a.s = {}), r = rng(37), sc = Math.max(0.75, Math.min(1.4, H / 760)), portrait = W < H * 0.95;
      const postW = W * (portrait ? 0.2 : 0.155), railY = H * 0.875;

      /* one blossom: five notched petals, pale at the tips, deeper pink at the heart */
      const flowerSprite = (c0, c1) => a.layer(30, 30, g => {
        g.translate(15, 15);
        for (let i = 0; i < 5; i++) { g.save(); g.rotate(i / 5 * TAU + 0.3); const pg = g.createLinearGradient(0, 0, 0, -13); pg.addColorStop(0, rgb(c0)); pg.addColorStop(1, rgb(c1));
          g.fillStyle = pg; g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-7.5, -4, -7, -12, -1.6, -13.4); g.lineTo(0, -11.6); g.lineTo(1.6, -13.4); g.bezierCurveTo(7, -12, 7.5, -4, 0, 0); g.fill(); g.restore(); }
        g.fillStyle = 'rgba(190,70,110,.85)'; g.beginPath(); g.arc(0, 0, 2.2, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(255,236,170,.9)'; g.lineWidth = 0.7; for (let i = 0; i < 6; i++) { const q = i / 6 * TAU; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(q) * 5, Math.sin(q) * 5); g.stroke(); }
      });
      const SP = { lit: [flowerSprite([222, 128, 164], [244, 200, 218]), flowerSprite([232, 146, 180], [248, 214, 228])], mid: [flowerSprite([206, 108, 148], [232, 168, 198]), flowerSprite([216, 122, 160], [238, 184, 208])], dark: [flowerSprite([168, 84, 124], [208, 140, 172]), flowerSprite([180, 94, 134], [214, 150, 180])] };
      const bloom = (g, x, y, tone, k) => { const set = SP[tone], sp = set[Math.floor(r() * set.length)], z = (14 + r() * 12) * k * sc; g.save(); g.translate(x, y); g.rotate(r() * TAU); g.drawImage(sp, -z / 2, -z / 2, z, z); g.restore(); };

      // ---- a pale, misty sky and the garden beyond, out of focus ----
      s.sky = a.layer(W, H, (g, w, h) => { a.vgrad(g, w, h, [[0, [176, 172, 186]], [0.55, [164, 160, 174]], [1, [146, 142, 156]]]); });
      s.far = a.blur(a.layer(W, H, (g, w, h) => {
        const blob = (x, y, rad, c, al) => { const gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, rgb(c, al)); gr.addColorStop(0.65, rgb(c, al * 0.6)); gr.addColorStop(1, rgb(c, 0)); g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2); };
        for (let i = 0; i < 60; i++) blob(w * (0.15 + r() * 0.36), h * (0.34 + r() * 0.5), (50 + r() * 70) * sc, mix([232, 150, 186], [248, 200, 218], r()), 0.85);           // pink trees on the left
        for (let i = 0; i < 70; i++) blob(w * (0.28 + r() * 0.5), h * (0.56 + r() * 0.42), (46 + r() * 56) * sc, mix([48, 76, 52], [92, 120, 80], r()), 0.95);                   // dark green shrubs and pines
        for (let i = 0; i < 24; i++) blob(w * (0.5 + r() * 0.2), h * (0.5 + r() * 0.2), (40 + r() * 50) * sc, mix([226, 150, 184], [244, 190, 212], r()), 0.5);
        // the tiled roof of a low building
        const bx = w * 0.76, by = h * 0.62; g.fillStyle = 'rgb(214,196,160)'; g.fillRect(bx + w * 0.02, by + h * 0.1, w * 0.3, h * 0.2);
        g.fillStyle = 'rgb(62,66,72)'; g.beginPath(); g.moveTo(bx - w * 0.03, by + h * 0.12); g.quadraticCurveTo(bx + w * 0.02, by + h * 0.04, bx + w * 0.12, by); g.lineTo(bx + w * 0.4, by - h * 0.01); g.lineTo(bx + w * 0.4, by + h * 0.12); g.closePath(); g.fill();
        for (let i = 0; i < 12; i++) { g.strokeStyle = 'rgba(160,170,180,.35)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(bx - w * 0.02 + i * w * 0.036, by + h * 0.1); g.lineTo(bx + w * 0.02 + i * w * 0.036, by + h * 0.005); g.stroke(); }
        g.fillStyle = 'rgba(90,70,56,.8)'; g.fillRect(bx + w * 0.02, by + h * 0.12, w * 0.3, h * 0.012);
        const mist = g.createLinearGradient(0, h * 0.4, 0, h * 0.9); mist.addColorStop(0, 'rgba(232,230,238,0)'); mist.addColorStop(1, 'rgba(190,186,200,.1)'); g.fillStyle = mist; g.fillRect(0, h * 0.4, w, h * 0.5);
      }), 3.2 * sc);

      // ---- the big tree: dark trunk and limbs, then thousands of blossoms ----
      s.tree = a.layer(W, H, (g, w, h) => {
        const limb = (pts, w0, w1) => {
          g.lineCap = 'round'; g.lineJoin = 'round';
          for (let i = 0; i < pts.length - 1; i++) { const u = i / (pts.length - 1), wd = w0 + (w1 - w0) * u; g.strokeStyle = 'rgb(70,46,42)'; g.lineWidth = wd; g.beginPath(); g.moveTo(pts[i][0], pts[i][1]); g.lineTo(pts[i + 1][0], pts[i + 1][1]); g.stroke(); g.strokeStyle = 'rgba(138,98,86,.4)'; g.lineWidth = Math.max(1, wd * 0.22); g.beginPath(); g.moveTo(pts[i][0] - wd * 0.2, pts[i][1] - wd * 0.12); g.lineTo(pts[i + 1][0] - wd * 0.2, pts[i + 1][1] - wd * 0.12); g.stroke(); }
        };
        const curve = (c, n) => { const out = []; for (let i = 0; i <= n; i++) { const u = i / n, k = u * (c.length - 1), j = Math.min(c.length - 2, Math.floor(k)), f = k - j, p0 = c[Math.max(0, j - 1)], p1 = c[j], p2 = c[j + 1], p3 = c[Math.min(c.length - 1, j + 2)];
          const cr = (a0, a1, a2, a3) => 0.5 * ((2 * a1) + (-a0 + a2) * f + (2 * a0 - 5 * a1 + 4 * a2 - a3) * f * f + (-a0 + 3 * a1 - 3 * a2 + a3) * f * f * f); out.push([cr(p0[0], p1[0], p2[0], p3[0]) * w, cr(p0[1], p1[1], p2[1], p3[1]) * h]); } return out; };
        const trunk = curve([[1.05, 1.02], [1.0, 0.74], [0.95, 0.5], [0.93, 0.32], [0.92, 0.2]], 18); limb(trunk, 150 * sc, 70 * sc);
        const limbs = [
          [[0.93, 0.34], [0.84, 0.27], [0.7, 0.21], [0.54, 0.23], [0.4, 0.29], [0.3, 0.33]], [[0.92, 0.42], [0.82, 0.41], [0.68, 0.44], [0.54, 0.5], [0.44, 0.58]],
          [[0.94, 0.22], [0.86, 0.13], [0.72, 0.07], [0.56, 0.05], [0.4, 0.07]], [[0.97, 0.58], [0.88, 0.62], [0.78, 0.7], [0.68, 0.78], [0.62, 0.86]],
          [[0.8, 0.25], [0.74, 0.34], [0.68, 0.42]], [[0.62, 0.22], [0.55, 0.12], [0.5, 0.04]], [[0.7, 0.44], [0.64, 0.52], [0.6, 0.6]],
        ];
        const all = [];
        limbs.forEach((c, i) => { const pts = curve(c, 22); limb(pts, (i < 4 ? 40 : 20) * sc, 5 * sc); all.push([pts, i < 4 ? 1 : 0.7]);
          // twigs off every limb
          for (let t = 3; t < pts.length - 2; t += 2) { const [px, py] = pts[t], ang = -Math.PI * 0.5 + (r() - 0.5) * 2.6 + Math.PI * 0.5 * (i % 2 ? 1 : -1) * 0.5, len = rr(r, 40, 110) * sc, tw = []; for (let q = 0; q <= 5; q++) tw.push([px + Math.cos(ang + q * 0.12) * len * q / 5, py + Math.sin(ang + q * 0.12) * len * q / 5 + q * 4]); limb(tw, 6 * sc, 1.6 * sc); all.push([tw, 0.5]); }
        });
        // a shadowy under-layer so the canopy has depth, then the flowers: lit on top, shaded below
        const mass = (cx, cy, rad) => { const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad); gr.addColorStop(0, 'rgba(200,110,150,.55)'); gr.addColorStop(1, 'rgba(200,110,150,0)'); g.fillStyle = gr; g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2); };
        for (let i = 0; i < 90; i++) { const x = w * (0.34 + r() * 0.7), y = h * (0.0 + r() * 0.56); if (x < w * 0.5 && y > h * 0.3 && r() < 0.6) continue; mass(x, y, (60 + r() * 90) * sc); }
        const cluster = (cx, cy, n, rad) => { for (let i = 0; i < n; i++) { const ang = r() * TAU, d = Math.sqrt(r()) * rad, x = cx + Math.cos(ang) * d, y = cy + Math.sin(ang) * d * 0.8, dk = (y - cy) / rad + (r() - 0.5) * 0.7; bloom(g, x, y, dk < -0.2 ? 'lit' : dk < 0.45 ? 'mid' : 'dark', 1); } };
        all.forEach(([pts, dens]) => pts.forEach((p, i) => { if (p[0] > w * 1.02) return; if (i % 2 === 0) cluster(p[0], p[1], Math.round(16 * dens + 6), (26 + 20 * dens) * sc); }));
        for (let i = 0; i < 130; i++) { const x = w * (0.4 + r() * 0.64), y = h * (-0.02 + r() * 0.52); if (x < w * 0.52 && y > h * 0.28) continue; cluster(x, y, 34, (46 + r() * 36) * sc); }       // the dense crown, up and to the right
        for (let i = 0; i < 40; i++) { const x = w * (0.45 + r() * 0.5), y = h * (0.45 + r() * 0.35); if (r() < 0.45) cluster(x, y, 22, 40 * sc); }
      });

      // ---- the veranda in the foreground: roof eave, window post and railing ----
      s.frame = a.layer(W, H, (g, w, h) => {
        const woodG = (x, y, ww, hh, vertical) => { const gr = vertical ? g.createLinearGradient(x, 0, x + ww, 0) : g.createLinearGradient(0, y, 0, y + hh); gr.addColorStop(0, 'rgb(112,64,40)'); gr.addColorStop(0.5, 'rgb(82,44,28)'); gr.addColorStop(1, 'rgb(48,26,16)'); g.fillStyle = gr; g.fillRect(x, y, ww, hh); for (let k = 0; k < 10; k++) { g.strokeStyle = `rgba(20,8,2,${0.1 + r() * 0.2})`; g.lineWidth = 0.7 + r() * 1.4; g.beginPath(); if (vertical) { const gx = x + r() * ww; g.moveTo(gx, y); g.lineTo(gx + (r() - 0.5) * 6, y + hh); } else { const gy = y + r() * hh; g.moveTo(x, gy); g.lineTo(x + ww, gy + (r() - 0.5) * 4); } g.stroke(); } };
        // eave
        g.fillStyle = 'rgb(54,34,24)'; g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.52, 0); g.lineTo(postW * 0.95, h * 0.13); g.lineTo(0, h * 0.1); g.closePath(); g.fill();
        for (let i = 0; i < 9; i++) { const x = w * 0.04 + i * w * 0.055; g.fillStyle = 'rgba(100,64,42,.7)'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 14 * sc, 0); g.lineTo(x * 0.55 + 10 * sc + postW * 0.3, h * 0.1 + (i * 0.002) * h); g.lineTo(x * 0.55 + postW * 0.3, h * 0.1); g.closePath(); g.fill(); }
        g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, 0, w * 0.52, h * 0.012);
        // the window beside the post: lattice over the blurred garden
        const ww = postW * 0.66; g.fillStyle = 'rgba(214,206,214,.2)'; g.fillRect(0, h * 0.09, ww, railY - h * 0.09);
        for (let i = 0; i <= 3; i++) woodG(i * (ww / 3) - 4 * sc, h * 0.09, 8 * sc, railY - h * 0.09, true);
        for (let i = 0; i <= 5; i++) woodG(0, h * 0.09 + i * (railY - h * 0.09) / 5 - 4 * sc, ww, 8 * sc, false);
        woodG(ww, 0, postW - ww, h, true);                   // the post
        g.fillStyle = 'rgba(255,200,150,.18)'; g.fillRect(ww + 3, 0, 3, h);
        // railing with petals lying on it
        woodG(postW, railY, w - postW, 22 * sc, false); g.fillStyle = 'rgba(255,214,190,.28)'; g.fillRect(postW, railY, w - postW, 3);
        for (let x = postW + 40 * sc; x < w; x += 118 * sc) woodG(x, railY + 22 * sc, 16 * sc, h - railY - 22 * sc, true);
        woodG(postW, railY + h * 0.07, w - postW, 12 * sc, false);
        g.fillStyle = 'rgba(0,0,0,.2)'; g.fillRect(postW, railY + 22 * sc, w - postW, 6);
        for (let i = 0; i < 160; i++) { const x = postW + r() * (w - postW), y = railY + 2 + r() * 14 * sc; g.fillStyle = r() > 0.5 ? 'rgba(250,176,202,.95)' : 'rgba(255,214,228,.95)'; g.beginPath(); g.ellipse(x, y, 3 + r() * 4, 1.6 + r() * 1.6, r() * 0.6, 0, TAU); g.fill(); }
      });
      s.petals = Array.from({ length: a.n(80) }, () => { const z = r(); return { x: r() * W, y: r() * H * 0.9, z, v: 16 + z * 44, sw: 0.4 + r() * 1.1, ph: r() * TAU, rot: r() * TAU, spin: (r() - 0.5) * 3, flip: r() * TAU, fs: 1 + r() * 2.5, sz: 4 + z * 8, c: [[250, 170, 198], [255, 214, 228], [238, 140, 176]][Math.floor(r() * 3)] }; });
      s.bk = a.glow([255, 220, 232], 64);
    },
    draw(a, t, dt) {
      const { ctx, W, H, s } = a, wnd = a.wind(t, 2), gust = a.gust(t, 5);
      a.put(s.sky, 0, 0);
      const sway = k => (wnd * 0.5 + gust * 0.5) * k;
      ctx.save(); ctx.transform(1, 0, sway(0.0012), 1, 0, 0); ctx.drawImage(s.far, 0, 0, W, H); ctx.restore();
      // the tree moves as one, pivoting from its trunk
      ctx.save(); ctx.translate(W, H * 0.05); ctx.rotate(sway(0.012) + (a.fbm(t * 0.2, 3, 2) - 0.45) * 0.01); ctx.scale(0.8, 0.8); ctx.translate(-W, -H * 0.05);
      ctx.drawImage(s.tree, 0, 0, W, H); ctx.restore();
      { const tg = ctx.createLinearGradient(W - 62, 0, W, 0); tg.addColorStop(0, 'rgb(58,38,36)'); tg.addColorStop(1, 'rgb(76,52,46)'); ctx.fillStyle = tg; ctx.fillRect(W - 58, H * 0.74, 58, H * 0.16); }   // the trunk carries on down to the veranda
      ctx.fillStyle = 'rgba(176,172,190,.1)'; ctx.fillRect(0, 0, W, H);   // a little air between you and the tree
      s.petals.forEach(p => {
        const turb = (a.n2(p.x * 0.004 + t * 0.1, p.y * 0.004 + p.ph) - 0.5) * 60;
        p.y += p.v * (0.8 + 0.3 * a.n2(p.ph + t * 0.3, 2)) * dt; p.x += (-12 - gust * 50 + turb + wnd * 14) * dt * (0.5 + p.z); p.rot += p.spin * dt;
        if (p.y > H * 0.9) { p.y = -14; p.x = Math.random() * W * 1.2; } if (p.x < -50) p.x += W + 100; if (p.x > W + 60) p.x -= W + 120;
        const x = p.x + Math.sin(t * p.sw + p.ph) * 26 * (0.4 + p.z);
        ctx.save(); ctx.translate(x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.abs(Math.cos(t * p.fs + p.flip)) * 0.8 + 0.2);
        if (p.z > 0.9) { ctx.globalAlpha = 0.5; ctx.drawImage(s.bk, -p.sz * 2.2, -p.sz * 2.2, p.sz * 4.4, p.sz * 4.4); } else { ctx.globalAlpha = 0.95; ctx.fillStyle = rgb(p.c, 1); ctx.beginPath(); ctx.moveTo(0, -p.sz); ctx.bezierCurveTo(p.sz * 0.9, -p.sz * 0.5, p.sz * 0.7, p.sz * 0.8, 0, p.sz); ctx.bezierCurveTo(-p.sz * 0.7, p.sz * 0.8, -p.sz * 0.9, -p.sz * 0.5, 0, -p.sz); ctx.fill(); }
        ctx.restore();
      });
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(46,28,44,.2)'; ctx.fillRect(0, 0, W, H);   // a quieter, overcast light
      a.put(s.frame, 0, 0);
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
    dpr = small ? 1 : Math.min(window.devicePixelRatio || 1, quality < 0.7 ? 1 : 1.5);
    lastW = window.innerWidth; lastH = window.innerHeight;
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
    if (document.hidden) { last = ts; prevTs = 0; return; }
    if (ts - last < 30) return;
    if (prevTs) { fEma = fEma * 0.92 + Math.min(200, ts - prevTs) * 0.08; fN++; } prevTs = ts;
    const dt = Math.min(0.1, (ts - last) / 1000); last = ts; t += dt;
    const t0 = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    scene.draw(A, t, dt);
    applyPost(scene.post);
    // adapt: if drawing is consistently slow, lower particle counts and resolution once or twice
    const cost = performance.now() - t0; emaMs = emaMs ? emaMs * 0.9 + cost * 0.1 : cost;
    frames++; slow += cost;
    if (frames === 90) {
      if ((slow / frames > 18 || (fN > 60 && fEma > 55)) && quality > 0.35) { quality = Math.max(0.35, quality * 0.75); fEma = 33; fN = 0; prevTs = 0; setup(curKey.split('|')[1]); }   // under about 18 fps: simplify
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
    const tint = document.createElement('canvas'); tint.width = bw; tint.height = bh;
    return { grainTile, grain: ctx.createPattern(grainTile, 'repeat'), bloom, bctx, bw, bh, canFilter, vig, tint, tctx: tint.getContext('2d') };
  }
  function applyPost(cfg) {
    if (!cfg || !post) return;
    ctx.save();
    if (cfg.bloom) {
      post.bctx.filter = post.canFilter ? 'brightness(1.15) contrast(1.9) blur(1.5px)' : 'none';
      post.bctx.clearRect(0, 0, post.bw, post.bh); post.bctx.drawImage(canvas, 0, 0, post.bw, post.bh); post.bctx.filter = 'none';
      const lite = small || quality < 0.7;
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = cfg.bloom; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = lite ? 'low' : 'high';
      ctx.drawImage(post.bloom, 0, 0, W, H);
      if (!lite) { ctx.globalAlpha = cfg.bloom * 0.6; ctx.drawImage(post.bloom, -6, -4, W + 12, H + 8); }
      if (cfg.halo && !lite) { // a warm fringe around the brightest areas
        const t = post.tctx; t.globalCompositeOperation = 'source-over'; t.clearRect(0, 0, post.bw, post.bh); t.drawImage(post.bloom, 0, 0);
        t.globalCompositeOperation = 'multiply'; t.fillStyle = cfg.haloColor || 'rgb(255,112,50)'; t.fillRect(0, 0, post.bw, post.bh); t.globalCompositeOperation = 'source-over';
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = cfg.halo; ctx.drawImage(post.tint, -10, -8, W + 20, H + 16);
      }
    }
    if (cfg.grade) { ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = cfg.gradeA == null ? 0.35 : cfg.gradeA; ctx.fillStyle = cfg.grade; ctx.fillRect(0, 0, W, H); }
    ctx.globalCompositeOperation = 'source-over';
    if (cfg.vignette) { ctx.globalAlpha = cfg.vignette; ctx.drawImage(post.vig, 0, 0, W, H); }
    if (cfg.grain && !small) {   // film grain is a full-screen fill every frame: skipped on phones
      ctx.globalAlpha = cfg.grain; ctx.fillStyle = post.grain; ctx.translate(-Math.random() * 160, -Math.random() * 160); ctx.fillRect(0, 0, W + 160, H + 160);
    }
    ctx.restore();
  }

  function stopLoop() { cancelAnimationFrame(raf); raf = 0; }
  function stop() { stopLoop(); curKey = ''; curId = ''; scene = null; if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); window.removeEventListener('resize', onResize); }
  function onResize() {
    if (Math.abs(window.innerWidth - lastW) < 3 && Math.abs(window.innerHeight - lastH) < lastH * 0.3) return;   // only the browser bar moved
    clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (scene && setup(curKey.split('|')[1])) { const reduce = warm(); if (reduce) { scene.draw(A, t, 0.033); applyPost(scene.post); } } }, 400);
  }

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
