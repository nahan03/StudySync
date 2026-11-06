/* library.js — resources, PDF reader, notes graph and the AI study coach.
   A standalone tool: it has nothing to do with the timer or any study "mode". */
ssReady(function () {
  if (!document.getElementById('add-resource-btn')) return;

  const REFS_KEY = 'studySyncDailyRefs';
  const $ = id => document.getElementById(id);
  let refs = JSON.parse(localStorage.getItem(REFS_KEY)) || [];
  const updateSummary = () => {};

  /* the subject the coach should talk about: remembered between visits, defaults to what you last studied */
  const SUBJ_KEY = 'studySyncCoachSubject';
  function lastStudied() { try { return (JSON.parse(localStorage.getItem('studySyncStudyPrefs') || '{}').subject || '').trim(); } catch (e) { return ''; } }
  let planSubject = (localStorage.getItem(SUBJ_KEY) || lastStudied() || 'General').toLowerCase();
  const subjInput = $('tool-subject-input');
  if (subjInput) {
    subjInput.value = planSubject === 'general' ? '' : planSubject;
    subjInput.addEventListener('input', () => { planSubject = (subjInput.value.trim() || 'General').toLowerCase(); localStorage.setItem(SUBJ_KEY, planSubject); });
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