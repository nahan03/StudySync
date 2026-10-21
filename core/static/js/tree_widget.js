/* ═══════════════════════════════════════════════════════════
   STUDY TREE WIDGET — shared across all study mode pages
   window.StudyTree.update(n, subject)
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  if (!document.getElementById('st-toggle')) return;

  // Each mode gets its own session storage key and a guaranteed-unique species
  const widgetEl  = document.getElementById('study-tree-widget');
  const PAGE_MODE = widgetEl ? (widgetEl.dataset.mode || 'daily') : 'daily';
  const SESSION_TREE_KEY = 'studySyncTree_' + PAGE_MODE;

  let MAX_SESSIONS = 5;

  function getStageLabels() {
    if (MAX_SESSIONS === 5) {
      return ['Seedling','Sprout','Sapling','Young Tree','Grown Tree','Full Canopy'];
    }
    const labels = ['Seedling'];
    for (let i = 1; i < MAX_SESSIONS; i++) labels.push(`${i}/${MAX_SESSIONS}`);
    labels.push('Complete!');
    return labels;
  }

  function getStageMessages() {
    if (MAX_SESSIONS === 5) {
      return [
        'Start a session to grow your tree.',
        'A tiny sprout! Keep going. 🌱',
        'Two sessions done — looking good!',
        'Halfway there. Your tree is thriving. 🌿',
        'Almost a full canopy!',
        '🎉 All complete! Full bloom!'
      ];
    }
    const msgs = ['Start a session to grow your tree.'];
    for (let i = 1; i < MAX_SESSIONS; i++) {
      if (i === 1) msgs.push('First done — sprout appears! 🌱');
      else if (i === MAX_SESSIONS - 1) msgs.push('Almost there! One more to go.');
      else msgs.push(`${i}/${MAX_SESSIONS} complete!`);
    }
    msgs.push('🎉 All complete! Great work! 🌳');
    return msgs;
  }

  let sessionsDone  = 0;
  let subject       = 'Study';
  let expanded      = false;
  let burstActive   = false;
  let burstParticles = [];
  let burstRaf      = null;

  const toggleBtn    = document.getElementById('st-toggle');
  const panel        = document.getElementById('st-panel');
  const mainCanvas   = document.getElementById('st-main-canvas');
  const miniCanvas   = document.getElementById('st-mini-canvas');
  // Canvases replaced by SVG divs in daily mode — daily_mode.js handles rendering
  if (!mainCanvas || !miniCanvas) return;

  const burstCanvas  = document.getElementById('st-burst-canvas');
  const stageLabel   = document.getElementById('st-stage-label');
  const msgEl        = document.getElementById('st-message');
  const pillSessions = document.getElementById('st-pill-sessions');
  const pillMax      = document.getElementById('st-pill-max');
  const pillSubject  = document.getElementById('st-pill-subject');
  const panelSubject = document.getElementById('st-panel-subject');
  const pipsEl       = document.querySelector('.st-pips');
  let pips           = document.querySelectorAll('.st-pip');

  const mainCtx  = mainCanvas.getContext('2d');
  const miniCtx  = miniCanvas.getContext('2d');
  const burstCtx = burstCanvas ? burstCanvas.getContext('2d') : null;

  // Restore persisted session count for this mode
  (function loadPersistedCount() {
    try {
      const saved = JSON.parse(localStorage.getItem(SESSION_TREE_KEY) || '{}');
      if (saved.date === new Date().toDateString() && saved.count > 0) {
        sessionsDone = Math.min(MAX_SESSIONS, saved.count);
      }
    } catch(e) {}
  })();

  toggleBtn.addEventListener('click', () => {
    expanded = !expanded;
    panel.hidden = !expanded;
    toggleBtn.setAttribute('aria-expanded', String(expanded));
    if (expanded) drawMain();
  });

  // Subject-keyed species (daily mode uses subject to pick)
  const TREE_SPECIES = {
    math:       { name: 'Austrian Pine',   type: 'conifer',   bark: ['#2A1808','#4A3018'], leaves: ['#0A2A08','#163C10','#1E4C14'], fact: 'Pine needles are arranged in spirals following the Fibonacci sequence — a perfect mathematical pattern woven into nature.' },
    maths:      { name: 'Austrian Pine',   type: 'conifer',   bark: ['#2A1808','#4A3018'], leaves: ['#0A2A08','#163C10','#1E4C14'], fact: 'Pine needles are arranged in spirals following the Fibonacci sequence — a perfect mathematical pattern woven into nature.' },
    science:    { name: 'Giant Sequoia',   type: 'conifer',   bark: ['#7A3A1A','#9A5230'], leaves: ['#0C3010','#1A4A18','#246020'], fact: 'Giant Sequoias are the largest organisms on Earth by volume. One mature tree can contain enough wood to build 35 houses.' },
    physics:    { name: 'Giant Sequoia',   type: 'conifer',   bark: ['#7A3A1A','#9A5230'], leaves: ['#0C3010','#1A4A18','#246020'], fact: 'Giant Sequoias are the largest organisms on Earth by volume.' },
    history:    { name: 'Ancient Olive',   type: 'gnarled',   bark: ['#7A7038','#9A9050'], leaves: ['#5A7030','#6E8840','#8AA850'], fact: 'Olive trees in the Mediterranean can live for over 2,000 years — silent witnesses to ancient civilisations, wars, and empires.' },
    literature: { name: 'Cherry Blossom',  type: 'deciduous', bark: ['#7A4A30','#A06848'], leaves: ['#CC7080','#E090A0','#F0B0C0'], fact: 'In Japan, cherry blossom (Sakura) season lasts only 1–2 weeks each spring, symbolising the fleeting beauty of life.' },
    english:    { name: 'Cherry Blossom',  type: 'deciduous', bark: ['#7A4A30','#A06848'], leaves: ['#CC7080','#E090A0','#F0B0C0'], fact: 'In Japan, cherry blossom season lasts only 1–2 weeks, symbolising the fleeting beauty of life.' },
    default:    { name: 'English Oak',     type: 'deciduous', bark: ['#5C3D1A','#7A5530'], leaves: ['#2E5010','#3E6A1A','#4E7A34'], fact: 'A single English Oak can support over 500 species of wildlife — more biodiversity than almost any other native tree on Earth.' },
  };

  // Mode-locked species — exam gets Japanese Maple, custom gets Weeping Willow
  // These are unique trees not used by any subject key above
  const MODE_SPECIES = {
    exam:   { name: 'Japanese Maple',   type: 'deciduous', bark: ['#4A1A1A','#6A3030'], leaves: ['#8B1A2A','#B83050','#D05070'], fact: 'Japanese Maples turn brilliant red and orange in autumn — the brighter the stress of changing seasons, the more vivid the display.' },
    custom: { name: 'Weeping Willow',   type: 'gnarled',   bark: ['#4A4A1A','#6A6A30'], leaves: ['#4A6A20','#6A8A30','#8AAA40'], fact: 'Weeping Willows grow faster than almost any other tree — up to 2.4 m per year — thriving near water and adapting to any challenge.' },
  };

  function getSpecies() {
    // exam and custom always use their locked species, regardless of subject
    if (PAGE_MODE === 'exam')   return MODE_SPECIES.exam;
    if (PAGE_MODE === 'custom') return MODE_SPECIES.custom;
    const key = (subject || 'default').toLowerCase().trim();
    return TREE_SPECIES[key] || TREE_SPECIES.default;
  }

  function drawTree(ctx, canvas, n, scale) {
    scale = scale || 1;
    const sp = getSpecies();
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    const baseX = W / 2, groundY = H - 8 * scale;

    ctx.beginPath();
    ctx.ellipse(baseX, groundY, (n > 0 ? 22 : 8)*scale, 4*scale, 0, 0, Math.PI*2);
    const gG = ctx.createRadialGradient(baseX, groundY, 0, baseX, groundY, 22*scale);
    gG.addColorStop(0, 'rgba(80,140,50,0.5)'); gG.addColorStop(1, 'rgba(40,70,30,0)');
    ctx.fillStyle = gG; ctx.fill();

    if (n === 0) {
      ctx.beginPath(); ctx.arc(baseX, groundY - 4*scale, 4*scale, 0, Math.PI*2);
      ctx.fillStyle = sp.bark[0]; ctx.fill();
      ctx.beginPath(); ctx.moveTo(baseX, groundY - 6*scale);
      ctx.lineTo(baseX, groundY - 14*scale);
      ctx.strokeStyle = sp.leaves[0]; ctx.lineWidth = 1.5*scale; ctx.lineCap = 'round';
      ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1;
      return;
    }

    if (n === 1) {
      // Sprout: seed bulb at ground + slender stem + two seed-leaves
      ctx.beginPath();
      ctx.ellipse(baseX, groundY - 5*scale, 6*scale, 5*scale, 0, 0, Math.PI*2);
      ctx.fillStyle = sp.bark[0]; ctx.fill();
      ctx.beginPath();
      ctx.ellipse(baseX - 2*scale, groundY - 7*scale, 2*scale, 1.4*scale, -0.5, 0, Math.PI*2);
      ctx.fillStyle = sp.bark[1]; ctx.globalAlpha = 0.45; ctx.fill(); ctx.globalAlpha = 1;
      // Stem
      ctx.beginPath();
      ctx.moveTo(baseX, groundY - 9*scale);
      ctx.lineTo(baseX, groundY - 42*scale);
      ctx.strokeStyle = sp.leaves[1]; ctx.lineWidth = 2.5*scale; ctx.lineCap = 'round'; ctx.stroke();
      // Two oval seed-leaves (cotyledons)
      [[-14, -38, -0.45], [14, -38, 0.45]].forEach(([dx, dy, angle]) => {
        const lx = baseX + dx*scale, ly = groundY + dy*scale;
        const lG = ctx.createRadialGradient(lx, ly, 0, lx, ly, 13*scale);
        lG.addColorStop(0, sp.leaves[2]); lG.addColorStop(1, sp.leaves[0]);
        ctx.beginPath();
        ctx.ellipse(lx, ly, 11*scale, 6.5*scale, angle, 0, Math.PI*2);
        ctx.fillStyle = lG; ctx.globalAlpha = 0.92; ctx.fill();
      });
      ctx.globalAlpha = 1;
      return;
    }

    const trunkHeights = [0, 28, 48, 66, 82, 96];
    const trunkH  = trunkHeights[n] * scale;
    const trunkTopY = groundY - trunkH;

    if (sp.type === 'conifer') {
      const tW = (3 + n * 0.9) * scale;
      const tG = ctx.createLinearGradient(baseX - tW, 0, baseX + tW, 0);
      tG.addColorStop(0, sp.bark[0]); tG.addColorStop(0.5, sp.bark[1]); tG.addColorStop(1, sp.bark[0]);
      ctx.beginPath();
      ctx.moveTo(baseX - tW/2, groundY); ctx.lineTo(baseX - tW*0.3, trunkTopY);
      ctx.lineTo(baseX + tW*0.3, trunkTopY); ctx.lineTo(baseX + tW/2, groundY);
      ctx.fillStyle = tG; ctx.fill();
      const tiers = n;                          // n=1→1 tier (sprout), n=5→5 tiers (full)
      const topY  = trunkTopY - 10*scale;
      const totalH = groundY - topY;
      const maxW  = 8 + n * 6;                 // n=1→14 px, n=5→38 px — grows with stage
      for (let t = 0; t < tiers; t++) {
        const tierY   = groundY - (totalH * (t + 1) / (tiers + 0.5));
        const tierW   = (maxW - t * 5) * scale;
        const tierTop = tierY - (14 + t * 2) * scale;
        const lG = ctx.createLinearGradient(baseX - tierW, tierY, baseX, tierTop);
        lG.addColorStop(0, sp.leaves[0]); lG.addColorStop(1, sp.leaves[2]);
        ctx.beginPath();
        ctx.moveTo(baseX, tierTop);
        ctx.lineTo(baseX - tierW, tierY + 6*scale);
        ctx.lineTo(baseX + tierW, tierY + 6*scale);
        ctx.closePath();
        ctx.fillStyle = lG; ctx.fill();
        ctx.beginPath();
        ctx.moveTo(baseX - tierW, tierY + 6*scale);
        ctx.lineTo(baseX, tierY + 14*scale);
        ctx.lineTo(baseX + tierW, tierY + 6*scale);
        ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fill();
      }
    } else if (sp.type === 'gnarled') {
      const tW = (5 + n * 1.5) * scale;
      const tG = ctx.createLinearGradient(baseX - tW, 0, baseX + tW, 0);
      tG.addColorStop(0, sp.bark[0]); tG.addColorStop(0.4, sp.bark[1]); tG.addColorStop(1, sp.bark[0]);
      ctx.beginPath();
      ctx.moveTo(baseX - tW*0.6, groundY);
      ctx.bezierCurveTo(baseX - tW*1.1, groundY - trunkH*0.3, baseX + tW*0.3, trunkTopY + trunkH*0.3, baseX - tW*0.1, trunkTopY);
      ctx.bezierCurveTo(baseX + tW*0.8, trunkTopY + trunkH*0.2, baseX + tW*1.2, groundY - trunkH*0.4, baseX + tW*0.6, groundY);
      ctx.fillStyle = tG; ctx.fill();
      ctx.strokeStyle = sp.bark[0]; ctx.lineWidth = 0.8*scale; ctx.globalAlpha = 0.4;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(baseX - tW*0.2, groundY - trunkH*i*0.28);
        ctx.bezierCurveTo(baseX + tW*0.5, groundY - trunkH*i*0.3, baseX - tW*0.3, groundY - trunkH*i*0.5, baseX, trunkTopY + trunkH*(1-i*0.28));
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (n >= 2) {
        const clusters = [[0,-20,28],[-22,-10,18],[22,-8,20],[-10,-42,22],[12,-38,20],[0,-58,18]].slice(0, n+1);
        clusters.forEach(([dx,dy,r]) => {
          const cx = baseX + dx*scale, cy = trunkTopY + dy*scale;
          const lG = ctx.createRadialGradient(cx, cy-r*0.3*scale, r*0.1*scale, cx, cy, r*scale);
          lG.addColorStop(0, sp.leaves[2]); lG.addColorStop(1, sp.leaves[0]);
          ctx.beginPath(); ctx.arc(cx, cy, r*scale, 0, Math.PI*2);
          ctx.fillStyle = lG; ctx.globalAlpha = 0.88; ctx.fill();
        });
        ctx.globalAlpha = 1;
      }
    } else {
      const tW = (5 + n * 1.6) * scale;
      const tG = ctx.createLinearGradient(baseX - tW, 0, baseX + tW, 0);
      tG.addColorStop(0, sp.bark[0]); tG.addColorStop(0.42, sp.bark[1]); tG.addColorStop(1, sp.bark[0]);
      ctx.beginPath();
      ctx.moveTo(baseX - tW*0.5, groundY);
      ctx.bezierCurveTo(baseX - tW*0.85, groundY - trunkH*0.38, baseX - tW*0.4, trunkTopY + trunkH*0.12, baseX, trunkTopY);
      ctx.bezierCurveTo(baseX + tW*0.4, trunkTopY + trunkH*0.12, baseX + tW*0.85, groundY - trunkH*0.38, baseX + tW*0.5, groundY);
      ctx.fillStyle = tG; ctx.fill();
      ctx.strokeStyle = sp.bark[0]; ctx.lineWidth = 0.7*scale; ctx.globalAlpha = 0.3;
      [[0.15,-0.1],[0.4,-0.05],[0.65,-0.08]].forEach(([yf,xo]) => {
        ctx.beginPath(); ctx.moveTo(baseX + xo*tW, groundY - trunkH*yf);
        ctx.lineTo(baseX + (xo+0.12)*tW, groundY - trunkH*(yf+0.14)); ctx.stroke();
      });
      ctx.globalAlpha = 1;
      if (n >= 2) {
        const branchDefs = [[0.12,32,50],[0.38,26,54],[0.62,20,60]];
        const pairsToShow = Math.min(n - 1, branchDefs.length);
        for (let i = 0; i < pairsToShow; i++) {
          const [yF, bLen, aDeg] = branchDefs[i];
          const bY = trunkTopY + trunkH * yF;
          const ang = aDeg * Math.PI / 180;
          const bL  = bLen * scale;
          const bW  = (3.2 - i*0.6) * scale;
          const lTX = baseX - Math.cos(ang)*bL, lTY = bY - Math.sin(ang)*bL;
          const rTX = baseX + Math.cos(ang)*bL, rTY = lTY;
          ctx.beginPath(); ctx.moveTo(baseX, bY);
          ctx.quadraticCurveTo(baseX - Math.cos(ang)*bL*0.45, bY - Math.sin(ang)*bL*0.3, lTX, lTY);
          ctx.strokeStyle = sp.bark[1]; ctx.lineWidth = bW; ctx.lineCap = 'round'; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(baseX, bY);
          ctx.quadraticCurveTo(baseX + Math.cos(ang)*bL*0.45, bY - Math.sin(ang)*bL*0.3, rTX, rTY);
          ctx.stroke();
          drawLeafCluster(ctx, lTX, lTY, (12 - i*2)*scale, sp.leaves);
          drawLeafCluster(ctx, rTX, rTY, (12 - i*2)*scale, sp.leaves);
        }
      }
      if (n >= 5) {
        const cx = baseX, cy = trunkTopY - 18*scale, r = 46*scale;
        ctx.beginPath(); ctx.ellipse(cx+5*scale, cy+8*scale, r*0.92, r*0.7, 0.1, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(10,20,8,0.28)'; ctx.fill();
        const cG = ctx.createRadialGradient(cx, cy - r*0.3, r*0.08, cx, cy, r);
        cG.addColorStop(0, sp.leaves[2]); cG.addColorStop(0.55, sp.leaves[1]); cG.addColorStop(1, sp.leaves[0]);
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.fillStyle = cG; ctx.fill();
        [[-30,10,0.42],[ 28, 6,0.40],[-10,-36,0.38],[18,-28,0.36],[0,22,0.33]].forEach(([dx,dy,sc]) => {
          const sgG = ctx.createRadialGradient(cx+dx*scale, cy+dy*scale, 0, cx+dx*scale, cy+dy*scale, r*sc);
          sgG.addColorStop(0, sp.leaves[2]); sgG.addColorStop(1, sp.leaves[0]);
          ctx.beginPath(); ctx.arc(cx+dx*scale, cy+dy*scale, r*sc, 0, Math.PI*2);
          ctx.fillStyle = sgG; ctx.globalAlpha = 0.72; ctx.fill();
        });
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(cx - 12*scale, cy - 14*scale, 14*scale, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
      }
    }
  }

  /* Mini-tree renderer for small canvases (node pips, pill icon).
     Sizes scale with H. Species-aware: conifers get tiers, deciduous gets
     canopy blobs, gnarled gets a curved trunk.
     n = 0 seed, 1 sprouting, 2–5 grow by species. */
  function paintMiniTree(ctx, W, H, n, sp) {
    ctx.clearRect(0, 0, W, H);
    const cx = W / 2;
    const u  = H / 56;        // scale unit; H=56 → u=1
    const gY = H - 5 * u;    // ground Y

    // Ground glow
    ctx.beginPath();
    ctx.ellipse(cx, gY, W * 0.38, 2.5 * u, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(70,130,40,0.35)';
    ctx.fill();

    // ── Stage 0: seed ──
    if (n <= 0) {
      ctx.beginPath();
      ctx.ellipse(cx, gY - 3.5 * u, 5.5 * u, 4 * u, 0, 0, Math.PI * 2);
      ctx.fillStyle = sp.bark[0]; ctx.fill();
      ctx.beginPath();
      ctx.ellipse(cx - 1.5 * u, gY - 4.8 * u, 2 * u, 1.3 * u, -0.5, 0, Math.PI * 2);
      ctx.fillStyle = sp.bark[1]; ctx.globalAlpha = 0.5; ctx.fill();
      ctx.globalAlpha = 1;
      return;
    }

    // ── Stage 1: sprouting seed (same for all species) ──
    if (n === 1) {
      ctx.beginPath();
      ctx.ellipse(cx, gY - 3.5 * u, 5.5 * u, 4 * u, 0, 0, Math.PI * 2);
      ctx.fillStyle = sp.bark[0]; ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, gY - 6.5 * u);
      ctx.lineTo(cx, gY - 18 * u);
      ctx.strokeStyle = sp.leaves[1]; ctx.lineWidth = 2.2 * u; ctx.lineCap = 'round'; ctx.stroke();
      [[-6.5, -16.5, -0.55], [6.5, -16.5, 0.55]].forEach(([dx, dy, a]) => {
        ctx.beginPath();
        ctx.ellipse(cx + dx * u, gY + dy * u, 5.5 * u, 3 * u, a, 0, Math.PI * 2);
        ctx.fillStyle = sp.leaves[1]; ctx.globalAlpha = 0.9; ctx.fill();
      });
      ctx.globalAlpha = 1;
      return;
    }

    // ── Stages 2–5: species-specific ──
    const trunkHeights = [0, 0, 15, 22, 28, 28]; // in u-units
    const trunkH = trunkHeights[Math.min(n, 5)] * u;
    const tY     = gY - trunkH;
    const tW     = (2 + n * 0.5) * u;

    if (sp.type === 'conifer') {
      // Trunk
      const tG = ctx.createLinearGradient(cx - tW, 0, cx + tW, 0);
      tG.addColorStop(0, sp.bark[0]); tG.addColorStop(0.5, sp.bark[1]); tG.addColorStop(1, sp.bark[0]);
      ctx.beginPath();
      ctx.moveTo(cx - tW * 0.5, gY);
      ctx.lineTo(cx - tW * 0.25, tY);
      ctx.lineTo(cx + tW * 0.25, tY);
      ctx.lineTo(cx + tW * 0.5, gY);
      ctx.fillStyle = tG; ctx.fill();

      // Tiers: n=2→1 tier, n=3→2, n=4→3, n=5→4
      const tierCount = n - 1;
      const apexY     = tY - (8 + tierCount * 2) * u;
      const totalH    = gY - apexY;
      for (let t = 0; t < tierCount; t++) {
        const tierY  = gY - totalH * (t + 1) / (tierCount + 0.6);
        const tierW  = (19 - t * 3) * u;
        const topY   = tierY - (11 + t * 1.5) * u;
        const lG = ctx.createLinearGradient(cx - tierW, tierY, cx, topY);
        lG.addColorStop(0, sp.leaves[0]); lG.addColorStop(1, sp.leaves[2]);
        ctx.beginPath();
        ctx.moveTo(cx, topY);
        ctx.lineTo(cx - tierW, tierY + 4 * u);
        ctx.lineTo(cx + tierW, tierY + 4 * u);
        ctx.closePath();
        ctx.fillStyle = lG; ctx.fill();
        ctx.beginPath();
        ctx.moveTo(cx - tierW, tierY + 4 * u);
        ctx.lineTo(cx, tierY + 8 * u);
        ctx.lineTo(cx + tierW, tierY + 4 * u);
        ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fill();
      }

    } else if (sp.type === 'gnarled') {
      // Curved trunk
      ctx.beginPath();
      ctx.moveTo(cx - tW * 0.6, gY);
      ctx.bezierCurveTo(cx - tW * 1.2, gY - trunkH * 0.3, cx + tW * 0.4, tY + trunkH * 0.3, cx - tW * 0.1, tY);
      ctx.bezierCurveTo(cx + tW * 0.9, tY + trunkH * 0.2, cx + tW * 1.2, gY - trunkH * 0.4, cx + tW * 0.6, gY);
      ctx.fillStyle = sp.bark[0]; ctx.fill();
      // Blob clusters
      const blobs = [[0, -12, 9], [-12, -7, 7.5], [12, -6, 7.5], [-5, -22, 8], [6, -20, 7.5]];
      blobs.slice(0, n).forEach(([dx, dy, r]) => {
        const bx = cx + dx * u, by = tY + dy * u;
        const bG = ctx.createRadialGradient(bx, by - r * 0.3 * u, r * 0.1 * u, bx, by, r * u);
        bG.addColorStop(0, sp.leaves[2]); bG.addColorStop(1, sp.leaves[0]);
        ctx.beginPath(); ctx.arc(bx, by, r * u, 0, Math.PI * 2);
        ctx.fillStyle = bG; ctx.globalAlpha = 0.88; ctx.fill();
      });
      ctx.globalAlpha = 1;

    } else {
      // Deciduous: straight trunk
      const tG = ctx.createLinearGradient(cx - tW, 0, cx + tW, 0);
      tG.addColorStop(0, sp.bark[0]); tG.addColorStop(0.42, sp.bark[1]); tG.addColorStop(1, sp.bark[0]);
      ctx.beginPath();
      ctx.moveTo(cx - tW * 0.5, gY);
      ctx.lineTo(cx - tW * 0.25, tY);
      ctx.lineTo(cx + tW * 0.25, tY);
      ctx.lineTo(cx + tW * 0.5, gY);
      ctx.fillStyle = tG; ctx.fill();

      if (n <= 3) {
        // Young: branch clusters
        const clusters = [[0, -9, 8], [-10, -4, 7], [10, -4, 7], [-6, -18, 6.5], [6, -18, 6.5]];
        clusters.slice(0, n + 1).forEach(([dx, dy, r]) => {
          const bx = cx + dx * u, by = tY + dy * u;
          ctx.beginPath(); ctx.arc(bx, by, r * u, 0, Math.PI * 2);
          ctx.fillStyle = sp.leaves[1]; ctx.globalAlpha = 0.82; ctx.fill();
        });
        ctx.globalAlpha = 1;
      } else {
        // Mature: full gradient canopy
        const cR = 16 * u;
        const cY = tY - 9 * u;
        const cG = ctx.createRadialGradient(cx, cY - cR * 0.3, cR * 0.08, cx, cY, cR);
        cG.addColorStop(0, sp.leaves[2]); cG.addColorStop(0.55, sp.leaves[1]); cG.addColorStop(1, sp.leaves[0]);
        ctx.beginPath(); ctx.arc(cx, cY, cR, 0, Math.PI * 2); ctx.fillStyle = cG; ctx.fill();
        [[-9, 7, 9], [9, 5, 8.5], [0, -12, 9], [-6, -10, 7.5], [6, -9, 7]].forEach(([dx, dy, r]) => {
          ctx.beginPath(); ctx.arc(cx + dx * u, cY + dy * u, r * u, 0, Math.PI * 2);
          ctx.fillStyle = sp.leaves[1]; ctx.globalAlpha = 0.58; ctx.fill();
        });
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(cx - 6 * u, cY - 7 * u, 5.5 * u, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
      }
    }
  }

  function drawLeafCluster(ctx, x, y, r, colors) {
    colors = colors || ['#3E6018','#4E7A34','#68A040'];
    [[0,0,1.0],[-0.48,-0.28,0.74],[0.46,-0.22,0.76],[0.1,-0.62,0.64],[-0.2,0.32,0.55]].forEach(([ox,oy,sc]) => {
      const lG = ctx.createRadialGradient(x+ox*r, y+oy*r, 0, x+ox*r, y+oy*r, r*sc);
      lG.addColorStop(0, colors[2] || colors[1]);
      lG.addColorStop(1, colors[0]);
      ctx.beginPath(); ctx.arc(x+ox*r, y+oy*r, r*sc, 0, Math.PI*2);
      ctx.fillStyle = lG; ctx.globalAlpha = 0.88; ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  function startBurst() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    burstCanvas.style.display = 'block';
    burstParticles = [];
    const cx = burstCanvas.width/2, cy = burstCanvas.height*0.38;
    for (let i = 0; i < 52; i++) {
      const angle = Math.random()*Math.PI*2, speed = 1.4+Math.random()*3;
      burstParticles.push({ x:cx, y:cy, vx:Math.cos(angle)*speed, vy:Math.sin(angle)*speed-1.2,
        r:2.5+Math.random()*4, color:['#6dc44e','#f5c842','#f07d3c','#5aaf3c','#a8e063','#E4B84A'][Math.floor(Math.random()*6)],
        alpha:1, decay:0.014+Math.random()*0.01 });
    }
    burstActive = true;
    if (burstRaf) cancelAnimationFrame(burstRaf);
    animateBurst();
  }

  function animateBurst() {
    burstCtx.clearRect(0,0,burstCanvas.width,burstCanvas.height);
    let alive = false;
    burstParticles.forEach(p => {
      p.x+=p.vx; p.y+=p.vy; p.vy+=0.08; p.vx*=0.98; p.alpha-=p.decay;
      if (p.alpha<=0) return; alive=true;
      burstCtx.beginPath(); burstCtx.arc(p.x,p.y,p.r,0,Math.PI*2);
      burstCtx.fillStyle=p.color; burstCtx.globalAlpha=p.alpha; burstCtx.fill();
    });
    burstCtx.globalAlpha = 1;
    alive ? (burstRaf=requestAnimationFrame(animateBurst)) : (burstCanvas.style.display='none', burstActive=false);
  }

  function drawMain() {
    drawTree(mainCtx, mainCanvas, sessionsDone, 1);
    if (sessionsDone === MAX_SESSIONS && !burstActive) startBurst();
  }
  function drawMini() {
    paintMiniTree(miniCtx, miniCanvas.width, miniCanvas.height, sessionsDone, getSpecies());
  }

  function rebuildPips() {
    if (!pipsEl) return;
    pipsEl.innerHTML = '';
    for (let i = 1; i <= MAX_SESSIONS; i++) {
      const pip = document.createElement('span');
      pip.className = 'st-pip';
      pip.dataset.stage = i;
      pipsEl.appendChild(pip);
    }
    pips = document.querySelectorAll('.st-pip');
  }

  function updateUI(prev) {
    const sp = getSpecies();
    const labels = getStageLabels();
    const messages = getStageMessages();
    pips.forEach((p,i) => p.classList.toggle('active', i < sessionsDone));
    stageLabel.textContent   = labels[sessionsDone] || '';
    msgEl.textContent        = messages[sessionsDone] || '';
    pillSessions.textContent = sessionsDone;
    if (pillMax) pillMax.textContent = MAX_SESSIONS;
    const cap = subject.charAt(0).toUpperCase() + subject.slice(1);
    pillSubject.textContent  = cap;
    panelSubject.textContent = sp.name + ' — ' + cap;
    const factEl     = document.getElementById('st-tree-fact');
    const nameEl     = document.getElementById('st-species-name');
    const factTextEl = document.getElementById('st-species-fact');
    if (factEl && nameEl && factTextEl) {
      nameEl.textContent     = sp.name;
      factTextEl.textContent = sp.fact;
      factEl.classList.toggle('hidden', sessionsDone === 0);
    }
    if (expanded) drawMain();
    drawMini();
    if (prev === 0 && sessionsDone >= 1 && !expanded) {
      expanded = true; panel.hidden = false;
      toggleBtn.setAttribute('aria-expanded','true'); drawMain();
    }
  }

  window.StudyTree = {
    setMaxSessions(max) {
      MAX_SESSIONS = Math.max(1, Math.round(max));
      sessionsDone = Math.min(sessionsDone, MAX_SESSIONS);
      rebuildPips();
      updateUI(sessionsDone);
    },
    update(n, subjectName) {
      const prev = sessionsDone;
      if (subjectName) subject = subjectName;
      sessionsDone = Math.max(0, Math.min(MAX_SESSIONS, Math.round(n)));
      updateUI(prev);
    },
    drawToCanvas(canvas, n) {
      canvas.style.opacity = '0.3';
      requestAnimationFrame(() => {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawTree(ctx, canvas, n, 1);
        canvas.style.opacity = '1';
      });
    },
    drawNodeTree(canvas, n) {
      const ctx = canvas.getContext('2d');
      paintMiniTree(ctx, canvas.width, canvas.height, Math.max(0, Math.min(MAX_SESSIONS, n)), getSpecies());
    },
    get sessions() { return sessionsDone; }
  };

  rebuildPips();
  updateUI(0);
})();
