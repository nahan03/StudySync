/* Themed replacements for the browser's alert() and confirm().
 *   ssConfirm(message, {title, ok, cancel, danger}) -> Promise<boolean>
 *   ssAlert(message, {title}) -> Promise<void>      (window.alert now calls this)
 * The look comes from alert.css, so it follows the chosen theme. */
(function () {
  if (window.ssConfirm) return;
  function open(message, opts, withCancel) {
    opts = opts || {};
    return new Promise(resolve => {
      const prevFocus = document.activeElement;
      const scrim = document.createElement('div'); scrim.className = 'ss-dlg-scrim';
      const box = document.createElement('div'); box.className = 'ss-dlg';
      box.setAttribute('role', withCancel ? 'alertdialog' : 'dialog'); box.setAttribute('aria-modal', 'true');
      const h = document.createElement('h3'); h.textContent = opts.title || (withCancel ? 'Are you sure?' : 'Heads up');
      const p = document.createElement('p'); p.textContent = String(message == null ? '' : message);
      const row = document.createElement('div'); row.className = 'ss-dlg-actions';
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
        else if (e.key === 'Tab') {
          const f = [...box.querySelectorAll('button')]; const i = f.indexOf(document.activeElement);
          e.preventDefault(); f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
        }
      }
      function done(v) {
        document.removeEventListener('keydown', onKey, true);
        scrim.classList.remove('show'); setTimeout(() => scrim.remove(), 180);
        try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) { /* ignore */ }
        resolve(v);
      }
      function mk(label, cls, v) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'ss-dlg-btn ' + cls; b.textContent = label;
        b.addEventListener('click', () => done(v)); return b;
      }
      if (withCancel) row.appendChild(mk(opts.cancel || 'Cancel', '', false));
      const ok = mk(opts.ok || (withCancel ? 'Yes' : 'OK'), opts.danger ? 'danger' : 'primary', true); row.appendChild(ok);
      box.append(h, p, row); scrim.appendChild(box); document.body.appendChild(scrim);
      document.addEventListener('keydown', onKey, true);
      scrim.addEventListener('mousedown', e => { if (e.target === scrim) done(false); });
      requestAnimationFrame(() => { scrim.classList.add('show'); ok.focus(); });
    });
  }
  // ssPrompt(message, defaultValue, opts) -> Promise<string|null>
  window.ssPrompt = (message, def, opts) => {
    opts = opts || {};
    return new Promise(resolve => {
      const scrim = document.createElement('div'); scrim.className = 'ss-dlg-scrim';
      const box = document.createElement('form'); box.className = 'ss-dlg'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true');
      const h = document.createElement('h3'); h.textContent = opts.title || 'Enter a value';
      const p = document.createElement('p'); p.textContent = message;
      const inp = document.createElement('input'); inp.className = 'ss-dlg-input'; inp.type = 'text'; inp.value = def || ''; inp.maxLength = opts.maxLength || 80;
      const row = document.createElement('div'); row.className = 'ss-dlg-actions';
      const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'ss-dlg-btn'; cancel.textContent = 'Cancel';
      const ok = document.createElement('button'); ok.type = 'submit'; ok.className = 'ss-dlg-btn primary'; ok.textContent = opts.ok || 'OK';
      row.append(cancel, ok); box.append(h, p, inp, row); scrim.appendChild(box); document.body.appendChild(scrim);
      const done = v => { document.removeEventListener('keydown', onKey, true); scrim.classList.remove('show'); setTimeout(() => scrim.remove(), 180); resolve(v); };
      function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(null); } }
      document.addEventListener('keydown', onKey, true);
      box.addEventListener('submit', e => { e.preventDefault(); done(inp.value); });
      cancel.addEventListener('click', () => done(null));
      scrim.addEventListener('mousedown', e => { if (e.target === scrim) done(null); });
      requestAnimationFrame(() => { scrim.classList.add('show'); inp.focus(); inp.select(); });
    });
  };
  window.ssConfirm = (m, o) => open(m, o, true);
  window.ssAlert = (m, o) => open(m, o, false).then(() => {});
  window.alert = m => { window.ssAlert(m); };   // alert() cannot block, so the page carries on as before

  // <form data-confirm="Are you sure?"> asks first, then submits
  document.addEventListener('submit', e => {
    const f = e.target;
    if (!f || !f.matches || !f.matches('form[data-confirm]') || f._ssOk) return;
    e.preventDefault();
    window.ssConfirm(f.dataset.confirm, { danger: f.hasAttribute('data-confirm-danger'), ok: f.dataset.confirmOk })
      .then(ok => { if (ok) { f._ssOk = true; if (f.requestSubmit) f.requestSubmit(); else f.submit(); } });
  }, true);
})();
