/* countdown.js — the exam countdown card on the Flashcards page. */
ssReady(() => {
  if (!document.getElementById('ec-set-btn')) return;
  const EC_KEY = 'studySyncExamCountdown';
  const $ = id => document.getElementById(id);
  const examPlan = null;

  /* ── Exam Countdown ── */
  function initCountdown() {
    const data = JSON.parse(localStorage.getItem(EC_KEY) || 'null');
    if (!data || !data.date) { showSetup(); return; }
    renderCountdown(data);
  }

  function showSetup() {
    const setup = $('ec-setup');
    const disp  = $('ec-display');
    if (setup) setup.style.display = 'flex';
    if (disp)  disp.classList.add('hidden');
  }

  let _cdInterval = null;

  function renderCountdown(data) {
    const setup = $('ec-setup');
    const disp  = $('ec-display');
    if (setup) setup.style.display = 'none';
    if (disp)  disp.classList.remove('hidden');

    if ($('ec-subject-display')) $('ec-subject-display').textContent = data.subject || '';

    // Build target from date + time (default 09:00 if no time saved)
    const [tH, tM] = (data.time || '09:00').split(':').map(Number);
    const targetDate = new Date(data.date);
    targetDate.setHours(tH, tM, 0, 0);

    // Show date + time on the label
    if ($('ec-date-line')) {
      const dateStr = targetDate.toLocaleDateString('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
      const timeStr = targetDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      $('ec-date-line').textContent = `${dateStr} at ${timeStr}`;
    }

    function pad(n) { return String(n).padStart(2, '0'); }

    function tick() {
      const target     = new Date(targetDate);
      const msLeft     = Math.max(0, target - new Date());
      const total      = Math.floor(msLeft / 1000);
      const days       = Math.floor(total / 86400);
      const hours      = Math.floor((total % 86400) / 3600);
      const mins       = Math.floor((total % 3600) / 60);
      const secs       = total % 60;
      const totalHours = Math.floor(total / 3600);

      // Show DAYS box only when 2+ full days remain; otherwise show total hours
      const showDays = totalHours >= 48;
      const daysBox  = $('ec-clock-days-box');
      if (daysBox) daysBox.style.display = showDays ? '' : 'none';

      if ($('ec-clock-days'))  $('ec-clock-days').textContent  = days;
      if ($('ec-clock-hours')) $('ec-clock-hours').textContent = pad(showDays ? hours : totalHours);
      if ($('ec-clock-mins'))  $('ec-clock-mins').textContent  = pad(mins);
      if ($('ec-clock-secs'))  $('ec-clock-secs').textContent  = pad(secs);

      ['ec-clock-days','ec-clock-hours','ec-clock-mins','ec-clock-secs'].forEach(id => {
        const el = $(id); if (el) el.style.color = '#3ac8b8';
      });

      const msgEl = $('ec-message');
      if (msgEl) {
        if (msLeft <= 0)          msgEl.textContent = 'The exam has passed.';
        else if (totalHours < 1)  msgEl.textContent = 'Exam in less than an hour — stay focused! 🔥';
        else if (totalHours < 12) msgEl.textContent = 'Exam TODAY — you\'ve got this! 💪';
        else if (totalHours < 48) msgEl.textContent = 'Exam very soon — do your final revision now! 🔥';
        else if (days <= 7)       msgEl.textContent = 'One week to go — keep the momentum.';
        else if (days <= 14)      msgEl.textContent = 'Two weeks out — build steady habits.';
        else                      msgEl.textContent = 'Plenty of time — plant the seeds now. 🌱';
      }

      if (msLeft <= 0) { clearInterval(_cdInterval); _cdInterval = null; }
    }

    if (_cdInterval) clearInterval(_cdInterval);
    tick();
    _cdInterval = setInterval(tick, 1000);
  }

  // Countdown set button
  const ecSetBtn = $('ec-set-btn');
  if (ecSetBtn) {
    ecSetBtn.addEventListener('click', () => {
      const subject = $('ec-subject').value.trim();
      const date    = $('ec-date').value;
      if (!subject || !date) { $('ec-error').classList.remove('hidden'); return; }
      $('ec-error').classList.add('hidden');
      const time = ($('ec-time') && $('ec-time').value) || '09:00';
      const data = { subject, date, time };
      localStorage.setItem(EC_KEY, JSON.stringify(data));
      renderCountdown(data);
    });
  }

  const ecEditBtn = $('ec-edit-btn');
  if (ecEditBtn) {
    ecEditBtn.addEventListener('click', () => showSetup());
  }

  // Init on load
  initCountdown();

  // Pre-fill countdown fields from saved countdown data or plan
  const _savedCd = JSON.parse(localStorage.getItem(EC_KEY) || 'null');
  if (_savedCd) {
    if ($('ec-date'))    $('ec-date').value    = _savedCd.date    || '';
    if ($('ec-time'))    $('ec-time').value    = _savedCd.time    || '09:00';
    if ($('ec-subject')) $('ec-subject').value = _savedCd.subject || '';
  } else if (examPlan && examPlan.deadline) {
    if ($('ec-date'))    $('ec-date').value    = examPlan.deadline;
    if ($('ec-subject')) $('ec-subject').value = examPlan.subject || '';
  }

});
