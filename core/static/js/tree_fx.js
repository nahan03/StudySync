/* Tree growth celebration effects.
 *
 * Works with the shared #tree-growth-overlay used by Daily, Exam and Custom mode.
 * It only observes the DOM, so it needs no changes to the session logic:
 *   - overlay shown            -> aura, light rays and drifting leaves/sparkles start
 *   - #tg-stage text changes   -> tree "pops", a ring ripples out, a small burst
 *   - #tg-fact gets its text   -> the growth animation has finished; if every pip
 *                                 is done the tree is fully grown -> golden confetti
 * Respects prefers-reduced-motion (the effects layer is simply not created).
 */
(function () {
  'use strict';
  if (window.__treeFx) return;
  window.__treeFx = true;

  const reduceMotion = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  let overlay = null, layer = null, ambientTimer = null, stageObs = null, factObs = null;

  function palette() {
    if (overlay && overlay.classList.contains('tgfx-full')) return ['#E4B84A', '#F6D878', '#FFF0B0', '#A8D870', '#7DB54A'];
    return document.body.classList.contains('exam-page')
      ? ['#3AC8B8', '#1A9A8A', '#8FE8DC', '#E8D8A0']
      : ['#7DB54A', '#A8D870', '#4E7A34', '#E4B84A'];
  }

  function treeEl() { return overlay && overlay.querySelector('#tg-tree-svg, #tg-canvas'); }

  function center(el) {
    const o = overlay.getBoundingClientRect();
    const r = (el || overlay.querySelector('.tree-growth-box')).getBoundingClientRect();
    return { x: r.left - o.left + r.width / 2, y: r.top - o.top + r.height / 2 };
  }

  /* ---------- particles (Web Animations API) ---------- */
  function makeParticle(kind) {
    const p = document.createElement('span');
    p.className = 'tgfx-p tgfx-' + kind;
    const c = pick(palette());
    if (kind === 'leaf') {
      const s = rand(7, 13);
      p.style.cssText = `width:${s}px;height:${s * 0.62}px;background:${c};`;
    } else if (kind === 'confetti') {
      const s = rand(5, 9);
      p.style.cssText = `width:${s}px;height:${s * rand(0.4, 1)}px;background:${c};`;
    } else {
      const s = rand(3, 6);
      p.style.cssText = `width:${s}px;height:${s}px;background:${c};box-shadow:0 0 ${s * 2.5}px ${c};`;
    }
    layer.appendChild(p);
    return p;
  }

  function fly(p, x, y, keyframes, duration, easing) {
    p.style.left = x + 'px';
    p.style.top = y + 'px';
    const anim = p.animate(keyframes, { duration, easing: easing || 'linear', fill: 'forwards' });
    anim.onfinish = () => p.remove();
  }

  function ambient() {
    if (!layer || !overlay.isConnected) return stop();
    const w = overlay.clientWidth, h = overlay.clientHeight;
    const kind = Math.random() < 0.55 ? 'spark' : 'leaf';
    const p = makeParticle(kind);
    const dx = rand(-90, 90), rise = rand(h * 0.45, h * 0.85), spin = rand(-260, 260);
    fly(p, rand(0, w), h + 12, [
      { transform: 'translate(0,0) rotate(0deg)', opacity: 0 },
      { transform: `translate(${dx * 0.3}px,${-rise * 0.15}px) rotate(${spin * 0.2}deg)`, opacity: 0.9, offset: 0.15 },
      { transform: `translate(${dx}px,${-rise}px) rotate(${spin}deg)`, opacity: 0 },
    ], rand(5000, 9000));
  }

  function burst(count, cx, cy, opts) {
    if (!layer) return;
    const o = Object.assign({ power: 160, kinds: ['spark', 'leaf'], fall: 0, life: [900, 1500] }, opts);
    for (let i = 0; i < count; i++) {
      const p = makeParticle(pick(o.kinds));
      const ang = rand(0, Math.PI * 2), dist = rand(o.power * 0.35, o.power);
      const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - o.power * 0.25;
      const spin = rand(-540, 540);
      fly(p, cx, cy, [
        { transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px,${dy}px) rotate(${spin * 0.6}deg) scale(1)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx * 1.1}px,${dy + o.fall}px) rotate(${spin}deg) scale(0.5)`, opacity: 0 },
      ], rand(o.life[0], o.life[1]), 'cubic-bezier(.15,.8,.3,1)');
    }
  }

  function ring(cx, cy, delay) {
    if (!layer) return;
    const r = document.createElement('span');
    r.className = 'tgfx-ring';
    r.style.left = cx + 'px';
    r.style.top = cy + 'px';
    if (delay) r.style.animationDelay = delay + 'ms';
    r.addEventListener('animationend', () => r.remove());
    layer.appendChild(r);
  }

  /* ---------- events ---------- */
  function pips() {
    const all = overlay.querySelectorAll('.tree-growth-pip');
    return { total: all.length, done: overlay.querySelectorAll('.tree-growth-pip.done').length };
  }

  function onStage() {
    const t = treeEl();
    if (!t) return;
    if (t.classList.contains('tgfx-pop')) {
      t.classList.remove('tgfx-pop');
      void t.offsetWidth; // restart the animation
    }
    t.classList.add('tgfx-pop');
    const c = center(t);
    ring(c.x, c.y);
    burst(9, c.x, c.y, { power: 120 });
  }

  function onGrowthFinished() {
    const { total, done } = pips();
    const c = center(treeEl());
    if (total && done >= total) {
      if (!overlay.classList.contains('tgfx-full')) overlay.classList.add('tgfx-full');
      ring(c.x, c.y);
      ring(c.x, c.y, 220);
      ring(c.x, c.y, 440);
      burst(70, c.x, c.y, {
        power: Math.min(overlay.clientWidth, 520) * 0.7, kinds: ['confetti', 'confetti', 'spark', 'leaf'],
        fall: 260, life: [1600, 2800],
      });
    } else {
      burst(14, c.x, c.y, { power: 140, kinds: ['spark'] });
    }
  }

  /* ---------- lifecycle ---------- */
  function start(el) {
    stop();
    overlay = el;
    if (reduceMotion()) return;
    // classList.remove() on an absent class still queues a class mutation, which
    // would re-trigger the observer below forever, so always guard these calls.
    if (overlay.classList.contains('tgfx-full')) overlay.classList.remove('tgfx-full');
    const { total, done } = pips();
    overlay.style.setProperty('--tgfx-p', total ? (done / total).toFixed(2) : '0');

    layer = document.createElement('div');
    layer.className = 'tgfx-layer';
    layer.setAttribute('aria-hidden', 'true');
    layer.innerHTML = '<div class="tgfx-rays"></div><div class="tgfx-glow"></div>';
    overlay.insertBefore(layer, overlay.firstChild);

    for (let i = 0; i < 10; i++) setTimeout(() => { if (layer) ambient(); }, i * 160);
    ambientTimer = setInterval(ambient, 420);

    const stageEl = overlay.querySelector('#tg-stage');
    if (stageEl) {
      stageObs = new MutationObserver(onStage);
      stageObs.observe(stageEl, { childList: true, characterData: true, subtree: true });
    }
    const factEl = overlay.querySelector('#tg-fact');
    if (factEl) {
      factObs = new MutationObserver(() => { if (factEl.textContent.trim()) onGrowthFinished(); });
      factObs.observe(factEl, { childList: true, characterData: true, subtree: true });
    }
  }

  function stop() {
    clearInterval(ambientTimer); ambientTimer = null;
    if (stageObs) { stageObs.disconnect(); stageObs = null; }
    if (factObs) { factObs.disconnect(); factObs = null; }
    if (layer) { layer.remove(); layer = null; }
    if (overlay && overlay.classList.contains('tgfx-full')) overlay.classList.remove('tgfx-full');
  }

  /* The overlay is shown by removing its "hidden" class; watch for that. */
  new MutationObserver(muts => {
    for (const m of muts) {
      const el = m.target;
      if (!el || el.id !== 'tree-growth-overlay') continue;
      const hidden = el.classList.contains('hidden');
      if (!hidden && (overlay !== el || !layer)) start(el);
      else if (hidden && overlay === el) stop();
    }
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ['class'] });
})();
