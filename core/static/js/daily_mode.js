ssReady(function () {
  if (!document.getElementById('timer-display')) return; // only run on daily mode page

  /* ── KEYS ── */
  const REFS_KEY     = 'studySyncDailyRefs';
  const STREAK_KEY   = 'studySyncStreak';
  const SESSIONS_KEY = 'studySyncSubjectSessions'; // per-subject: { "math_Mon Jun 23 2026": 3 }
  const TIMER_KEY    = 'studySyncTimerState';

  const $ = id => document.getElementById(id);

  /* ── STATE ── */
  let refs = JSON.parse(localStorage.getItem(REFS_KEY)) || [];

  /* ── CREATE PLAN MODAL ── */
  const _rawPlan = JSON.parse(localStorage.getItem('studySyncActivePlan') || 'null');
  const _planNeedsSetup = !_rawPlan || (_rawPlan.mode && _rawPlan.mode !== 'daily') || !_rawPlan.subject || parseFloat(_rawPlan.hours) <= 0;
  if (_planNeedsSetup) {
    $('cp-overlay').classList.remove('hidden');
  }

  // Close button
  $('cp-close').addEventListener('click', () => {
    $('cp-overlay').classList.add('hidden');
  });

  // Chip selection — always wired so modal works whenever it's opened (first load or Next Session)
  let _selectedMins = 60;
  document.querySelectorAll('.cp-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.cp-chip').forEach(c => c.classList.remove('cp-chip-active'));
      chip.classList.add('cp-chip-active');
      const val = chip.dataset.min;
      if (val === 'custom') {
        $('cp-custom-row').classList.remove('hidden');
        _selectedMins = null;
      } else {
        $('cp-custom-row').classList.add('hidden');
        _selectedMins = parseInt(val);
      }
    });
  });

  // Start button — always registered so it works both on first setup and when opened via Next Session
  $('cp-start-btn').addEventListener('click', () => {
    const subject = $('cp-subject').value.trim();
    if (!subject) { $('cp-error').classList.remove('hidden'); return; }
    $('cp-error').classList.add('hidden');
    let totalMins = _selectedMins;
    if (totalMins === null) {
      const hr  = Math.max(0, parseInt($('cp-hr').value)  || 0);
      const min = Math.max(0, parseInt($('cp-min').value) || 0);
      totalMins = hr * 60 + min;
    }
    const hours = Math.max(0.5, totalMins / 60);
    const newPlan = { mode: 'daily', subject, topic: $('cp-topic').value.trim(), hours };
    localStorage.setItem('studySyncActivePlan', JSON.stringify(newPlan));
    $('cp-overlay').classList.add('hidden');
    location.reload();
  });

  /* ── PLAN ── */
  const _storedPlan = JSON.parse(localStorage.getItem('studySyncActivePlan') || 'null');
  // Only use plan if it's for daily mode (or has no mode — backwards compat with old saves)
  const plan = (_storedPlan && (!_storedPlan.mode || _storedPlan.mode === 'daily')) ? _storedPlan : null;
  const planSubject = (plan?.subject || 'General').toLowerCase();
  const planHours   = Math.max(0.5, parseFloat(plan?.hours) || 0.5); // 30 min minimum

  if (plan) {
    const sub   = plan.subject.charAt(0).toUpperCase() + plan.subject.slice(1);
    const topic = plan.topic ? ` · ${plan.topic}` : '';
    const totalMins = Math.round(planHours * 60);
    const durText = totalMins >= 60
      ? `${Math.floor(totalMins/60)}h${totalMins%60 ? ` ${totalMins%60}m` : ''}`
      : `${totalMins}m`;
    if ($('topbar-subject')) $('topbar-subject').textContent = sub + (topic ? topic : '') + '  ·  ' + durText;
  } else {
    if ($('topbar-subject')) $('topbar-subject').textContent = 'No active plan';
  }

  /* ── STREAK (stored but not displayed here) ── */
  (function updateStreak() {
    const today     = new Date().toDateString();
    const stored    = JSON.parse(localStorage.getItem(STREAK_KEY) || '{"last":"","count":0}');
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    let count = stored.count;
    if (stored.last === today) { /* same day */ }
    else if (stored.last === yesterday) { count += 1; }
    else { count = 1; }
    localStorage.setItem(STREAK_KEY, JSON.stringify({ last: today, count }));
    if ($('summary-streak')) $('summary-streak').textContent = count;
  })();

  /* ── SESSION COUNT (per subject, per day) ── */
  function _sessionDayKey() {
    return planSubject + '_' + new Date().toDateString();
  }

  function loadSessionCount() {
    try {
      const all = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '{}');
      return all[_sessionDayKey()] || 0;
    } catch (_) { return 0; }
  }

  function saveSessionCount(n) {
    try {
      const all = JSON.parse(localStorage.getItem(SESSIONS_KEY) || '{}');
      all[_sessionDayKey()] = n;
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
      // Mirror to the tree widget key so it persists across page refreshes
      localStorage.setItem('studySyncTree_daily', JSON.stringify({ date: new Date().toDateString(), count: n }));
    } catch (_) {}
  }

  let sessionsCompleted = loadSessionCount();

  const _TREE_MESSAGES = [
    'Start a session to grow your tree.',
    'A tiny sprout! Keep going. 🌱',
    'Two sessions done — looking good!',
    'Halfway there. Your tree is thriving. 🌿',
    'Four sessions! Almost a full canopy.',
    '🎉 Full bloom! Start a new cycle to grow another tree.',
  ];
  const _THEME_INFO = {
    oak:    { name: 'English Oak',     fact: 'A single English Oak can support over 500 species of wildlife — more biodiversity than almost any other native tree.' },
    pine:   { name: 'Austrian Pine',   fact: 'Pine needles are arranged in spirals following the Fibonacci sequence — a perfect mathematical pattern woven into nature.' },
    cherry: { name: 'Cherry Blossom',  fact: 'Cherry blossom season lasts only 1–2 weeks each spring, symbolising the fleeting beauty of life and learning.' },
    palm:   { name: 'Coconut Palm',    fact: 'Palms have thrived for 80 million years, adapting to every tropical ecosystem on Earth — resilience through deep roots.' },
    maple:  { name: 'Japanese Maple',  fact: 'Japanese Maples turn brilliant red in autumn — the brighter the seasonal stress, the more vivid the display of growth.' },
  };

  // Override StudyTree to use illustrated SVGs instead of canvas
  function _studyTreeUpdate(sessions, subject) {
    const cycle = sessions > 0 ? Math.floor((sessions - 1) / 5) : 0;
    const stage = sessions > 0 ? ((sessions - 1) % 5) + 1 : 0;
    const theme = _cycleTheme(cycle, subject);
    const svg   = _getTreeSvg(theme, stage);

    const miniEl = $('st-mini-svg'), mainEl = $('st-main-svg');
    if (miniEl) miniEl.innerHTML = svg;
    if (mainEl) mainEl.innerHTML = svg;

    const pillSess = $('st-pill-sessions'), pillSubj = $('st-pill-subject');
    if (pillSess) pillSess.textContent = stage;       // show stage-in-cycle (0-5)
    const subjCap = subject ? subject.charAt(0).toUpperCase() + subject.slice(1) : 'Study';
    if (pillSubj) pillSubj.textContent = subjCap;

    const panelSubj = $('st-panel-subject'), stageLabel = $('st-stage-label');
    if (panelSubj) panelSubj.textContent = subjCap + ' Tree';
    if (stageLabel) stageLabel.textContent = STAGE_LABELS[stage] || 'Seedling';

    const msgEl = $('st-message');
    if (msgEl) msgEl.textContent = _TREE_MESSAGES[stage] || _TREE_MESSAGES[0];

    const info = _THEME_INFO[theme] || _THEME_INFO.oak;
    const factEl = $('st-tree-fact'), nameEl = $('st-species-name'), factTextEl = $('st-species-fact');
    if (factEl && nameEl && factTextEl) {
      nameEl.textContent    = info.name;
      factTextEl.textContent = info.fact;
      factEl.classList.toggle('hidden', stage === 0);
    }

    document.querySelectorAll('.st-pip').forEach(pip => {
      const n = parseInt(pip.dataset.stage);
      pip.classList.toggle('active', n === stage);
      pip.classList.toggle('done',   n < stage || (stage === 5 && n <= 5));
    });
  }
  const STAGE_LABELS = ['', 'The Seed', 'The Sprout', 'The Young Tree', 'The Growing Tree', 'The Strong Tree'];
  const STAGE_FACTS  = [
    '',
    'It all starts with a tiny seed.',
    'A little sprout reaches for the sun.',
    'It grows stronger and reaches higher.',
    'It grows big and strong, branching out.',
    'It stands tall and strong, ready for the future.',
  ];

  /* ── Multi-theme illustrated tree SVG system ── */

  // Oak (default) stage SVGs — charming illustrated style
  const _OAK = {
    0:`<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="220" fill="#e8f4fd" rx="16"/><ellipse cx="40" cy="36" rx="26" ry="14" fill="white" opacity="0.9"/><ellipse cx="62" cy="30" rx="18" ry="12" fill="white" opacity="0.9"/><ellipse cx="100" cy="150" rx="94" ry="12" fill="#8B5E3C"/><rect x="6" y="150" width="188" height="62" fill="#6B4423"/><ellipse cx="100" cy="136" rx="22" ry="18" fill="#C4892A"/><ellipse cx="100" cy="126" rx="18" ry="14" fill="#D4991A"/><ellipse cx="93" cy="124" rx="5" ry="4" fill="#E8B830" opacity="0.5"/><circle cx="95" cy="132" r="2" fill="#7B4400"/><circle cx="105" cy="132" r="2" fill="#7B4400"/><path d="M94 139Q100 143 106 139" stroke="#7B4400" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`,
    1:`<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="220" fill="#e8f4fd" rx="16"/><ellipse cx="40" cy="36" rx="26" ry="14" fill="white" opacity="0.9"/><ellipse cx="62" cy="30" rx="18" ry="12" fill="white" opacity="0.9"/><ellipse cx="100" cy="150" rx="94" ry="12" fill="#8B5E3C"/><rect x="6" y="150" width="188" height="62" fill="#6B4423"/><ellipse cx="100" cy="136" rx="22" ry="18" fill="#C4892A"/><ellipse cx="100" cy="126" rx="18" ry="14" fill="#D4991A"/><line x1="100" y1="112" x2="100" y2="92" stroke="#4CAF50" stroke-width="2.5" stroke-linecap="round"/><ellipse cx="96" cy="87" rx="7" ry="9" fill="#5DC960" transform="rotate(-15 96 87)"/><circle cx="95" cy="132" r="2" fill="#7B4400"/><circle cx="105" cy="132" r="2" fill="#7B4400"/><path d="M94 139Q100 143 106 139" stroke="#7B4400" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`,
    2:`<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="220" fill="#d4edff" rx="16"/><circle cx="162" cy="36" r="20" fill="#FFD54F" opacity="0.75"/><ellipse cx="46" cy="40" rx="30" ry="15" fill="white" opacity="0.9"/><ellipse cx="70" cy="33" rx="22" ry="14" fill="white" opacity="0.9"/><ellipse cx="100" cy="155" rx="92" ry="10" fill="#8B5E3C"/><rect x="8" y="155" width="184" height="57" fill="#6B4423"/><line x1="100" y1="155" x2="100" y2="88" stroke="#5D9A20" stroke-width="5" stroke-linecap="round"/><ellipse cx="80" cy="118" rx="18" ry="10" fill="#5DC960" transform="rotate(-30 80 118)"/><ellipse cx="120" cy="107" rx="18" ry="10" fill="#66D66A" transform="rotate(30 120 107)"/><ellipse cx="100" cy="81" rx="11" ry="13" fill="#7DDF7D"/><circle cx="95" cy="130" r="2.5" fill="#2E6B00"/><circle cx="105" cy="130" r="2.5" fill="#2E6B00"/><path d="M93 137Q100 141 107 137" stroke="#2E6B00" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`,
    3:`<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="220" fill="#c8e6ff" rx="16"/><circle cx="166" cy="38" r="21" fill="#FFD54F" opacity="0.8"/><ellipse cx="50" cy="38" rx="30" ry="15" fill="white" opacity="0.85"/><ellipse cx="76" cy="32" rx="22" ry="14" fill="white" opacity="0.85"/><ellipse cx="100" cy="158" rx="90" ry="10" fill="#7A5232"/><rect x="10" y="158" width="180" height="54" fill="#5C3D22"/><rect x="91" y="110" width="18" height="50" fill="#8B5E3C" rx="4"/><ellipse cx="100" cy="92" rx="42" ry="34" fill="#4CAF50"/><ellipse cx="80" cy="98" rx="24" ry="19" fill="#5DC960"/><ellipse cx="120" cy="98" rx="24" ry="19" fill="#5DC960"/><ellipse cx="100" cy="74" rx="30" ry="24" fill="#66D66A"/><circle cx="95" cy="128" r="2.5" fill="#5C3D22"/><circle cx="105" cy="128" r="2.5" fill="#5C3D22"/><path d="M93 135Q100 139 107 135" stroke="#5C3D22" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`,
    4:`<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="220" fill="#b3d9ff" rx="16"/><circle cx="163" cy="34" r="22" fill="#FFD54F" opacity="0.85"/><ellipse cx="42" cy="35" rx="32" ry="16" fill="white" opacity="0.85"/><ellipse cx="68" cy="28" rx="24" ry="15" fill="white" opacity="0.85"/><ellipse cx="100" cy="160" rx="90" ry="10" fill="#6B9B3A"/><rect x="10" y="160" width="180" height="52" fill="#5C8A2A"/><path d="M88 160Q85 130 88 94" stroke="#8B5E3C" stroke-width="22" fill="none" stroke-linecap="round"/><path d="M112 160Q115 130 112 94" stroke="#7A4F2E" stroke-width="18" fill="none" stroke-linecap="round"/><ellipse cx="100" cy="80" rx="66" ry="52" fill="#3D8B30"/><ellipse cx="66" cy="90" rx="40" ry="32" fill="#4CAF50"/><ellipse cx="134" cy="90" rx="40" ry="32" fill="#4CAF50"/><ellipse cx="100" cy="56" rx="50" ry="38" fill="#5DC960"/><ellipse cx="78" cy="68" rx="30" ry="24" fill="#66D66A" opacity="0.8"/><circle cx="96" cy="138" r="3" fill="#5C3D22"/><circle cx="108" cy="138" r="3" fill="#5C3D22"/><path d="M93 146Q101 151 109 146" stroke="#5C3D22" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>`,
    5:`<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="220" fill="#90c8ff" rx="16"/><circle cx="24" cy="30" r="20" fill="#FFD54F" opacity="0.9"/><ellipse cx="148" cy="36" rx="36" ry="17" fill="white" opacity="0.85"/><ellipse cx="170" cy="28" rx="25" ry="16" fill="white" opacity="0.85"/><ellipse cx="100" cy="168" rx="88" ry="10" fill="#558B2F"/><rect x="12" y="168" width="176" height="44" fill="#4A7A26"/><path d="M85 168Q82 132 86 84" stroke="#7A4F2E" stroke-width="28" fill="none" stroke-linecap="round"/><path d="M115 168Q118 132 114 84" stroke="#6B4020" stroke-width="24" fill="none" stroke-linecap="round"/><ellipse cx="100" cy="70" rx="82" ry="60" fill="#2E7D32"/><ellipse cx="58" cy="84" rx="48" ry="38" fill="#388E3C"/><ellipse cx="142" cy="84" rx="48" ry="38" fill="#388E3C"/><ellipse cx="100" cy="46" rx="60" ry="44" fill="#43A047"/><ellipse cx="72" cy="56" rx="38" ry="30" fill="#4CAF50" opacity="0.9"/><ellipse cx="128" cy="56" rx="38" ry="30" fill="#4CAF50" opacity="0.9"/><ellipse cx="100" cy="36" rx="42" ry="30" fill="#66BB6A"/><circle cx="95" cy="138" r="3.5" fill="#5C3D22"/><circle cx="109" cy="138" r="3.5" fill="#5C3D22"/><path d="M92 147Q102 153 112 147" stroke="#5C3D22" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`,
  };

  // Generator for non-oak themes (pine, cherry, palm, maple)
  const _svgCache = {};
  function _mkTreeSvg(theme, stage) {
    const key = theme + stage;
    if (_svgCache[key]) return _svgCache[key];
    if (theme === 'oak') return (_svgCache[key] = _OAK[stage] || _OAK[0]);

    const SKY = {
      pine:  ['#ddf0ff','#cce8ff','#baddff','#a6d0ff','#8ec4ff','#72b4ff'],
      cherry:['#fdeaf8','#fcdcf3','#faccec','#f8bbe3','#f5a8d8','#f290cc'],
      palm:  ['#d8f0f8','#c4e8f4','#aeddee','#96d0e8','#7cc4e0','#5cb8d8'],
      maple: ['#fff8e8','#fff0d0','#ffe4b4','#ffd894','#ffca70','#ffb848'],
    };
    const sky = (SKY[theme] || SKY.oak)[stage] || '#e8f4fd';
    const GT = theme === 'palm' ? '#B89060' : '#8B5E3C';
    const GB = theme === 'palm' ? '#9A7850' : '#6B4423';
    const clouds = `<ellipse cx="44" cy="35" rx="28" ry="14" fill="white" opacity="0.85"/><ellipse cx="67" cy="29" rx="20" ry="13" fill="white" opacity="0.82"/>`;
    const ground = `<ellipse cx="100" cy="155" rx="90" ry="10" fill="${GT}"/><rect x="10" y="155" width="180" height="57" fill="${GB}"/>`;
    const face = (cx, cy, col) =>
      `<circle cx="${cx-5}" cy="${cy}" r="2" fill="${col}"/><circle cx="${cx+5}" cy="${cy}" r="2" fill="${col}"/><path d="M${cx-6} ${cy+6}Q${cx} ${cy+10} ${cx+6} ${cy+6}" stroke="${col}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;

    let tree = '';

    /* ──── PINE ──── */
    if (theme === 'pine') {
      if (stage === 0) {
        tree = `<ellipse cx="100" cy="132" rx="14" ry="20" fill="#8B6914"/>
<path d="M88 122Q100 119 112 122M86 128Q100 125 114 128M88 134Q100 131 112 134" stroke="#5A3C0A" stroke-width="1.2" fill="none"/>
${face(100,145,'#3E2704')}`;
      } else {
        const TH=[0,22,36,52,70,90][stage], TY=155-TH;
        tree=`<rect x="96" y="${TY}" width="8" height="${TH}" fill="#6D4C41" rx="3"/>`;
        for(let t=0;t<stage;t++){
          const ty=TY+Math.round(TH*t/stage), hw=14+(stage-t)*12, th=26+(stage-t)*4;
          tree+=`<polygon points="${100},${ty} ${100-hw},${ty+th} ${100+hw},${ty+th}" fill="${t%2===0?'#2E7D32':'#43A047'}"/>`;
        }
        tree+=face(100,TY+TH-6,'#1B5E20');
      }
    }

    /* ──── CHERRY ──── */
    if (theme === 'cherry') {
      if (stage === 0) {
        tree = `<circle cx="100" cy="132" r="20" fill="#F06292"/><circle cx="93" cy="126" r="7" fill="#FCE4EC" opacity="0.55"/>${face(100,140,'#880E4F')}`;
      } else {
        const TH=[0,28,42,60,78,100][stage], TY=155-TH;
        tree=`<rect x="96" y="${TY}" width="8" height="${TH}" fill="#A1887F" rx="3"/>`;
        if(stage>=2){const bl=12+stage*4;tree+=`<line x1="100" y1="${TY+10}" x2="${100-bl}" y2="${TY+2}" stroke="#A1887F" stroke-width="4" stroke-linecap="round"/><line x1="100" y1="${TY+10}" x2="${100+bl}" y2="${TY+2}" stroke="#A1887F" stroke-width="4" stroke-linecap="round"/>`;}
        const PUFFS=[[],[100,TY+8],[88,TY+6,112,TY+6],[100,TY,84,TY+10,116,TY+10],[100,TY-4,80,TY+6,120,TY+6,94,TY+16,106,TY+16],[100,TY-8,78,TY+2,122,TY+2,86,TY+14,114,TY+14,100,TY+22]][stage]||[];
        const R=[0,18,15,14,13,12][stage];
        for(let i=0;i<PUFFS.length;i+=2){const px=PUFFS[i],py=PUFFS[i+1];tree+=`<circle cx="${px}" cy="${py}" r="${R}" fill="#F48FB1"/><circle cx="${px-3}" cy="${py-4}" r="${Math.round(R*.42)}" fill="#FCE4EC" opacity="0.65"/>`;}
        if(stage>=4)tree+=`<circle cx="66" cy="${TY+22}" r="4" fill="#F48FB1" opacity="0.5"/><circle cx="134" cy="${TY+18}" r="3" fill="#FCE4EC" opacity="0.6"/>`;
        if(stage>=5)tree+=`<circle cx="60" cy="${TY+36}" r="3" fill="#F48FB1" opacity="0.4"/><circle cx="140" cy="${TY+30}" r="4" fill="#FCE4EC" opacity="0.5"/>`;
        tree+=face(100,TY+TH-6,'#880E4F');
      }
    }

    /* ──── PALM ──── */
    if (theme === 'palm') {
      if (stage === 0) {
        tree = `<ellipse cx="100" cy="133" rx="17" ry="21" fill="#5D4037"/><ellipse cx="93" cy="126" rx="6" ry="5" fill="#8D6E63" opacity="0.45"/>${face(100,142,'#3E2723')}`;
      } else {
        const TH=[0,28,46,64,82,108][stage], TY=155-TH, OX=stage*2;
        tree=`<path d="M100,155 Q${100+OX},${155-TH/2} ${100+OX},${TY}" stroke="#8D6E63" stroke-width="13" fill="none" stroke-linecap="round"/>`;
        tree+=`<path d="M101,155 Q${102+OX},${155-TH/2} ${101+OX},${TY}" stroke="#A1887F" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.38"/>`;
        const TX=100+OX, FL=[0,32,40,50,60,70][stage];
        const ANGLES=[[],[-70,-20,40],[-90,-45,0,50],[-100,-60,-15,30,80],[-110,-70,-25,20,65,115],[-120,-80,-35,10,55,100,145]][stage]||[];
        ANGLES.forEach(deg=>{
          const r=deg*Math.PI/180, ex=Math.round(TX+Math.cos(r)*FL), ey=Math.round(TY+Math.sin(r)*FL*.55);
          const mx=Math.round(TX+Math.cos(r)*FL*.5+Math.cos(r+1.6)*10), my=Math.round(TY+Math.sin(r)*FL*.28+Math.sin(r+1.6)*5);
          tree+=`<path d="M${TX},${TY} Q${mx},${my} ${ex},${ey}" stroke="#388E3C" stroke-width="3.5" fill="none" stroke-linecap="round"/>`;
          tree+=`<ellipse cx="${Math.round((TX+ex)/2)}" cy="${Math.round((TY+ey)/2)}" rx="${Math.round(FL*.2)}" ry="5" fill="#43A047" opacity="0.75" transform="rotate(${deg},${Math.round((TX+ex)/2)},${Math.round((TY+ey)/2)})"/>`;
        });
        if(stage>=4)tree+=`<circle cx="${TX-7}" cy="${TY+9}" r="6" fill="#5D4037"/><circle cx="${TX+5}" cy="${TY+12}" r="5" fill="#4E342E"/>`;
        if(stage>=5)tree+=`<circle cx="${TX-13}" cy="${TY+18}" r="5" fill="#5D4037"/>`;
      }
    }

    /* ──── MAPLE ──── */
    if (theme === 'maple') {
      if (stage === 0) {
        tree = `<ellipse cx="100" cy="135" rx="8" ry="16" fill="#E65100" transform="rotate(-20 100 135)"/>
<ellipse cx="110" cy="125" rx="5" ry="12" fill="#FF8F00" transform="rotate(15 110 125)"/>
<ellipse cx="91" cy="128" rx="4" ry="10" fill="#BF360C" transform="rotate(-35 91 128)"/>
${face(100,146,'#3E2000')}`;
      } else {
        const TH=[0,22,36,54,70,90][stage], TY=155-TH;
        tree=`<rect x="94" y="${TY}" width="12" height="${TH}" fill="#6D4C41" rx="4"/>`;
        const CY=TY-8-stage*5, CW=[0,28,36,46,56,66][stage], CH=[0,22,28,36,44,52][stage];
        tree+=`<ellipse cx="100" cy="${CY+Math.round(CH*.55)}" rx="${CW}" ry="${Math.round(CH*.52)}" fill="#E65100"/>`;
        tree+=`<ellipse cx="${100-Math.round(CW*.38)}" cy="${CY+Math.round(CH*.6)}" rx="${Math.round(CW*.55)}" ry="${Math.round(CH*.44)}" fill="#FF8F00"/>`;
        tree+=`<ellipse cx="${100+Math.round(CW*.38)}" cy="${CY+Math.round(CH*.6)}" rx="${Math.round(CW*.55)}" ry="${Math.round(CH*.44)}" fill="#EF6C00"/>`;
        tree+=`<ellipse cx="100" cy="${CY+Math.round(CH*.28)}" rx="${Math.round(CW*.62)}" ry="${Math.round(CH*.38)}" fill="#FFA726"/>`;
        if(stage>=3)tree+=`<ellipse cx="${100-Math.round(CW*.25)}" cy="${CY+5}" rx="${Math.round(CW*.28)}" ry="${Math.round(CH*.22)}" fill="#BF360C" opacity="0.5"/>`;
        if(stage>=4)tree+=`<ellipse cx="${100+Math.round(CW*.28)}" cy="${CY+6}" rx="${Math.round(CW*.26)}" ry="${Math.round(CH*.2)}" fill="#FF3D00" opacity="0.42"/>`;
        if(stage>=4)tree+=`<ellipse cx="66" cy="${CY+CH+12}" rx="7" ry="4" fill="#FF8F00" opacity="0.55" transform="rotate(-30 66 ${CY+CH+12})"/>`;
        if(stage>=5){tree+=`<ellipse cx="136" cy="${CY+CH+9}" rx="6" ry="3" fill="#E65100" opacity="0.5" transform="rotate(25 136 ${CY+CH+9})"/>`;tree+=`<ellipse cx="56" cy="${CY+CH+20}" rx="5" ry="3" fill="#FFA726" opacity="0.45" transform="rotate(-20 56 ${CY+CH+20})"/>`;}
        tree+=face(100,CY+Math.round(CH*.55),'#3E2000');
      }
    }

    return (_svgCache[key] = `<svg viewBox="0 0 200 220" xmlns="http://www.w3.org/2000/svg"><rect width="200" height="220" fill="${sky}" rx="16"/>${clouds}${ground}${tree}</svg>`);
  }

  // Subject → starting tree theme
  function _subjectTheme(subject) {
    const s = (subject||'').toLowerCase();
    if(/math|physics|chem|engin/.test(s))     return 'pine';
    if(/hist|social|politic|geograph/.test(s)) return 'maple';
    if(/lit|lang|english|art|music/.test(s))   return 'cherry';
    if(/bio|earth|environ|nature/.test(s))     return 'palm';
    return 'oak';
  }
  const _CYCLE_THEMES = ['oak','pine','cherry','palm','maple'];
  function _cycleTheme(cycle, subject) {
    const base = _CYCLE_THEMES.indexOf(_subjectTheme(subject));
    return _CYCLE_THEMES[(base + cycle) % _CYCLE_THEMES.length];
  }
  function _getTreeSvg(theme, stage) {
    return theme === 'oak' ? (_OAK[stage] || _OAK[0]) : _mkTreeSvg(theme, stage);
  }

  // Boot tree widget — must come after all const declarations above
  window.StudyTree = { update: _studyTreeUpdate, drawNodeTree: () => {} };
  _studyTreeUpdate(sessionsCompleted, planSubject);

  // Wire toggle — tree_widget.js exits early (no canvases), so we register this here
  const _stToggle = $('st-toggle'), _stPanel = $('st-panel');
  if (_stToggle && _stPanel) {
    _stToggle.addEventListener('click', () => {
      const next = _stToggle.getAttribute('aria-expanded') !== 'true';
      _stPanel.hidden = !next;
      _stToggle.setAttribute('aria-expanded', String(next));
    });
  }

  function showTreeGrowthOverlay(sessionNum) {
    const overlay = $('tree-growth-overlay');
    if (!overlay) return;

    const cycle        = Math.floor((sessionNum - 1) / 5);
    const stageInCycle = ((sessionNum - 1) % 5) + 1;
    const theme        = _cycleTheme(cycle, planSubject);
    const isNewCycle   = stageInCycle === 1 && sessionNum > 1;

    $('tg-title').textContent = stageInCycle >= 5
      ? `Session ${sessionNum} complete! 🌳 Tree fully grown!`
      : isNewCycle
        ? `Session ${sessionNum} — New tree sprouting! 🌱`
        : `Session ${sessionNum} complete! 🌿`;
    $('tg-stage').textContent = STAGE_LABELS[stageInCycle] || '';
    $('tg-fact').textContent  = '';

    overlay.querySelectorAll('.tree-growth-pip').forEach(pip => {
      pip.classList.toggle('done', parseInt(pip.dataset.s) <= stageInCycle);
    });
    overlay.classList.remove('hidden');

    const svgEl = $('tg-tree-svg');
    if (!svgEl) return;

    let stage = 0;
    function animateStage() {
      svgEl.innerHTML = _getTreeSvg(theme, stage);
      $('tg-stage').textContent = STAGE_LABELS[stage] || (stage === 0 ? 'The Seed' : '');
      if (stage < stageInCycle) {
        stage++;
        setTimeout(animateStage, 520);
      } else {
        setTimeout(() => { $('tg-fact').textContent = STAGE_FACTS[stageInCycle] || ''; }, 300);
      }
    }
    setTimeout(animateStage, 300);
  }

  $('tg-continue-btn') && $('tg-continue-btn').addEventListener('click', () => {
    $('tree-growth-overlay').classList.add('hidden');
  });

  function recordSessionHistory() {
    const hist = JSON.parse(localStorage.getItem('studySyncSessionHistory') || '[]');
    const today = new Date().toISOString().split('T')[0];
    hist.push({ date: today, subject: planSubject, hours: planHours / 5, mode: 'daily' });
    localStorage.setItem('studySyncSessionHistory', JSON.stringify(hist));
  }

  function onSessionComplete() {
    sessionsCompleted += 1;
    saveSessionCount(sessionsCompleted);
    recordSessionHistory();
    if (window.StudyTree) window.StudyTree.update(sessionsCompleted, planSubject);
    updateSessionsText();
    updateRing();
    updateProgressStrip(true);

    // Forest brighten celebration
    const scene = document.querySelector('.dm-bg-scene');
    if (scene) {
      scene.classList.remove('celebrate');
      void scene.offsetWidth;
      scene.classList.add('celebrate');
      setTimeout(() => scene.classList.remove('celebrate'), 2000);
    }

    setTimeout(() => showTreeGrowthOverlay(sessionsCompleted), 600);
  }

  /* ── TIMER ── */
  const TOTAL_SECS  = Math.round(planHours * 3600);
  let timeLeft      = TOTAL_SECS;
  let timerInterval = null;
  let timerRunning  = false;
  let timerFinished = false;
  let sessionStarted = false; // true once timer has been started; only clears when all 5 done
  let breakActive = false, breakTimeLeft = 0, breakTimerInt = null;
  let _pausedByVisibility = false;

  function saveTimerState() {
    localStorage.setItem(TIMER_KEY, JSON.stringify({
      timeLeft, timerRunning, timerFinished, sessionStarted,
      savedAt: Date.now(),
      savedDate: new Date().toDateString(),
      totalSecs: TOTAL_SECS,
      planSubject,
    }));
  }

  function restoreTimerState() {
    try {
      const s = JSON.parse(localStorage.getItem(TIMER_KEY));
      if (!s || s.totalSecs !== TOTAL_SECS || s.planSubject !== planSubject) return false;
      let remaining = s.timeLeft;
      if (s.timerRunning) {
        const elapsed = Math.floor((Date.now() - s.savedAt) / 1000);
        remaining = Math.max(0, s.timeLeft - elapsed);
      }
      timeLeft       = remaining;
      timerFinished  = s.timerFinished || remaining <= 0;
      sessionStarted = s.sessionStarted || false;
      // Timer ran out while user was away: was running but now out of time, and onSessionComplete
      // was never called (because the setInterval never fired). Flag it so the restore path
      // can count the session and update the tree. Only auto-count on the same calendar day
      // to avoid crediting yesterday's work to today's tally.
      _autoCountSession = s.timerRunning && remaining <= 0
                       && s.savedDate === new Date().toDateString();
      return s.timerRunning && !timerFinished;
    } catch (_) { return false; }
  }

  const displayEl   = $('timer-display');
  const labelEl     = $('timer-label');
  const startBtn    = $('timer-start-btn');
  const pauseBtn    = $('timer-pause-btn');
  const resetBtn    = $('timer-reset-btn');
  const ringWrapEl  = $('dm-timer-ring-wrap');
  const progressBar = null; // removed — ring arc replaces the progress bar
  const sessText    = $('timer-sessions-text');

  function formatTime(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function updateTimerDisplay() {
    const formatted = formatTime(timeLeft);
    displayEl.textContent = formatted;
    // Shrink font when showing H:MM:SS to avoid overflowing the 260px ring
    displayEl.style.fontSize = formatted.length > 5 ? 'clamp(18px, 1.9vw, 26px)' : '';
    displayEl.classList.remove('tick');
    void displayEl.offsetWidth; // restart the pulse animation on every tick
    displayEl.classList.add('tick');
    updateTimerRing();
    // Gradually turn timer green as time runs out (last 50%)
    const remaining = TOTAL_SECS > 0 ? timeLeft / TOTAL_SECS : 0;
    if (remaining > 0.5) {
      displayEl.style.color = '';
    } else {
      const t = 1 - (remaining / 0.5);
      const r = Math.round(245 - t * (245 - 125));
      const g = Math.round(237 - t * (237 - 181));
      const b = Math.round(214 - t * (214 - 74));
      displayEl.style.color = `rgb(${r},${g},${b})`;
    }
  }

  function updateTimerRing(forBreak = false) {
    const arc = $('dm-timer-ring-arc');
    if (!arc) return;
    const CIRC = 2 * Math.PI * 88; // r=88
    let frac;
    if (forBreak) {
      frac = breakTimeLeft > 0 ? breakTimeLeft / 300 : 0; // break drains from full
      arc.style.stroke = 'var(--amber, #C9952A)';
    } else {
      frac = TOTAL_SECS > 0 ? timeLeft / TOTAL_SECS : 0;
      arc.style.stroke = '';
    }
    arc.style.strokeDasharray = CIRC;
    arc.style.strokeDashoffset = CIRC * frac;
  }

  function updateSessionsText() {
    if (sessText) {
      sessText.textContent = `Session ${sessionsCompleted + 1}`;
    }
  }

  function updateRing() {
    const ringFill = document.getElementById('dm-ring-fill');
    const ringNum  = document.getElementById('dm-ring-sessions');
    if (!ringFill) return;
    const CIRC = 326.7;
    const fillFrac = Math.min(sessionsCompleted, 5) / 5;
    ringFill.style.strokeDashoffset = CIRC - fillFrac * CIRC;
    if (ringNum) ringNum.textContent = sessionsCompleted;
    ringFill.style.stroke = sessionsCompleted >= 5 ? 'var(--lime)' : 'var(--sprout)';
  }

  function updateProgressStrip(flashLatest = false) {
    const cycle        = sessionsCompleted > 0 ? Math.floor((sessionsCompleted - 1) / 5) : 0;
    const stageInCycle = sessionsCompleted > 0 ? ((sessionsCompleted - 1) % 5) + 1 : 0;
    const theme        = _cycleTheme(cycle, planSubject);

    const lineFill = document.getElementById('dm-prog-line-fill');
    if (lineFill) {
      const pct = stageInCycle === 0 ? 0 : ((stageInCycle - 1) / 4) * 100;
      lineFill.style.width = Math.min(100, pct) + '%';
    }

    for (let i = 1; i <= 5; i++) {
      const el   = document.getElementById('dm-prog-tree-' + i);
      const node = el && el.closest('.dm-prog-node');
      if (!el) continue;
      el.classList.remove('done', 'active', 'done-latest');
      if (node) { node.classList.remove('active'); delete node.dataset.done; }

      if (i <= stageInCycle) {
        const isLatest = flashLatest && i === stageInCycle;
        el.classList.add(isLatest ? 'done-latest' : 'done');
        if (node) node.dataset.done = '1';
        el.innerHTML = _getTreeSvg(theme, i);
      } else if (i === stageInCycle + 1) {
        el.classList.add('active');
        if (node) node.classList.add('active');
        el.innerHTML = _getTreeSvg(theme, 0);
      } else {
        el.innerHTML = _getTreeSvg(theme, 0);
      }
    }

    const doneMeta = document.getElementById('dm-prog-sessions-done');
    if (doneMeta) {
      doneMeta.textContent = cycle === 0
        ? (stageInCycle >= 5 ? '🌳 Tree complete!' : `${stageInCycle} of 5 done`)
        : `Cycle ${cycle + 1} · ${stageInCycle} of 5 (${sessionsCompleted} total)`;
    }
    const subMeta = document.getElementById('dm-prog-subject-label');
    if (subMeta && planSubject) subMeta.textContent = planSubject.charAt(0).toUpperCase() + planSubject.slice(1);
  }

  function startTimer() {
    if (timerFinished) return;
    timerRunning   = true;
    sessionStarted = true;
    labelEl.textContent = 'running';
    labelEl.className   = 'dm-timer-label running';
    startBtn.classList.add('dm-btn-hidden');
    pauseBtn.classList.remove('dm-btn-hidden');
    resetBtn.classList.remove('dm-btn-hidden');
    if (ringWrapEl) { ringWrapEl.classList.add('is-running'); ringWrapEl.classList.remove('is-break'); }
    lockGoal();
    updateChangeBtnState();
    saveTimerState();

    timerInterval = setInterval(() => {
      if (timeLeft <= 0) {
        clearInterval(timerInterval);
        timerRunning  = false;
        timerFinished = true;
        displayEl.textContent = '00:00';
        displayEl.style.fontSize = '';
        labelEl.textContent = 'done!';
        labelEl.className   = 'dm-timer-label done';
        pauseBtn.classList.add('dm-btn-hidden');
        if (ringWrapEl) ringWrapEl.classList.remove('is-running');
        saveTimerState();
        const _savedGoal = saveGoal();
        onSessionComplete();
        // Show saved goal in the session complete overlay
        const goalReflect = $('tg-goal-reflect');
        const goalText    = $('tg-goal-text');
        if (goalReflect && goalText && _savedGoal) {
          goalText.textContent = _savedGoal;
          goalReflect.classList.remove('hidden');
        } else if (goalReflect) {
          goalReflect.classList.add('hidden');
        }
        // Always start a break after every session
        setTimeout(() => startBreak(300), 2000);
        return;
      }
      timeLeft -= 1;
      updateTimerDisplay();
      saveTimerState();
    }, 1000);
  }

  function pauseTimer() {
    clearInterval(timerInterval);
    timerRunning = false;
    labelEl.textContent = 'paused';
    labelEl.className   = 'dm-timer-label paused';
    if (ringWrapEl) ringWrapEl.classList.remove('is-running');
    pauseBtn.textContent = '▶ Resume';
    pauseBtn.onclick     = resumeTimer;
    updateChangeBtnState();
    saveTimerState();
    if (window.StudyMotivation) window.StudyMotivation.show();
  }

  function resumeTimer() {
    pauseBtn.textContent = '⏸ Pause';
    pauseBtn.onclick     = pauseTimer;
    if (window.StudyMotivation) window.StudyMotivation.hide();
    startTimer();
  }

  function resetTimer() {
    clearInterval(timerInterval);
    timerRunning   = false;
    sessionStarted = false; // reset unlocks the session
    timerFinished  = false;
    if (ringWrapEl) { ringWrapEl.classList.remove('is-running'); ringWrapEl.classList.remove('is-break'); }
    updateChangeBtnState();
    timeLeft      = TOTAL_SECS;
    updateTimerDisplay();
    labelEl.textContent = 'ready';
    labelEl.className   = 'dm-timer-label';
    startBtn.textContent = '▶ Start Session';
    startBtn.disabled    = false;
    startBtn.classList.remove('dm-btn-hidden');
    pauseBtn.classList.add('dm-btn-hidden');
    resetBtn.classList.add('dm-btn-hidden');
    pauseBtn.textContent = '⏸ Pause';
    pauseBtn.onclick     = pauseTimer;
    saveTimerState();
  }

  function showWateringOverlay() {
    const overlay = $('break-water-overlay');
    const svgEl   = $('break-tree-svg');
    if (!overlay) return;
    if (sessionsCompleted > 0) {
      const cycle = Math.floor((sessionsCompleted - 1) / 5);
      const stage = ((sessionsCompleted - 1) % 5) + 1;
      const theme = _cycleTheme(cycle, planSubject);
      if (svgEl) svgEl.innerHTML = _getTreeSvg(theme, stage);
    }
    overlay.classList.remove('hidden');
  }

  function hideWateringOverlay() {
    const overlay = $('break-water-overlay');
    if (overlay) overlay.classList.add('hidden');
  }

  function startBreak(durationSecs) {
    breakActive   = true;
    breakTimeLeft = durationSecs;
    timeLeft      = TOTAL_SECS;
    timerFinished = false;
    displayEl.textContent = formatTime(breakTimeLeft);
    displayEl.style.fontSize = '';
    labelEl.textContent   = 'break';
    labelEl.className     = 'dm-timer-label break';
    if (ringWrapEl) { ringWrapEl.classList.remove('is-running'); ringWrapEl.classList.add('is-break'); }
    startBtn.classList.add('dm-btn-hidden');
    pauseBtn.classList.add('dm-btn-hidden');
    resetBtn.classList.add('dm-btn-hidden');
    const skipBtn = $('timer-skip-break-btn');
    if (skipBtn) skipBtn.classList.remove('dm-btn-hidden');
    updateTimerRing(true);
    unlockGoal();
    showWateringOverlay();
    breakTimerInt = setInterval(() => {
      if (breakTimeLeft <= 0) { endBreak(); return; }
      breakTimeLeft--;
      displayEl.textContent = formatTime(breakTimeLeft);
      updateTimerRing(true);
    }, 1000);
  }

  function endBreak() {
    clearInterval(breakTimerInt);
    breakActive = false;
    if (ringWrapEl) ringWrapEl.classList.remove('is-break');
    hideWateringOverlay();
    const skipBtn = $('timer-skip-break-btn');
    if (skipBtn) skipBtn.classList.add('dm-btn-hidden');
    timeLeft      = TOTAL_SECS;
    timerFinished = false;
    updateTimerDisplay();
    labelEl.textContent  = 'ready';
    labelEl.className    = 'dm-timer-label';
    startBtn.textContent = '▶ Next Session';
    startBtn.disabled    = false;
    startBtn.classList.remove('dm-btn-hidden');
    resetBtn.classList.add('dm-btn-hidden');
    saveTimerState();
  }

  /* ── SESSION GOAL ── */
  const GOALS_KEY = 'studySyncGoals';

  function lockGoal() {
    const input = $('session-goal-input');
    if (input) input.setAttribute('readonly', '');
  }

  function unlockGoal() {
    const input = $('session-goal-input');
    if (input) { input.removeAttribute('readonly'); input.value = ''; }
  }

  function saveGoal() {
    const input = $('session-goal-input');
    if (!input || !input.value.trim()) return null;
    const goal = input.value.trim();
    const goals = JSON.parse(localStorage.getItem(GOALS_KEY) || '[]');
    goals.push({ id: Date.now().toString(), goal, date: new Date().toISOString().split('T')[0], subject: planSubject, sessionNum: sessionsCompleted + 1 });
    localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
    return goal;
  }

  function _openPlanForNextSession() {
    // Pre-fill the plan modal with the current session's values
    const subjectEl = $('cp-subject');
    const topicEl   = $('cp-topic');
    if (subjectEl && plan) subjectEl.value = plan.subject || '';
    if (topicEl   && plan) topicEl.value   = plan.topic   || '';
    // Pre-select duration chip closest to current planHours
    const totalMins = Math.round(planHours * 60);
    let matched = false;
    document.querySelectorAll('.cp-chip').forEach(chip => {
      chip.classList.remove('cp-chip-active');
      if (!matched && chip.dataset.min && chip.dataset.min !== 'custom' && parseInt(chip.dataset.min) === totalMins) {
        chip.classList.add('cp-chip-active');
        matched = true;
      }
    });
    $('cp-overlay').classList.remove('hidden');
  }

  startBtn.onclick = function () {
    // "▶ Next Session" — open plan modal so user can optionally change subject before continuing
    if (sessionsCompleted > 0 && startBtn.textContent.includes('Next')) {
      _openPlanForNextSession();
    } else {
      startTimer();
    }
  };
  pauseBtn.onclick = pauseTimer;
  resetBtn.onclick = resetTimer;
  $('timer-skip-break-btn') && ($('timer-skip-break-btn').onclick = endBreak);

  // Change Session button — locked once started, unlocks only when all 5 sessions complete
  const changeSessionBtn = $('dm-change-session-btn');
  if (changeSessionBtn) {
    changeSessionBtn.addEventListener('click', () => {
      if (sessionStarted) return;
      $('cp-overlay').classList.remove('hidden');
    });
  }

  function updateChangeBtnState() {
    if (!changeSessionBtn) return;
    const locked = sessionStarted;
    changeSessionBtn.disabled = locked;
    changeSessionBtn.title = locked ? 'Finish all 5 sessions before changing' : '';
  }

  // Restore persisted timer state on load
  const wasRunning = restoreTimerState();
  updateTimerDisplay();
  updateTimerRing();
  updateSessionsText();
  updateRing();
  updateProgressStrip();
  updateChangeBtnState(); // re-lock button if session was in progress before exit

  if (wasRunning) {
    // Timer was running when the page was closed — auto-resume
    startTimer();
  } else if (timerFinished) {
    // If the timer expired while the user was away, count that session now.
    if (_autoCountSession) {
      onSessionComplete();
    }
    if (sessionsCompleted >= 5) {
      // Tree fully grown — but user can still keep studying
      labelEl.textContent = 'ready';
      labelEl.className   = 'dm-timer-label';
      startBtn.textContent = '▶ Next Session';
      startBtn.disabled    = false;
      startBtn.classList.remove('dm-btn-hidden');
      pauseBtn.classList.add('dm-btn-hidden');
      resetBtn.classList.add('dm-btn-hidden');
      startBtn.onclick = null;
      sessionStarted = false;
      updateChangeBtnState();
    } else {
      // Session finished, more sessions remain — reset timer to ready so "Next Session" works.
      // The break period has already passed (or was never shown), so skip straight to ready state.
      endBreak();
    }
  }

  // Save on page unload as a safety net
  window.addEventListener('beforeunload', saveTimerState);

  // Auto-pause when tab/window is hidden, resume when visible
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (timerRunning && !breakActive) {
        pauseTimer();
        _pausedByVisibility = true;
      }
    } else if (_pausedByVisibility) {
      _pausedByVisibility = false;
      resumeTimer();
    }
  });

  // Hide timer block if no plan
  if (!plan && $('timer-display')) $('timer-display').textContent = '--:--';

  /* ── SUMMARY ── */
  function updateSummary() {
    // counts kept for internal tracking but no longer displayed in a stats bar
  }

  /* ── PDF STORAGE (IndexedDB) ── */
  const PDF_DB = 'studySyncPDFs';
  let _pdfDb = null;

  function openPdfDb() {
    return new Promise((resolve, reject) => {
      if (_pdfDb) { resolve(_pdfDb); return; }
      const req = indexedDB.open(PDF_DB, 2);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('pdfs')) db.createObjectStore('pdfs');
        if (!db.objectStoreNames.contains('annotations')) db.createObjectStore('annotations');
      };
      req.onsuccess = e => { _pdfDb = e.target.result; resolve(_pdfDb); };
      req.onerror  = () => reject(req.error);
    });
  }

  async function savePdfBlob(id, arrayBuffer) {
    const db = await openPdfDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pdfs', 'readwrite');
      tx.objectStore('pdfs').put(arrayBuffer, id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getPdfBlob(id) {
    const db = await openPdfDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pdfs', 'readonly');
      const req = tx.objectStore('pdfs').get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  async function deletePdfBlob(id) {
    const db = await openPdfDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('pdfs', 'readwrite');
      tx.objectStore('pdfs').delete(id);
      tx.oncomplete = resolve;
      tx.onerror    = () => reject(tx.error);
    });
  }

  /* ── RESOURCES BOARD ── */
  let _resFilter  = '';
  let _activeType = 'link';
  let _pendingPdfFile = null;

  $('add-resource-btn').addEventListener('click', () => {
    $('add-resource-panel').classList.toggle('hidden');
  });
  const emptyAdd = document.getElementById('add-resource-empty-btn');
  if (emptyAdd) {
    emptyAdd.addEventListener('click', () => {
      $('add-resource-panel').classList.remove('hidden');
    });
  }
  $('cancel-resource-btn').addEventListener('click', () => {
    $('add-resource-panel').classList.add('hidden');
    $('reference-form').reset();
    _pendingPdfFile = null;
    $('ref-pdf-label-text').textContent = 'Choose PDF file…';
  });

  // Link / PDF type toggle
  document.querySelectorAll('.dm-res-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.dm-res-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _activeType = btn.dataset.type;
      $('ref-link-fields').classList.toggle('hidden', _activeType !== 'link');
      $('ref-pdf-fields').classList.toggle('hidden',  _activeType !== 'pdf');
      _pendingPdfFile = null;
      $('ref-pdf-label-text').textContent = 'Choose PDF file…';
    });
  });

  // PDF file picker — label wraps input so native click already opens dialog
  $('ref-pdf-input').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    _pendingPdfFile = file;
    $('ref-pdf-label-text').textContent = file.name + ' (' + (file.size / 1024 / 1024).toFixed(1) + ' MB)';
    if (!$('ref-title').value.trim()) $('ref-title').value = file.name.replace(/\.pdf$/i, '');
  });

  $('reference-form').addEventListener('submit', async e => {
    e.preventDefault();
    const subject = $('ref-subject-select').value || 'General';
    const id      = Date.now().toString();
    const title   = $('ref-title').value.trim() || 'Untitled';

    if (_activeType === 'pdf') {
      if (!_pendingPdfFile) { showGlobalAlert('Please choose a PDF file.', 'warning'); return; }
      const buf = await _pendingPdfFile.arrayBuffer();
      await savePdfBlob(id, buf);
      refs.unshift({ id, title, subject, type: 'pdf',
        fileName: _pendingPdfFile.name, fileSize: _pendingPdfFile.size,
        chapter: $('ref-chapter').value.trim(), notes: $('ref-notes').value.trim() });
    } else {
      const url = $('ref-url').value.trim();
      if (!url) { showGlobalAlert('Please enter a URL.', 'warning'); return; }
      refs.unshift({ id, title, subject, type: 'link', url,
        chapter: $('ref-chapter').value.trim(), notes: $('ref-notes').value.trim() });
    }

    localStorage.setItem(REFS_KEY, JSON.stringify(refs));
    $('reference-form').reset();
    _pendingPdfFile = null;
    $('ref-pdf-label-text').textContent = 'Choose PDF file…';
    $('add-resource-panel').classList.add('hidden');
    renderRefs();
  });

  // Subject filter chips
  document.querySelectorAll('.dm-res-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.dm-res-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      _resFilter = chip.dataset.filter || '';
      renderRefs($('global-search').value);
    });
  });

  // Export resources
  const _exportRefsBtn = $('export-refs-btn');
  if (_exportRefsBtn) {
    _exportRefsBtn.onclick = () => {
      const txt = refs.map(r =>
        r.type === 'pdf'
          ? `${r.title} [${r.subject || 'General'}] — PDF: ${r.fileName}${r.chapter ? ' · ' + r.chapter : ''}${r.notes ? '\n' + r.notes : ''}`
          : `${r.title} [${r.subject || 'General'}]\n${r.url}${r.chapter ? ' · ' + r.chapter : ''}${r.notes ? '\n' + r.notes : ''}`
      ).join('\n\n---\n\n');
      const blob = new Blob([txt], { type: 'text/plain' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'StudySync_Resources.txt';
      a.click();
    };
  }

  function renderRefs(filter = '') {
    const board = $('resources-board');
    if (!board) return;

    const filtered = refs.filter(r => {
      if (_resFilter && (r.subject || 'General') !== _resFilter) return false;
      if (!filter) return true;
      const hay = (r.title + ' ' + r.subject + ' ' + (r.url || r.fileName || '') + ' ' + r.notes).toLowerCase();
      return hay.includes(filter.toLowerCase());
    });

    $('daily-note-count').textContent = `${refs.length} resource${refs.length !== 1 ? 's' : ''}`;

    if (!filtered.length) {
      board.innerHTML = `<div class="dm-empty-state"><span class="dm-empty-icon">🔗</span><p>${filter || _resFilter ? 'No resources match.' : 'No resources yet. Add links or PDFs.'}</p></div>`;
      return;
    }

    board.innerHTML = '';
    filtered.forEach(r => {
      const isPdf = r.type === 'pdf';
      const subtitle = isPdf
        ? r.fileName + (r.fileSize ? ' · ' + (r.fileSize / 1024 / 1024).toFixed(1) + ' MB' : '')
        : (() => { try { return new URL(r.url).hostname.replace('www.', ''); } catch { return r.url || ''; } })();

      const card = document.createElement('div');
      card.className = 'dm-res-card' + (isPdf ? ' dm-res-card-pdf' : '');
      card.innerHTML = `
        <div class="dm-res-card-header">
          <div class="dm-res-card-titles">
            <span class="dm-res-card-title-text">${isPdf ? '📄 ' : ''}${escHtml(r.title)}</span>
            <span class="dm-res-card-domain">${escHtml(subtitle)}</span>
          </div>
          <div class="dm-res-card-actions">
            ${isPdf
              ? `<button class="dm-btn dm-btn-ghost dm-res-open-pdf">Open</button>`
              : `<a class="dm-btn dm-btn-ghost" href="${escHtml(r.url)}" target="_blank" rel="noopener">Open</a>`}
            <button class="dm-res-delete" title="Remove">✕</button>
          </div>
        </div>
        <div class="dm-res-card-meta">
          ${r.subject ? `<span class="dm-res-subject-pill">${escHtml(r.subject)}</span>` : ''}
          ${r.chapter ? `<span class="dm-res-chapter">${escHtml(r.chapter)}</span>` : ''}
        </div>
        ${r.notes ? `<p class="dm-res-notes">${escHtml(r.notes)}</p>` : ''}
      `;

      if (isPdf) {
        card.querySelector('.dm-res-open-pdf').addEventListener('click', async () => {
          try {
            const buf = await getPdfBlob(r.id);
            if (!buf) { showGlobalAlert('PDF not found — it may have been cleared.', 'error'); return; }
            openPdfViewer(r.id, r.title || r.fileName || 'Document', buf);
          } catch { showGlobalAlert('Could not open PDF.', 'error'); }
        });
      }

      card.querySelector('.dm-res-delete').addEventListener('click', async e => {
        e.stopPropagation();
        if (isPdf) await deletePdfBlob(r.id).catch(() => {});
        refs = refs.filter(x => x.id !== r.id);
        localStorage.setItem(REFS_KEY, JSON.stringify(refs));
        renderRefs($('global-search').value);
      });

      board.appendChild(card);
    });
  }

  /* ── SEARCH TOGGLE ── */
  $('search-toggle-btn').addEventListener('click', () => {
    const wrap = $('inline-search-wrap');
    const btn  = $('search-toggle-btn');
    const open = wrap.classList.toggle('hidden');
    btn.classList.toggle('active', !open);
    if (!open) { $('global-search').focus(); }
    else { $('global-search').value = ''; renderRefs(); }
  });

  /* ── GLOBAL SEARCH ── */
  $('global-search').addEventListener('input', e => {
    renderRefs(e.target.value.trim());
  });

  /* ── HELPERS ── */
  function escHtml(str) {
    return String(str||'')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* -- NOTE GRAPH -- */
  (function initNoteGraph() {
    const btn   = $('dm-graph-btn');
    const modal = $('dm-graph-modal');
    const closeBtn = $('dm-graph-close');
    const canvas = $('dm-graph-canvas');
    if (!btn || !modal || !canvas) return;

    const SUBJECT_COLORS = {
      'Math':    '#7DB54A',
      'Science': '#4A9DB5',
      'Other':   '#B5844A',
      'General': '#8C7DB5',
    };

    function getColor(subject) {
      return SUBJECT_COLORS[subject] || '#7DB54A';
    }

    function buildGraph() {
      const nodes = refs.map((r, i) => ({
        id: r.id, title: r.title, subject: r.subject || 'General', index: i,
        x: 0, y: 0, vx: 0, vy: 0,
      }));
      const titleMap = {};
      nodes.forEach(n => { titleMap[n.title.toLowerCase()] = n; });

      // Edges: same subject = related
      const edges = [];
      for (let a = 0; a < nodes.length; a++) {
        for (let b = a + 1; b < nodes.length; b++) {
          if (nodes[a].subject === nodes[b].subject) {
            edges.push({ from: nodes[a].id, to: nodes[b].id });
          }
        }
      }
      return { nodes, edges };
    }

    function drawGraph() {
      const W = modal.clientWidth;
      const H = modal.clientHeight - 48;
      canvas.width  = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      const { nodes, edges } = buildGraph();
      if (!nodes.length) {
        ctx.fillStyle = 'rgba(180,195,165,0.4)';
        ctx.font = '14px Poppins, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No resources yet — add some to see the graph.', W / 2, H / 2);
        return { nodes, edges };
      }

      // Circular seed layout
      const cx = W / 2, cy = H / 2;
      const r  = Math.min(cx, cy) * 0.65;
      nodes.forEach((n, i) => {
        const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2;
        n.x = cx + r * Math.cos(angle);
        n.y = cy + r * Math.sin(angle);
      });

      // Simple force iterations (repulsion + spring)
      for (let iter = 0; iter < 80; iter++) {
        // Repulsion
        for (let a = 0; a < nodes.length; a++) {
          for (let b = a + 1; b < nodes.length; b++) {
            const dx = nodes[a].x - nodes[b].x;
            const dy = nodes[a].y - nodes[b].y;
            const d  = Math.sqrt(dx * dx + dy * dy) || 1;
            const f  = 3000 / (d * d);
            nodes[a].vx += dx / d * f;
            nodes[a].vy += dy / d * f;
            nodes[b].vx -= dx / d * f;
            nodes[b].vy -= dy / d * f;
          }
        }
        // Attraction along edges
        const nodeMap = {};
        nodes.forEach(n => { nodeMap[n.id] = n; });
        edges.forEach(({ from, to }) => {
          const a = nodeMap[from], b = nodeMap[to];
          if (!a || !b) return;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d  = Math.sqrt(dx * dx + dy * dy) || 1;
          const f  = d / 120;
          a.vx += dx / d * f; a.vy += dy / d * f;
          b.vx -= dx / d * f; b.vy -= dy / d * f;
        });
        // Centre gravity
        nodes.forEach(n => {
          n.vx += (cx - n.x) * 0.008;
          n.vy += (cy - n.y) * 0.008;
        });
        // Apply + dampen
        nodes.forEach(n => {
          n.x += n.vx * 0.28; n.y += n.vy * 0.28;
          n.vx *= 0.55; n.vy *= 0.55;
          n.x = Math.max(60, Math.min(W - 60, n.x));
          n.y = Math.max(30, Math.min(H - 30, n.y));
        });
      }

      ctx.clearRect(0, 0, W, H);

      // Draw edges
      const nodeMap2 = {};
      nodes.forEach(n => { nodeMap2[n.id] = n; });
      ctx.lineWidth = 1.5;
      edges.forEach(({ from, to }) => {
        const a = nodeMap2[from], b = nodeMap2[to];
        if (!a || !b) return;
        ctx.strokeStyle = 'rgba(125,181,74,0.3)';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });

      // Draw nodes
      nodes.forEach(n => {
        const col = getColor(n.subject);
        ctx.beginPath();
        ctx.arc(n.x, n.y, 10, 0, Math.PI * 2);
        ctx.fillStyle = col + '33';
        ctx.fill();
        ctx.strokeStyle = col;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#E8DFD0';
        ctx.font = 'bold 11px Poppins, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const label = n.title.length > 16 ? n.title.slice(0, 14) + '…' : n.title;
        ctx.fillText(label, n.x, n.y + 14);
      });

      return { nodes, edges };
    }

    let graphNodes = [];

    function openGraph() {
      modal.classList.remove('hidden');
      const result = drawGraph();
      graphNodes = result ? result.nodes : [];
    }

    function closeGraph() {
      modal.classList.add('hidden');
    }

    btn.addEventListener('click', openGraph);
    closeBtn.addEventListener('click', closeGraph);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeGraph(); });

    // Node click → highlight resource card
    canvas.addEventListener('click', function (e) {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const hit = graphNodes.find(n => Math.hypot(n.x - mx, n.y - my) < 14);
      if (hit) {
        closeGraph();
        const board = $('resources-board');
        const cards = board ? Array.from(board.querySelectorAll('.dm-res-card')) : [];
        const card = cards.find(c => {
          const t = c.querySelector('.dm-res-card-title');
          return t && t.textContent.trim().toLowerCase() === hit.title.toLowerCase();
        });
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.style.outline = '2px solid var(--sprout)';
          setTimeout(() => { card.style.outline = ''; }, 1600);
        }
      }
    });

    // Hover cursor
    canvas.addEventListener('mousemove', function (e) {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      canvas.style.cursor = graphNodes.some(n => Math.hypot(n.x - mx, n.y - my) < 14) ? 'pointer' : 'default';
    });
  })();

  /* ══════════════════════════════════════════
     PDF VIEWER — annotation, chat, summary
  ══════════════════════════════════════════ */
  (function initPdfViewer() {
    const modal       = $('pdf-viewer-modal');
    const closeBtn    = $('pdf-viewer-close');
    const canvas      = $('pdf-canvas');
    const textLayer   = $('pdf-text-layer');
    const hlLayer     = $('pdf-highlight-layer');
    const pageLabel   = $('pdf-page-label');
    const prevBtn     = $('pdf-prev');
    const nextBtn     = $('pdf-next');
    const loadingEl   = $('pdf-loading');
    const filenameEl  = $('pdf-viewer-filename');
    if (!modal || !canvas) return;

    const ctx = canvas.getContext('2d');
    let pdfDoc       = null;
    let currentPage  = 1;
    let currentPdfId = null;
    let renderTask   = null;
    let viewport     = null;
    let pdfTextCache = null; // extracted full text cache

    /* --- Annotations IndexedDB helpers --- */
    async function getAnn(pdfId, pageNum) {
      const db  = await openPdfDb();
      const key = pdfId + '__p' + pageNum;
      return new Promise((res, rej) => {
        const req = db.transaction('annotations', 'readonly').objectStore('annotations').get(key);
        req.onsuccess = () => res(req.result || { highlights: [], bookmarks: [] });
        req.onerror   = () => rej(req.error);
      });
    }
    async function setAnn(pdfId, pageNum, data) {
      const db  = await openPdfDb();
      const key = pdfId + '__p' + pageNum;
      return new Promise((res, rej) => {
        const tx = db.transaction('annotations', 'readwrite');
        tx.objectStore('annotations').put(data, key);
        tx.oncomplete = res;
        tx.onerror    = () => rej(tx.error);
      });
    }
    async function getAllAnn(pdfId) {
      const db = await openPdfDb();
      return new Promise((res, rej) => {
        const results = [];
        const req = db.transaction('annotations', 'readonly')
                      .objectStore('annotations').openCursor();
        req.onsuccess = e => {
          const c = e.target.result;
          if (!c) { res(results); return; }
          if (c.key.startsWith(pdfId + '__p')) {
            const pn = parseInt(c.key.split('__p')[1], 10);
            (c.value.highlights || []).forEach(h => results.push({ ...h, pageNum: pn }));
          }
          c.continue();
        };
        req.onerror = () => rej(req.error);
      });
    }
    async function getAllBookmarks(pdfId) {
      if (!pdfDoc) return [];
      const allBookmarks = [];
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        const ann = await getAnn(pdfId, p);
        (ann.bookmarks || []).forEach(b => allBookmarks.push({ pageNum: p, ...b }));
      }
      return allBookmarks;
    }

    /* --- Open viewer --- */
    window.openPdfViewer = async function(pdfId, title, arrayBuffer) {
      currentPdfId  = pdfId;
      currentPage   = 1;
      pdfTextCache  = null;
      filenameEl.textContent = title;
      modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      loadingEl.classList.remove('hidden');
      canvas.style.display = 'none';

      try {
        const pdfjsLib = window._pdfjsLib;
        pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        loadingEl.classList.add('hidden');
        canvas.style.display = '';
        await renderPage(currentPage);
        loadPageSummary(pdfId, currentPage);
        refreshAnnotationsTab();
      } catch (err) {
        loadingEl.textContent = 'Could not render PDF.';
      }
    };

    /* --- Render a page --- */
    async function renderPage(num) {
      if (!pdfDoc) return;
      if (renderTask) { renderTask.cancel(); renderTask = null; }
      currentPage = Math.max(1, Math.min(num, pdfDoc.numPages));
      pageLabel.textContent = currentPage + ' / ' + pdfDoc.numPages;
      prevBtn.disabled = currentPage <= 1;
      nextBtn.disabled = currentPage >= pdfDoc.numPages;

      const page = await pdfDoc.getPage(currentPage);
      viewport = page.getViewport({ scale: 1.5 });
      canvas.width  = viewport.width;
      canvas.height = viewport.height;
      renderTask = page.render({ canvasContext: ctx, viewport });
      await renderTask.promise;
      renderTask = null;

      await buildTextLayer(page, viewport);
      await loadHighlightLayer();
      if ($('pdf-chip-page')) {
        $('pdf-chip-page').dataset.msg = 'Explain page ' + currentPage + ' of this PDF in simple terms';
      }
      // Auto-refresh summary for the new page
      loadPageSummary(currentPdfId, currentPage);
    }

    /* --- Text layer (enables selection) --- */
    async function buildTextLayer(page, vp) {
      textLayer.innerHTML = '';
      textLayer.style.width  = vp.width  + 'px';
      textLayer.style.height = vp.height + 'px';
      const canvasRect = canvas.getBoundingClientRect();
      const wrapRect   = $('pdf-canvas-wrap').getBoundingClientRect();
      const offX = canvasRect.left - wrapRect.left + $('pdf-canvas-wrap').scrollLeft;
      const offY = canvasRect.top  - wrapRect.top  + $('pdf-canvas-wrap').scrollTop;
      textLayer.style.left = offX + 'px';
      textLayer.style.top  = offY + 'px';
      hlLayer.style.left   = offX + 'px';
      hlLayer.style.top    = offY + 'px';
      hlLayer.style.width  = vp.width  + 'px';
      hlLayer.style.height = vp.height + 'px';

      const tc = await page.getTextContent();
      tc.items.forEach(item => {
        if (!item.str) return;
        const tx = pdfjsLib.Util.transform(vp.transform, item.transform);
        const span = document.createElement('span');
        span.textContent = item.str;
        const scaleX = item.width / (item.str.length * 0.55 || 1);
        span.style.cssText = [
          'left:'        + tx[4] + 'px',
          'top:'         + (vp.height - tx[5]) + 'px',
          'font-size:'   + Math.abs(tx[3]) + 'px',
          'transform:'   + 'scaleX(' + (item.width && item.str.length ? scaleX : 1) + ')',
        ].join(';');
        textLayer.appendChild(span);
      });
    }

    const pdfjsLib = window._pdfjsLib;

    /* --- Extract all text (for chat & summary) --- */
    async function extractPdfText() {
      if (pdfTextCache) return pdfTextCache;
      if (!pdfDoc) return '';
      let text = '';
      for (let p = 1; p <= pdfDoc.numPages; p++) {
        const page = await pdfDoc.getPage(p);
        const tc   = await page.getTextContent();
        text += tc.items.map(i => i.str).join(' ') + '\n';
      }
      pdfTextCache = text;
      return text;
    }

    /* --- Highlight layer --- */
    async function loadHighlightLayer() {
      hlLayer.innerHTML = '';
      const ann = await getAnn(currentPdfId, currentPage);
      (ann.highlights || []).forEach(h => drawHighlight(h));
    }

    function drawHighlight(h) {
      (h.rects || []).forEach(r => {
        const div = document.createElement('div');
        div.className = 'pdf-highlight-div' + (h.note ? ' has-note' : '');
        div.style.cssText = 'left:' + r.x + 'px;top:' + r.y + 'px;width:' + r.w + 'px;height:' + r.h + 'px';
        div.title = h.note ? h.note : h.text.slice(0, 80);
        div.addEventListener('click', e => { e.stopPropagation(); openNoteEditor(h); });
        hlLayer.appendChild(div);
      });
    }

    /* --- Selection → annotation popover --- */
    const popover      = $('pdf-ann-popover');
    const annSelText   = $('pdf-ann-selected-text');
    const annSaveBtn   = $('pdf-ann-save');
    const annNoteBtn   = $('pdf-ann-note');
    const annCancelBtn = $('pdf-ann-cancel');
    const annNoteInput = $('pdf-ann-note-input');
    let pendingHighlight = null;

    textLayer.addEventListener('mouseup', function(e) {
      const sel  = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (!text || text.length < 2) return;

      const range  = sel.getRangeAt(0);
      const cRect  = canvas.getBoundingClientRect();
      const rects  = Array.from(range.getClientRects()).map(r => ({
        x: r.left - cRect.left,
        y: r.top  - cRect.top,
        w: r.width,
        h: r.height,
      })).filter(r => r.w > 0 && r.h > 0);

      if (!rects.length) return;
      pendingHighlight = { id: Date.now().toString(), text, rects, note: '' };
      annSelText.textContent = text.length > 80 ? text.slice(0, 80) + '…' : text;
      annNoteInput.value = '';
      annNoteInput.classList.add('hidden');
      popover.style.left = (e.clientX - 80) + 'px';
      popover.style.top  = (e.clientY - 100) + 'px';
      popover.classList.remove('hidden');
    });

    annSaveBtn.addEventListener('click', async () => {
      if (!pendingHighlight) return;
      pendingHighlight.note = annNoteInput.value.trim();
      const ann = await getAnn(currentPdfId, currentPage);
      ann.highlights.push(pendingHighlight);
      await setAnn(currentPdfId, currentPage, ann);
      popover.classList.add('hidden');
      pendingHighlight = null;
      window.getSelection()?.removeAllRanges();
      await loadHighlightLayer();
      refreshAnnotationsTab();
    });

    annNoteBtn.addEventListener('click', () => {
      annNoteInput.classList.toggle('hidden');
      if (!annNoteInput.classList.contains('hidden')) annNoteInput.focus();
      annSaveBtn.textContent = '💛 Save';
    });

    annCancelBtn.addEventListener('click', () => {
      popover.classList.add('hidden');
      pendingHighlight = null;
      window.getSelection()?.removeAllRanges();
    });

    document.addEventListener('mousedown', e => {
      if (!popover.classList.contains('hidden') && !popover.contains(e.target)) {
        popover.classList.add('hidden');
        pendingHighlight = null;
      }
    });

    /* --- Note editor (clicking existing highlight) --- */
    async function openNoteEditor(highlight) {
      annSelText.textContent = highlight.text.slice(0, 80);
      annNoteInput.value = highlight.note || '';
      annNoteInput.classList.remove('hidden');
      popover.style.left = '50%';
      popover.style.top  = '80px';
      popover.style.transform = 'translateX(-50%)';
      popover.classList.remove('hidden');
      annSaveBtn.textContent = '💾 Update note';
      const origSave = annSaveBtn.onclick;
      annSaveBtn.onclick = async () => {
        highlight.note = annNoteInput.value.trim();
        const ann = await getAnn(currentPdfId, currentPage);
        const idx = ann.highlights.findIndex(h => h.id === highlight.id);
        if (idx >= 0) ann.highlights[idx] = highlight;
        await setAnn(currentPdfId, currentPage, ann);
        popover.classList.add('hidden');
        popover.style.transform = '';
        annSaveBtn.textContent = '💛 Highlight';
        annSaveBtn.onclick = origSave;
        await loadHighlightLayer();
        refreshAnnotationsTab();
      };
    }

    /* --- Bookmarks --- */
    $('pdf-bookmark-page').addEventListener('click', async () => {
      const ann = await getAnn(currentPdfId, currentPage);
      if (!ann.bookmarks.find(b => b.pageNum === currentPage)) {
        ann.bookmarks.push({ pageNum: currentPage, label: 'Page ' + currentPage });
        await setAnn(currentPdfId, currentPage, ann);
        showGlobalAlert('Page ' + currentPage + ' bookmarked.', 'success');
        refreshAnnotationsTab();
      } else {
        showGlobalAlert('Page ' + currentPage + ' is already bookmarked.', 'info');
      }
    });

    /* --- Annotations tab refresh --- */
    async function refreshAnnotationsTab() {
      const list = $('pdf-annotations-list');
      if (!list) return;
      const [allHL, allBM] = await Promise.all([
        getAllAnn(currentPdfId),
        getAllBookmarks(currentPdfId),
      ]);
      list.innerHTML = '';
      if (!allBM.length && !allHL.length) {
        list.innerHTML = '<p class="pdf-ann-empty">No highlights yet. Select text on the PDF to highlight it.</p>';
        return;
      }
      if (allBM.length) {
        const lbl = document.createElement('div');
        lbl.className = 'pdf-ann-section-label';
        lbl.textContent = '🔖 Bookmarks';
        list.appendChild(lbl);
        allBM.forEach(b => {
          const el = document.createElement('div');
          el.className = 'pdf-bookmark-item';
          el.textContent = '🔖 ' + b.label;
          el.addEventListener('click', () => renderPage(b.pageNum));
          list.appendChild(el);
        });
      }
      if (allHL.length) {
        const lbl = document.createElement('div');
        lbl.className = 'pdf-ann-section-label';
        lbl.textContent = '💛 Highlights';
        list.appendChild(lbl);
        allHL.sort((a, b) => a.pageNum - b.pageNum).forEach(h => {
          const el = document.createElement('div');
          el.className = 'pdf-ann-item';
          el.innerHTML = '<div class="pdf-ann-item-page">Page ' + h.pageNum + '</div>'
            + '<div class="pdf-ann-item-text">' + escHtml(h.text.slice(0, 120)) + '</div>'
            + (h.note ? '<div class="pdf-ann-item-note">' + escHtml(h.note) + '</div>' : '');
          el.addEventListener('click', () => renderPage(h.pageNum));
          list.appendChild(el);
        });
      }
    }

    /* --- Page nav --- */
    prevBtn.addEventListener('click', () => renderPage(currentPage - 1));
    nextBtn.addEventListener('click', () => renderPage(currentPage + 1));
    document.addEventListener('keydown', e => {
      if (modal.classList.contains('hidden')) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') renderPage(currentPage + 1);
      if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   renderPage(currentPage - 1);
      if (e.key === 'Escape') closePdfViewer();
    });

    /* --- Tab switching --- */
    document.querySelectorAll('.pdf-tab-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.pdf-tab-trigger').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        $('pdf-tab-summary').classList.toggle('hidden', tab !== 'summary');
        $('pdf-tab-chat').classList.toggle('hidden', tab !== 'chat');
        $('pdf-tab-annotations').classList.toggle('hidden', tab !== 'annotations');
        if (tab === 'annotations') refreshAnnotationsTab();
      });
    });

    /* --- Close --- */
    function closePdfViewer() {
      modal.classList.add('hidden');
      document.body.style.overflow = '';
      pdfDoc = null;
      currentPdfId = null;
      pdfTextCache = null;
      textLayer.innerHTML = '';
      hlLayer.innerHTML = '';
      popover.classList.add('hidden');
    }
    closeBtn.addEventListener('click', closePdfViewer);

    /* ══ AI PAGE SUMMARY ══ */
    const SUMMARY_CACHE_KEY = 'studySyncPdfSummary_';

    async function extractPageText(pageNum) {
      if (!pdfDoc) return '';
      const page = await pdfDoc.getPage(pageNum);
      const tc   = await page.getTextContent();
      return tc.items.map(i => i.str).join(' ');
    }

    async function loadPageSummary(pdfId, pageNum) {
      const cacheKey = SUMMARY_CACHE_KEY + pdfId + '_p' + pageNum;
      const loadEl   = $('pdf-summary-loading');
      const bodyEl   = $('pdf-summary-body');
      if (!loadEl) return;

      const cached = localStorage.getItem(cacheKey);
      if (cached) { renderSummary(JSON.parse(cached), pageNum); return; }

      loadEl.innerHTML = '<div class="pdf-spinner"></div><p>Summarising page ' + pageNum + '…</p>';
      loadEl.classList.remove('hidden');
      if (bodyEl) bodyEl.classList.add('hidden');

      try {
        const text = await extractPageText(pageNum);
        if (!text.trim()) {
          loadEl.innerHTML = '<p style="color:#8FA88A;font-size:13px">No text found on this page.</p>';
          return;
        }
        const csrf = getCsrfToken();
        const res  = await fetch('/api/pdf-summary/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': csrf },
          body: JSON.stringify({ pdf_text: text, page_num: pageNum }),
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        localStorage.setItem(cacheKey, JSON.stringify(data));
        renderSummary(data, pageNum);
      } catch (err) {
        loadEl.innerHTML =
          '<p style="color:#8FA88A;font-size:13px;margin-bottom:6px">Could not summarise page ' + pageNum + '.</p>'
        + '<p style="color:rgba(201,149,42,0.7);font-size:11px;margin-bottom:10px;word-break:break-word">' + escHtml(String(err.message || err)) + '</p>'
        + '<button id="pdf-summary-retry" style="font-size:12px;padding:5px 14px;border-radius:7px;border:1px solid rgba(125,181,74,0.35);background:rgba(125,181,74,0.15);color:#7DB54A;cursor:pointer">↺ Try again</button>';
        const retryBtn = $('pdf-summary-retry');
        if (retryBtn) retryBtn.addEventListener('click', () => {
          localStorage.removeItem(cacheKey);
          loadEl.innerHTML = '<div class="pdf-spinner"></div><p>Summarising page ' + pageNum + '…</p>';
          loadPageSummary(pdfId, pageNum);
        });
      }
    }

    function renderSummary(data, pageNum) {
      $('pdf-summary-loading').classList.add('hidden');
      const body = $('pdf-summary-body');
      body.classList.remove('hidden');
      let html = '<div class="pdf-summary-page-label">Page ' + (pageNum || currentPage) + '</div>';
      if (data.summary) {
        html += '<div><div class="pdf-summary-section-title">📋 Summary</div>'
              + '<p class="pdf-summary-text">' + escHtml(data.summary) + '</p></div>';
      }
      if (data.key_concepts && data.key_concepts.length) {
        html += '<div><div class="pdf-summary-section-title">🔑 Key Concepts</div>'
              + '<div class="pdf-concepts-wrap">'
              + data.key_concepts.map(c => '<span class="pdf-concept-pill">' + escHtml(c) + '</span>').join('')
              + '</div></div>';
      }
      if (data.definitions && data.definitions.length) {
        html += '<div><div class="pdf-summary-section-title">📖 Terms</div>'
              + '<div class="pdf-defs-list">'
              + data.definitions.map(d =>
                  '<div class="pdf-def-row"><div class="pdf-def-term">' + escHtml(d.term) + '</div>'
                + '<div class="pdf-def-body">' + escHtml(d.definition) + '</div></div>'
                ).join('')
              + '</div></div>';
      }
      if (data.keywords && data.keywords.length) {
        html += '<div><div class="pdf-summary-section-title">🏷 Keywords</div>'
              + '<div class="pdf-keywords-wrap">'
              + data.keywords.map(k => '<span class="pdf-keyword-tag">' + escHtml(k) + '</span>').join('')
              + '</div></div>';
      }
      if (data.reading_time_mins) {
        html += '<div class="pdf-read-time">⏱ ~' + data.reading_time_mins + ' min read</div>';
      }
      body.innerHTML = html;
    }

    /* ══ AI CHAT ══ */
    const chatMessages = $('pdf-chat-messages');
    const chatInput    = $('pdf-chat-input');
    const chatSend     = $('pdf-chat-send');

    function getCsrfToken() {
      const m = document.cookie.match(/csrftoken=([^;]+)/);
      return m ? m[1] : '';
    }

    function appendPdfBubble(text, role) {
      const div = document.createElement('div');
      div.className = 'pdf-bubble pdf-bubble-' + role;
      if (role === 'ai') {
        div.innerHTML = typeof marked !== 'undefined' ? marked.parse(text) : escHtml(text);
      } else {
        div.textContent = text;
      }
      chatMessages.appendChild(div);
      chatMessages.scrollTop = chatMessages.scrollHeight;
      return div;
    }

    async function sendPdfChat(text) {
      if (!text.trim()) return;
      appendPdfBubble(text, 'user');
      chatInput.value = '';
      const thinking = appendPdfBubble('Thinking…', 'ai');
      thinking.classList.add('pdf-bubble-thinking');
      try {
        const pdfText = await extractPdfText();
        const res = await fetch('/api/pdf-chat/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrfToken() },
          body: JSON.stringify({ message: text, pdf_text: pdfText }),
        });
        const data = await res.json();
        thinking.remove();
        appendPdfBubble(data.reply || data.error || 'Something went wrong.', 'ai');
      } catch {
        thinking.remove();
        appendPdfBubble('Network error — please try again.', 'ai');
      }
    }

    chatSend.addEventListener('click', () => sendPdfChat(chatInput.value));
    chatInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendPdfChat(chatInput.value); }
    });

    document.querySelectorAll('.pdf-chat-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const msg = chip.dataset.msg || chip.textContent;
        sendPdfChat(msg);
        document.querySelectorAll('.pdf-tab-trigger').forEach(b => b.classList.remove('active'));
        const chatTrigger = document.querySelector('.pdf-tab-trigger[data-tab="chat"]');
        if (chatTrigger) chatTrigger.classList.add('active');
        $('pdf-tab-summary').classList.add('hidden');
        $('pdf-tab-chat').classList.remove('hidden');
        $('pdf-tab-annotations').classList.add('hidden');
      });
    });
  })();

  /* -- AI STUDY COACH -- */
  (function initCoach() {
    const sidebar    = $('coach-sidebar');
    const toggleBtn  = $('coach-toggle');
    const closeBtn   = $('coach-close');
    const messagesEl = $('coach-messages');
    const input      = $('coach-input');
    const sendBtn    = $('coach-send');
    if (!sidebar || !toggleBtn) return;

    let isOpen = false;

    function openCoach() {
      isOpen = true;
      sidebar.classList.remove('hidden');
      sidebar.classList.add('coach-open');
      input.focus();
    }

    function closeCoach() {
      isOpen = false;
      sidebar.classList.remove('coach-open');
      sidebar.classList.add('hidden');
    }

    toggleBtn.addEventListener('click', () => isOpen ? closeCoach() : openCoach());
    closeBtn.addEventListener('click', closeCoach);

    function appendBubble(text, role) {
      const div = document.createElement('div');
      div.className = role === 'user' ? 'coach-bubble coach-bubble-user' : 'coach-bubble coach-bubble-ai';
      if (role === 'ai') {
        div.innerHTML = typeof marked !== 'undefined' ? marked.parse(text) : text;
      } else {
        div.textContent = text;
      }
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return div;
    }

    function getCsrf() {
      const m = document.cookie.match(/csrftoken=([^;]+)/);
      return m ? m[1] : '';
    }

    async function sendMessage(text) {
      if (!text.trim()) return;
      appendBubble(text, 'user');
      input.value = '';
      const thinking = appendBubble('…', 'ai');
      thinking.classList.add('coach-thinking');

      try {
        const payload = {
          message: text,
          notes:   refs.slice(0, 10).map(r => ({ title: r.title, body: r.notes || r.url })),
          subject: planSubject || 'General',
        };
        const res = await fetch('/api/study-coach/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCsrf() },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        thinking.remove();
        appendBubble(data.reply || data.error || 'Something went wrong.', 'ai');
      } catch (err) {
        thinking.remove();
        appendBubble('Network error — please try again.', 'ai');
      }
    }

    sendBtn.addEventListener('click', () => sendMessage(input.value));
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input.value); } });

    document.querySelectorAll('.coach-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (!isOpen) openCoach();
        sendMessage(chip.dataset.msg);
      });
    });
  })();

  /* -- DICTIONARY LOOKUP -- */
  (function initDictionary() {
    const tooltip  = $('dm-dict-tooltip');
    const popup    = $('dm-dict-popup');
    const wordEl   = $('dm-dict-word');
    const phoneEl  = $('dm-dict-phonetic');
    const bodyEl   = $('dm-dict-body');
    const audioBtn = $('dm-dict-audio');
    const closeBtn = $('dm-dict-close');
    if (!tooltip || !popup) return;

    let audioSrc = null;
    let pendingWord = '';

    function hideAll() {
      tooltip.classList.add('hidden');
      popup.classList.add('hidden');
    }

    function positionNear(x, y, el) {
      const vw = window.innerWidth, vh = window.innerHeight;
      let left = x + 8, top = y + 8;
      // Prevent overflow
      const W = 260, H = 180;
      if (left + W > vw - 8) left = Math.max(8, x - W - 4);
      if (top + H > vh - 60) top = Math.max(8, y - H - 4);
      el.style.left = left + 'px';
      el.style.top  = top + 'px';
    }

    async function lookupWord(word, x, y) {
      tooltip.classList.add('hidden');
      popup.classList.remove('hidden');
      wordEl.textContent   = word;
      phoneEl.textContent  = '';
      bodyEl.innerHTML     = '<span class="dm-dict-loading">Looking up…</span>';
      audioBtn.style.display = 'none';
      audioSrc = null;
      positionNear(x, y, popup);

      try {
        const res  = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
        if (!res.ok) throw new Error('not found');
        const data = await res.json();
        const entry = data[0];

        // Phonetic
        phoneEl.textContent = entry.phonetic || (entry.phonetics || []).find(p => p.text)?.text || '';

        // Audio
        const audioEntry = (entry.phonetics || []).find(p => p.audio);
        if (audioEntry) { audioSrc = audioEntry.audio; audioBtn.style.display = ''; }

        // Build definitions
        let html = '';
        (entry.meanings || []).slice(0, 2).forEach(m => {
          html += `<p class="dm-dict-pos">${m.partOfSpeech}</p>`;
          (m.definitions || []).slice(0, 2).forEach((d, i) => {
            html += `<p class="dm-dict-def"><span class="dm-dict-num">${i + 1}.</span> ${d.definition}</p>`;
            if (d.example) html += `<p class="dm-dict-example">"${d.example}"</p>`;
          });
        });
        bodyEl.innerHTML = html || '<p class="dm-dict-def">No definitions found.</p>';
      } catch {
        bodyEl.innerHTML = '<p class="dm-dict-def">Word not found in dictionary.</p>';
      }
    }

    document.addEventListener('mouseup', function (e) {
      if (popup.contains(e.target) || tooltip.contains(e.target)) return;
      const sel  = window.getSelection();
      const word = sel ? sel.toString().trim() : '';
      // Only trigger for single words (no spaces, 2+ chars)
      if (word && /^[a-zA-Z'-]{2,}$/.test(word) && !/\s/.test(word) && sel.rangeCount) {
        pendingWord = word;
        const range = sel.getRangeAt(0);
        const rect  = range.getBoundingClientRect();
        // tooltip/popup are position:fixed — use viewport coords (no scrollX/Y)
        tooltip.style.left = rect.left + 'px';
        tooltip.style.top  = (rect.bottom + 4) + 'px';
        tooltip.classList.remove('hidden');
        popup.classList.add('hidden');
      } else if (!popup.contains(e.target)) {
        hideAll();
      }
    });

    tooltip.addEventListener('click', function (e) {
      e.stopPropagation();
      // tooltip is fixed — left/top are already viewport coords
      const x = parseFloat(tooltip.style.left) || e.clientX;
      const y = parseFloat(tooltip.style.top)  || e.clientY;
      lookupWord(pendingWord, x, y + 20);
    });

    audioBtn.addEventListener('click', function () {
      if (audioSrc) new Audio(audioSrc).play();
    });

    closeBtn.addEventListener('click', hideAll);
    document.addEventListener('click', function (e) {
      if (!popup.contains(e.target) && !tooltip.contains(e.target)) hideAll();
    });
  })();

  /* -- DAY/NIGHT TOGGLE -- */
  (function() {
    const toggle = document.getElementById('dm-daynight-toggle');
    if (toggle) {
      const isDay = localStorage.getItem('dm-daymode') === 'true';
      if (isDay) {
        document.body.classList.add('dm-day');
        toggle.textContent = '☀️';
      }
      toggle.addEventListener('click', function() {
        const nowDay = !document.body.classList.contains('dm-day');
        document.body.classList.toggle('dm-day', nowDay);
        toggle.textContent = nowDay ? '☀️' : '🌙';
        localStorage.setItem('dm-daymode', nowDay);
      });
    }
  })();

  /* -- INIT -- */
  renderRefs(); updateSummary();
});