/* Procedural trees that actually grow.
 *
 *   TreeGrow.draw(ctx, W, H, { kind, g, seed, t, wind, dpr })   draw one tree (g = growth 0..1) into a ctx scaled to W x H CSS px
 *   TreeGrow.canvas(W, H, opts)                                  a canvas with one tree drawn on it (static)
 *   TreeGrow.mount(canvas, () => opts)                           animate a canvas (wind, growth changes); returns { stop }
 *
 * kinds come from TreeArt.getTreeForSubject(): oak, maple, autumn, blossom, lotus, cyber, conifer,
 * palm, bamboo, cactus, fern, sprout.
 */
(function () {
  'use strict';
  if (window.TreeGrow) return;

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = x => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const rr = (r, a, b) => a + r() * (b - a);
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)].map(Math.round);
  const rgb = (c, a) => (a == null ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);

  const STYLES = {
    oak:     { form: 'broad', trunk: [86, 60, 40], leaves: [[34, 84, 34], [62, 124, 46], [118, 176, 66]], spread: 0.62, size: 1 },
    maple:   { form: 'broad', trunk: [94, 54, 42], leaves: [[128, 30, 24], [204, 72, 30], [248, 154, 58]], spread: 0.68, size: 1.15, maple: true },
    autumn:  { form: 'broad', trunk: [90, 62, 38], leaves: [[150, 88, 24], [212, 148, 42], [246, 208, 96]], spread: 0.64, size: 1 },
    blossom: { form: 'broad', trunk: [100, 64, 60], leaves: [[188, 92, 130], [242, 148, 182], [255, 210, 226]], spread: 0.7, size: 0.8, petals: true },
    lotus:   { form: 'broad', trunk: [84, 66, 44], leaves: [[44, 112, 66], [78, 154, 90], [128, 194, 118]], spread: 0.66, size: 0.9, flowers: [[176, 92, 208], [226, 140, 240]] },
    cyber:   { form: 'broad', trunk: [22, 52, 62], leaves: [[8, 78, 90], [16, 142, 150], [70, 214, 214]], spread: 0.6, size: 0.9, glow: true },
    conifer: { form: 'conifer', trunk: [78, 52, 34], leaves: [[18, 70, 48], [34, 112, 72], [66, 162, 110]] },
    palm:    { form: 'palm', trunk: [140, 108, 66], leaves: [[36, 112, 52], [62, 156, 70], [112, 198, 100]] },
    bamboo:  { form: 'bamboo', trunk: [128, 176, 66], leaves: [[60, 120, 40], [96, 168, 56], [150, 206, 90]] },
    cactus:  { form: 'cactus', trunk: [62, 140, 82], leaves: [[44, 112, 66], [62, 140, 82], [110, 190, 120]] },
    fern:    { form: 'bush', trunk: [60, 90, 40], leaves: [[34, 104, 52], [64, 150, 76], [124, 202, 112]] },
    sprout:  { form: 'broad', trunk: [86, 60, 40], leaves: [[34, 84, 34], [62, 124, 46], [118, 176, 66]], spread: 0.6, size: 1 },
  };

  /* ---------- leaf sprites (drawn once per colour / shape) ---------- */
  const spriteCache = new Map();
  function leafSprite(color, shape) {
    const key = color.join(',') + shape;
    if (spriteCache.has(key)) return spriteCache.get(key);
    const S = 40, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    const lg = g.createLinearGradient(-S * 0.3, -S * 0.3, S * 0.3, S * 0.3); lg.addColorStop(0, rgb(mix(color, [255, 255, 220], 0.28))); lg.addColorStop(1, rgb(mix(color, [0, 0, 0], 0.22)));
    g.fillStyle = lg;
    g.beginPath();
    if (shape === 'maple') {
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? S * 0.17 : S * 0.46; g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad); }
    } else if (shape === 'needle') {
      g.ellipse(0, 0, S * 0.46, S * 0.07, 0, 0, TAU);
    } else if (shape === 'round') {
      g.ellipse(0, 0, S * 0.34, S * 0.34, 0, 0, TAU);
    } else {
      g.moveTo(-S * 0.46, 0); g.quadraticCurveTo(-S * 0.1, -S * 0.34, S * 0.46, 0); g.quadraticCurveTo(-S * 0.1, S * 0.34, -S * 0.46, 0);
    }
    g.closePath(); g.fill();
    if (shape !== 'needle') { g.strokeStyle = rgb(mix(color, [0, 0, 0], 0.4), 0.55); g.lineWidth = 1.1; g.beginPath(); g.moveTo(-S * 0.42, 0); g.lineTo(S * 0.36, 0); g.stroke(); }
    spriteCache.set(key, c); return c;
  }

  /* ---------- skeletons are built once per (kind, seed) and then only grown ---------- */
  const skelCache = new Map();
  function skeleton(kind, seed, st) {
    const key = kind + ':' + seed;
    if (skelCache.has(key)) return skelCache.get(key);
    const r = rng(seed * 7919 + 13), MAXD = 6; let id = 0;
    const make = (d, len, w) => {
      const n = { id: id++, d, len, w, a: 0, at: 1, bend: (r() - 0.5) * 0.4, kids: [], leaf: d >= 3 ? rr(r, 5, 9) : 0 };
      if (d < MAXD) {
        const k = d === 0 ? 4 : d === 1 ? 3 : r() < 0.35 ? 3 : 2;
        for (let i = 0; i < k; i++) {
          const main = i === 0, side = (i % 2 ? 1 : -1) * (0.55 + 0.45 * r());
          const kid = make(d + 1, len * (main ? rr(r, 0.78, 0.92) : d === 0 ? rr(r, 0.72, 0.86) : rr(r, 0.6, 0.8)), w * (main ? rr(r, 0.72, 0.82) : rr(r, 0.52, 0.68)));
          kid.a = main ? (r() - 0.5) * 0.2 : side * st.spread * (d === 0 ? rr(r, 1.05, 1.3) : rr(r, 0.8, 1.25)) + (r() - 0.5) * (d === 0 ? 0.1 : 0.25);
          kid.at = main ? 1 : (d === 0 ? rr(r, 0.62, 0.95) : rr(r, 0.4, 0.85));
          n.kids.push(kid);
        }
      }
      return n;
    };
    const root = make(0, 1, 1);
    skelCache.set(key, root); return root;
  }

  /* ---------- drawing helpers ---------- */
  function ground(ctx, W, H, gy, g, st, seed) {
    const r = rng(seed + 5), cx = W / 2, rx = W * (0.16 + 0.2 * smooth(g * 1.6));
    ctx.save();
    const sh = ctx.createRadialGradient(cx, gy, 0, cx, gy, rx * 1.5); sh.addColorStop(0, 'rgba(0,0,0,.34)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh; ctx.beginPath(); ctx.ellipse(cx, gy + 2, rx * 1.5, rx * 0.34, 0, 0, TAU); ctx.fill();
    const mg = ctx.createLinearGradient(0, gy - H * 0.03, 0, gy + H * 0.05); mg.addColorStop(0, 'rgb(74,56,38)'); mg.addColorStop(1, 'rgb(36,26,18)');
    ctx.fillStyle = mg; ctx.beginPath(); ctx.ellipse(cx, gy + 2, rx * 0.95, H * 0.034, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 26; i++) { // tufts of grass around the base
      const x = cx + (r() - 0.5) * rx * 1.7, hgt = rr(r, H * 0.018, H * 0.05), lean = (r() - 0.5) * 6;
      ctx.strokeStyle = rgb(mix(st.leaves[0], st.leaves[1], r()), 0.9); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x, gy + 3); ctx.quadraticCurveTo(x + lean * 0.4, gy - hgt * 0.5, x + lean, gy - hgt); ctx.stroke();
    }
    ctx.restore();
  }

  function seedling(ctx, W, H, gy, a, st, t) {
    const cx = W / 2, h = H * 0.12 * a, sway = Math.sin(t * 1.4) * 1.2;
    ctx.strokeStyle = rgb(mix(st.leaves[1], [255, 255, 200], 0.15)); ctx.lineWidth = Math.max(1.4, H * 0.012); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, gy); ctx.quadraticCurveTo(cx + sway, gy - h * 0.5, cx + sway * 1.5, gy - h); ctx.stroke();
    for (const sd of [-1, 1]) {
      const g0 = ctx.createRadialGradient(cx + sd * h * 0.4, gy - h, 0, cx + sd * h * 0.4, gy - h, h * 0.55);
      g0.addColorStop(0, rgb(st.leaves[2])); g0.addColorStop(1, rgb(st.leaves[0]));
      ctx.fillStyle = g0; ctx.beginPath(); ctx.ellipse(cx + sd * h * 0.42 + sway, gy - h, h * 0.42, h * 0.2, sd * -0.5, 0, TAU); ctx.fill();
    }
  }

  /* ---------- broadleaf trees: branching skeleton + shaded leaf clusters ---------- */
  function drawBroad(ctx, W, H, o, st) {
    const g = o.g, gy = H * 0.92, cx = W / 2, t = o.t || 0, wind = o.wind || 0, dpr = o.dpr || 1, kind = o.kind;
    const gt = clamp((g - 0.06) / 0.94, 0, 1), root = skeleton(kind, o.seed, st);
    const treeH = H * 0.5 * (0.2 + 0.8 * smooth(Math.pow(gt, 0.85))), trunkLen = treeH * 0.42, detail = clamp(o.detail == null ? 1 : o.detail, 0.25, 1);
    const lg = smooth((gt - 0.28) / 0.62), leafShape = st.maple ? 'maple' : 'broad';
    const sprites = st.leaves.map(c => leafSprite(c, leafShape));
    const leaves = [[], [], []], tips = [], r = rng(o.seed + 101);
    const canopyCx = cx, canopyCy = gy - treeH * 0.85, canopyR = treeH * 0.7;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';

    const rec = (n, x, y, ang, len) => {
      const vis = smooth((gt - n.d * 0.1 - 0.02) / 0.22); if (vis <= 0.002) return;
      const L = len * vis;
      const sway = (wind * (0.012 + n.d * 0.012) * Math.sin(t * 1.25 + n.id * 0.9) + wind * 0.01 * Math.sin(t * 0.6 + n.d)) ;
      const a = ang + sway, ex = x + Math.sin(a) * L, ey = y - Math.cos(a) * L;
      const mx = (x + ex) / 2 + Math.cos(a) * n.bend * L, my = (y + ey) / 2 + Math.sin(a) * n.bend * L;
      const wd = Math.max(0.9, H * 0.05 * n.w * (0.35 + 0.65 * smooth(gt * 1.3)));
      if (n.d === 0) {
        // tapered trunk with root flare and bark furrows
        const w0 = wd * 1.0, w1 = wd * 0.62;
        const lgr = ctx.createLinearGradient(x - w0, 0, x + w0, 0);
        lgr.addColorStop(0, rgb(mix(st.trunk, [0, 0, 0], 0.4))); lgr.addColorStop(0.55, rgb(st.trunk)); lgr.addColorStop(1, rgb(mix(st.trunk, [255, 230, 190], 0.22)));
        ctx.fillStyle = lgr; ctx.beginPath();
        ctx.moveTo(x - w0 * 1.9, gy + 2); ctx.quadraticCurveTo(x - w0 * 0.75, y - L * 0.08, x - w1 * 0.55 + (mx - (x + ex) / 2), my);
        ctx.lineTo(ex - w1 * 0.5, ey); ctx.lineTo(ex + w1 * 0.5, ey);
        ctx.lineTo(x + w1 * 0.55 + (mx - (x + ex) / 2), my); ctx.quadraticCurveTo(x + w0 * 0.75, y - L * 0.08, x + w0 * 1.9, gy + 2); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,.22)'; ctx.lineWidth = Math.max(0.8, wd * 0.06);
        for (let k = 0; k < 6; k++) { const u = (k / 5 - 0.5) * 1.6; ctx.beginPath(); ctx.moveTo(x + u * w0, gy); ctx.quadraticCurveTo(x + u * w0 * 0.85 + (mx - x), my, ex + u * w1 * 0.8, ey + L * 0.05); ctx.stroke(); }
      } else {
        ctx.strokeStyle = rgb(mix(st.trunk, [30, 20, 14], clamp(n.d * 0.07, 0, 0.35))); ctx.lineWidth = wd;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(mx, my, ex, ey); ctx.stroke();
        if (wd > 3) { ctx.strokeStyle = rgb(mix(st.trunk, [255, 230, 190], 0.18), 0.5); ctx.lineWidth = wd * 0.28; ctx.beginPath(); ctx.moveTo(x + wd * 0.18, y); ctx.quadraticCurveTo(mx + wd * 0.18, my, ex + wd * 0.18, ey); ctx.stroke(); }
      }
      const pt = tt => [(1 - tt) * (1 - tt) * x + 2 * (1 - tt) * tt * mx + tt * tt * ex, (1 - tt) * (1 - tt) * y + 2 * (1 - tt) * tt * my + tt * tt * ey];
      const tan = tt => Math.atan2(2 * (1 - tt) * (mx - x) + 2 * tt * (ex - mx), -(2 * (1 - tt) * (my - y) + 2 * tt * (ey - my)));
      for (const k of n.kids) { const [px, py] = pt(k.at); rec(k, px, py, tan(k.at) + k.a, L * k.len); }
      if (n.leaf && lg > 0.02) tips.push({ x: ex, y: ey, n: n.leaf * lg * vis, rad: L * 0.8 + H * 0.045 });
    };
    rec(root, cx, gy, (r() - 0.5) * 0.03, trunkLen);

    // a dark mass behind the leaves gives the canopy body (no see-through gaps)
    if (tips.length) {
      ctx.fillStyle = rgb(mix(st.leaves[0], [0, 0, 0], 0.32), 0.95);
      for (const tp of tips) { ctx.beginPath(); ctx.arc(tp.x, tp.y, tp.rad * 0.78 * lg, 0, TAU); ctx.fill(); }
    }
    // leaves: dark ones first, then lit ones on top, so the canopy is shaded from inside to outside
    // a fixed leaf budget keeps drawing cheap; fewer, larger leaves cover the same canopy
    const budget = Math.round(3000 * detail * Math.max(0.15, lg)), per = tips.length ? Math.max(2, Math.round(budget / tips.length)) : 0;
    const bigger = clamp(Math.sqrt((29 * detail) / Math.max(1, per)), 1, 2.4);
    const sz = H * 0.04 * st.size * (1 + (1 - detail) * 0.35) * bigger;
    for (const tp of tips) {
      const cnt = Math.min(per, Math.round(tp.n * 4.5 * detail) + 1);
      for (let i = 0; i < cnt; i++) {
        const ang = r() * TAU, rd = Math.sqrt(r()) * tp.rad, lx = tp.x + Math.cos(ang) * rd, ly = tp.y + Math.sin(ang) * rd * 0.8;
        const lf = clamp(0.46 + ((lx - canopyCx) * 0.5 - (ly - canopyCy) * 0.85) / (canopyR * 1.3) + (r() - 0.5) * 0.45, 0, 0.999);
        leaves[Math.floor(lf * 3)].push(lx, ly, r() * TAU, sz * rr(r, 0.75, 1.3) * (0.4 + 0.6 * lg), (r() - 0.5) * 0.7 + (wind ? wind * 0.3 * Math.sin(t * 1.6 + lx * 0.04) : 0));
      }
    }
    ctx.save();
    for (let tone = 0; tone < 3; tone++) {
      const arr = leaves[tone], sp = sprites[tone];
      for (let i = 0; i < arr.length; i += 5) {
        const a = arr[i + 2] + arr[i + 4], s = arr[i + 3], ca = Math.cos(a) * s / 40, sa = Math.sin(a) * s / 40;
        ctx.setTransform(ca * dpr, sa * dpr, -sa * dpr, ca * dpr, arr[i] * dpr, arr[i + 1] * dpr);
        ctx.drawImage(sp, -20, -20);
      }
    }
    ctx.restore();
    if (st.glow) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; for (const tp of tips) { const gr = ctx.createRadialGradient(tp.x, tp.y, 0, tp.x, tp.y, tp.rad * 0.9); gr.addColorStop(0, 'rgba(90,255,240,.07)'); gr.addColorStop(1, 'rgba(90,255,240,0)'); ctx.fillStyle = gr; ctx.fillRect(tp.x - tp.rad, tp.y - tp.rad, tp.rad * 2, tp.rad * 2); } ctx.restore(); }
    if ((st.petals || st.flowers) && lg > 0.4) { // blossoms scattered over the lit side of the canopy
      const pr = rng(o.seed + 303), cols = st.flowers || [[255, 236, 242], [255, 214, 228]], n = Math.round(80 * lg);
      for (let i = 0; i < n; i++) {
        const tp = tips[Math.floor(pr() * tips.length)]; if (!tp) break;
        const fx = tp.x + (pr() - 0.5) * tp.rad * 1.4, fy = tp.y + (pr() - 0.5) * tp.rad, fs = H * 0.012 * (0.7 + pr()), c = cols[i % cols.length];
        for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + pr(); ctx.fillStyle = rgb(c, 0.95); ctx.beginPath(); ctx.arc(fx + Math.cos(a) * fs, fy + Math.sin(a) * fs, fs * 0.75, 0, TAU); ctx.fill(); }
        ctx.fillStyle = 'rgba(255,214,90,.95)'; ctx.beginPath(); ctx.arc(fx, fy, fs * 0.4, 0, TAU); ctx.fill();
      }
    }
    // soft sunlight from the upper right over the whole canopy
    if (tips.length && lg > 0.1) { ctx.save(); ctx.globalCompositeOperation = 'source-atop'; const sl = ctx.createRadialGradient(canopyCx + canopyR * 0.5, canopyCy - canopyR * 0.6, 0, canopyCx + canopyR * 0.5, canopyCy - canopyR * 0.6, canopyR * 1.4); sl.addColorStop(0, 'rgba(255,240,180,.22)'); sl.addColorStop(1, 'rgba(255,240,180,0)'); ctx.fillStyle = sl; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  }

  /* ---------- conifer: whorls of drooping branches that fill in from the top down ---------- */
  function drawConifer(ctx, W, H, o, st) {
    const g = o.g, gy = H * 0.92, cx = W / 2, t = o.t || 0, wind = o.wind || 0, gt = clamp((g - 0.06) / 0.94, 0, 1), r = rng(o.seed + 17);
    const hgt = H * 0.84 * (0.16 + 0.84 * smooth(Math.pow(gt, 0.85))), tiers = Math.round(4 + 12 * smooth(gt)), w0 = hgt * 0.27 * (0.45 + 0.55 * smooth(gt));
    const lean = (r() - 0.5) * hgt * 0.04 + Math.sin(t * 0.9) * wind * hgt * 0.01;
    ctx.fillStyle = rgb(st.trunk); ctx.fillRect(cx - hgt * 0.016, gy - hgt * 0.2, hgt * 0.032, hgt * 0.2 + 2);
    const dark = st.leaves[0], mid = st.leaves[1], lite = st.leaves[2];
    ctx.beginPath(); ctx.moveTo(cx + lean, gy - hgt); ctx.lineTo(cx - w0 * 0.42, gy - hgt * 0.16); ctx.lineTo(cx + w0 * 0.42, gy - hgt * 0.16); ctx.closePath(); ctx.fillStyle = rgb(dark); ctx.fill();
    for (let i = 0; i < tiers; i++) {
      const k = i / (tiers - 1 || 1), yT = gy - hgt * 0.97 + k * hgt * 0.8, cxk = cx + lean * (1 - k), local = smooth((gt * 1.1 - 0.02 - k * 0.55) / 0.3);
      for (const sd of [-1, 1]) {
        const wi = w0 * (0.12 + 0.88 * Math.pow(k, 0.85)) * rr(r, 0.82, 1.2) * Math.max(0.15, local), sway = Math.sin(t * 1.3 + i * 0.7 + sd) * wind * wi * 0.04, dr = hgt * 0.058 * (0.5 + k) * rr(r, 0.8, 1.2);
        const tx = cxk + sd * wi + sway, ty = yT + dr * local;
        ctx.fillStyle = rgb(sd > 0 ? mix(mid, lite, 0.2 + 0.4 * k) : mix(dark, mid, 0.3 + 0.3 * k));
        ctx.beginPath(); ctx.moveTo(cxk, yT - hgt * 0.04); ctx.quadraticCurveTo(cxk + sd * wi * 0.55, yT - hgt * 0.02 + dr * 0.2, tx, ty);
        ctx.lineTo(tx - sd * wi * 0.1, ty + hgt * 0.016); ctx.lineTo(cxk + sd * wi * 0.7, ty - dr * 0.2 + hgt * 0.02); ctx.lineTo(cxk + sd * wi * 0.4, ty - dr * 0.05 + hgt * 0.03); ctx.lineTo(cxk + sd * wi * 0.16, yT + dr * 0.6 * local + hgt * 0.024); ctx.lineTo(cxk, yT + hgt * 0.05); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = rgb(lite, sd > 0 ? 0.55 : 0.25); ctx.lineWidth = Math.max(0.8, hgt * 0.004); ctx.beginPath(); ctx.moveTo(cxk, yT - hgt * 0.035); ctx.quadraticCurveTo(cxk + sd * wi * 0.55, yT - hgt * 0.018 + dr * 0.18, tx, ty); ctx.stroke();
        for (let n = 0; n < 5; n++) { const q = 0.35 + n * 0.14; ctx.strokeStyle = rgb(mix(mid, lite, 0.4), 0.6); ctx.lineWidth = 0.9; const px = cxk + sd * wi * q, py = yT + dr * q * q * local; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + sd * 3, py + hgt * 0.022); ctx.stroke(); }
      }
    }
  }

  function drawPalm(ctx, W, H, o, st) {
    const g = o.g, gy = H * 0.92, cx = W / 2, t = o.t || 0, wind = o.wind || 0, gt = clamp((g - 0.06) / 0.94, 0, 1), r = rng(o.seed + 31);
    const hgt = H * 0.66 * (0.15 + 0.85 * smooth(gt)), lean = hgt * 0.2 * ((o.seed % 2) ? 1 : -1), top = [cx + lean, gy - hgt];
    ctx.lineCap = 'round';
    for (let i = 0; i < 22; i++) { const u = i / 22, u2 = (i + 1) / 22, x1 = cx + lean * u * u, y1 = gy - hgt * u, x2 = cx + lean * u2 * u2, y2 = gy - hgt * u2, w = hgt * (0.055 - 0.03 * u); ctx.strokeStyle = rgb(mix(st.trunk, [60, 40, 22], i % 2 ? 0.28 : 0.05)); ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
    const fr = Math.round(2 + 7 * smooth(gt)), sz = hgt * 0.62 * smooth((gt - 0.1) / 0.5);
    for (let i = 0; i < fr; i++) {
      const base = -2.5 + (i / Math.max(1, fr - 1)) * 5, a = base + Math.sin(t * 1.1 + i) * wind * 0.05, len = sz * rr(r, 0.8, 1.1);
      const ex = top[0] + Math.sin(a) * len * 0.9, ey = top[1] - Math.cos(a) * len * 0.5 + len * 0.35 * Math.abs(Math.sin(a)), cx2 = top[0] + Math.sin(a) * len * 0.5, cy2 = top[1] - len * 0.5;
      ctx.strokeStyle = rgb(st.leaves[0]); ctx.lineWidth = Math.max(1.5, hgt * 0.012); ctx.beginPath(); ctx.moveTo(top[0], top[1]); ctx.quadraticCurveTo(cx2, cy2, ex, ey); ctx.stroke();
      for (let j = 1; j < 11; j++) {
        const q = j / 11, px = (1 - q) * (1 - q) * top[0] + 2 * (1 - q) * q * cx2 + q * q * ex, py = (1 - q) * (1 - q) * top[1] + 2 * (1 - q) * q * cy2 + q * q * ey, ll = len * 0.2 * (1 - q * 0.6);
        ctx.strokeStyle = rgb(mix(st.leaves[1], st.leaves[2], q)); ctx.lineWidth = Math.max(1, hgt * 0.007);
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - Math.cos(a) * ll * 0.4, py + ll); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * ll * 0.4 + ll * 0.25, py + ll * 0.9); ctx.stroke();
      }
    }
    if (gt > 0.55) { ctx.fillStyle = 'rgb(96,64,30)'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(top[0] + (k - 1) * hgt * 0.028, top[1] + hgt * 0.03, hgt * 0.024, 0, TAU); ctx.fill(); } }
  }

  function drawBamboo(ctx, W, H, o, st) {
    const g = o.g, gy = H * 0.92, cx = W / 2, t = o.t || 0, wind = o.wind || 0, gt = clamp((g - 0.06) / 0.94, 0, 1), r = rng(o.seed + 47), n = Math.round(1 + 4 * smooth(gt));
    ctx.lineCap = 'round';
    for (let s = 0; s < n; s++) {
      const x0 = cx + (s - (n - 1) / 2) * W * 0.09, h = H * rr(r, 0.62, 0.8) * (0.15 + 0.85 * smooth(gt - s * 0.04)), sw = Math.sin(t * 1 + s) * wind * h * 0.015, wd = Math.max(2, H * 0.026 * (1 - s * 0.05));
      const lgr = ctx.createLinearGradient(x0 - wd, 0, x0 + wd, 0); lgr.addColorStop(0, rgb(mix(st.trunk, [0, 0, 0], 0.3))); lgr.addColorStop(0.5, rgb(st.trunk)); lgr.addColorStop(1, rgb(mix(st.trunk, [255, 255, 200], 0.3)));
      ctx.strokeStyle = lgr; ctx.lineWidth = wd; ctx.beginPath(); ctx.moveTo(x0, gy); ctx.quadraticCurveTo(x0 + sw * 0.4, gy - h * 0.5, x0 + sw, gy - h); ctx.stroke();
      const nodes = 7; for (let k = 1; k <= nodes; k++) { const q = k / (nodes + 1), px = x0 + sw * q * q, py = gy - h * q; ctx.strokeStyle = rgb(mix(st.trunk, [0, 0, 0], 0.45)); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(px - wd * 0.6, py); ctx.lineTo(px + wd * 0.6, py); ctx.stroke(); if (q > 0.45 && gt > 0.25) { for (const sd of [-1, 1]) { const ll = H * 0.1 * smooth((gt - 0.2) / 0.5); ctx.strokeStyle = rgb(mix(st.leaves[1], st.leaves[2], r())); ctx.lineWidth = Math.max(1.6, H * 0.012); ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + sd * ll * 0.6, py - ll * 0.2, px + sd * ll, py + ll * 0.25 + Math.sin(t * 1.5 + k + s) * wind * 2); ctx.stroke(); } } }
    }
  }

  function drawCactus(ctx, W, H, o, st) {
    const g = o.g, gy = H * 0.92, cx = W / 2, gt = clamp((g - 0.06) / 0.94, 0, 1), body = H * 0.62 * (0.18 + 0.82 * smooth(gt)), bw = H * 0.1 * (0.5 + 0.5 * smooth(gt));
    const limb = (x, y, w, h, up) => { const lg = ctx.createLinearGradient(x - w, 0, x + w, 0); lg.addColorStop(0, rgb(mix(st.leaves[0], [0, 0, 0], 0.2))); lg.addColorStop(0.5, rgb(st.leaves[1])); lg.addColorStop(1, rgb(st.leaves[2])); ctx.fillStyle = lg; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - w / 2, up ? y - h : y, w, h, w / 2) : ctx.rect(x - w / 2, up ? y - h : y, w, h); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1; for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x + k * w * 0.22, up ? y - h + w * 0.4 : y + w * 0.4); ctx.lineTo(x + k * w * 0.22, up ? y - w * 0.3 : y + h - w * 0.3); ctx.stroke(); } };
    limb(cx, gy, bw, body, true);
    if (gt > 0.35) { const s = smooth((gt - 0.35) / 0.4); limb(cx - bw * 1.4, gy - body * 0.42, bw * 0.62, body * 0.32 * s, true); ctx.fillStyle = rgb(st.leaves[1]); ctx.fillRect(cx - bw * 1.4, gy - body * 0.42 - bw * 0.2, bw * 1.2, bw * 0.55 * s); limb(cx + bw * 1.4, gy - body * 0.58, bw * 0.62, body * 0.28 * s, true); ctx.fillRect(cx + bw * 0.2, gy - body * 0.58 - bw * 0.2, bw * 1.2, bw * 0.55 * s); }
    if (gt > 0.8) { ctx.fillStyle = 'rgb(246,106,154)'; ctx.beginPath(); ctx.arc(cx, gy - body - bw * 0.1, bw * 0.3, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgb(255,216,74)'; ctx.beginPath(); ctx.arc(cx, gy - body - bw * 0.1, bw * 0.12, 0, TAU); ctx.fill(); }
  }

  function drawBush(ctx, W, H, o, st) {
    const g = o.g, gy = H * 0.92, cx = W / 2, t = o.t || 0, wind = o.wind || 0, gt = clamp((g - 0.06) / 0.94, 0, 1), r = rng(o.seed + 61), n = Math.round(3 + 10 * smooth(gt));
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const u = n === 1 ? 0.5 : i / (n - 1), a = -1.2 + u * 2.4 + Math.sin(t * 1.2 + i) * wind * 0.05, len = H * (0.28 + 0.2 * Math.cos((u - 0.5) * 2.4)) * (0.2 + 0.8 * smooth(gt)) * rr(r, 0.85, 1.1);
      const ex = cx + Math.sin(a) * len, ey = gy - Math.cos(a) * len, qx = cx + Math.sin(a) * len * 0.45, qy = gy - Math.cos(a) * len * 0.85;
      ctx.strokeStyle = rgb(mix(st.leaves[0], st.leaves[1], u)); ctx.lineWidth = Math.max(1.6, H * 0.014); ctx.beginPath(); ctx.moveTo(cx, gy); ctx.quadraticCurveTo(qx, qy, ex, ey); ctx.stroke();
      for (let j = 1; j < 9; j++) { const q = j / 9, px = (1 - q) * (1 - q) * cx + 2 * (1 - q) * q * qx + q * q * ex, py = (1 - q) * (1 - q) * gy + 2 * (1 - q) * q * qy + q * q * ey, ll = H * 0.07 * (1 - q * 0.55); ctx.strokeStyle = rgb(mix(st.leaves[1], st.leaves[2], q)); ctx.lineWidth = Math.max(1, H * 0.008); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - Math.cos(a) * ll, py - Math.sin(a) * ll * 0.6 + ll * 0.2); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * ll, py + Math.sin(a) * ll * 0.6 + ll * 0.2); ctx.stroke(); }
    }
  }

  const FORMS = { broad: drawBroad, conifer: drawConifer, palm: drawPalm, bamboo: drawBamboo, cactus: drawCactus, bush: drawBush };

  function draw(ctx, W, H, o) {
    o = Object.assign({ kind: 'oak', g: 1, seed: 1, t: 0, wind: 0, dpr: 1, detail: clamp(W / 240, 0.35, 1) }, o);
    const st = STYLES[o.kind] || STYLES.oak, g = clamp(o.g, 0, 1), gy = H * 0.92;
    ctx.save();
    ground(ctx, W, H, gy, g, st, o.seed);
    if (g < 0.06) { ctx.restore(); if (g > 0) { ctx.save(); seedling(ctx, W, H, gy, g / 0.06 * 0.5 + 0.1, st, o.t || 0); ctx.restore(); } return; }
    if (g < 0.16) { ctx.save(); seedling(ctx, W, H, gy, 0.6 + (1 - (g - 0.06) / 0.1) * 0.4, st, o.t || 0); ctx.restore(); }
    (FORMS[st.form] || drawBroad)(ctx, W, H, Object.assign({}, o, { g }), st);
    if (g >= 0.999 && o.crown) { // the finished tree gets a warm glow
      ctx.globalCompositeOperation = 'lighter'; const rad = Math.min(W * 0.48, H * 0.55), gr = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, rad); gr.addColorStop(0, 'rgba(255,214,120,.16)'); gr.addColorStop(1, 'rgba(255,214,120,0)'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  function canvas(W, H, o) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), c = document.createElement('canvas');
    c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
    const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
    draw(ctx, W, H, Object.assign({}, o, { dpr }));
    c._w = W; c._h = H; return c;
  }

  // keeps a canvas alive: gentle wind plus whatever growth getOpts() reports
  function mount(cv, getOpts, o) {
    o = o || {}; const dpr = Math.min(window.devicePixelRatio || 1, 2); let raf = 0, last = 0, stopped = false;
    const W = o.W || parseInt(cv.getAttribute('width'), 10) || 200, H = o.H || parseInt(cv.getAttribute('height'), 10) || 260;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const ctx = cv.getContext('2d'), reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const frame = ts => {
      if (stopped) return;
      raf = requestAnimationFrame(frame);
      if (!cv.isConnected) { stop(); return; }
      if (document.hidden || ts - last < 33) return; last = ts;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      const opts = getOpts();
      draw(ctx, W, H, Object.assign({}, opts, { t: ts / 1000, wind: reduce ? 0 : (opts.wind == null ? 0.55 : opts.wind), dpr }));
    };
    function stop() { stopped = true; cancelAnimationFrame(raf); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); draw(ctx, W, H, Object.assign({}, getOpts(), { dpr }));
    if (!reduce) raf = requestAnimationFrame(frame);
    return { stop };
  }

  window.TreeGrow = { draw, canvas, mount, KINDS: Object.keys(STYLES) };
})();
