/* ============================================================
   StudySync — onboarding.js
   Handles the two-step first-visit modal:
     Step 1: Grade picker (6–13)
     Step 2: Subjects (chip input)
   Saves { grade, subjects } to localStorage as 'studySyncProfile'
   Dispatches 'studysync:onboarding-done' when finished.
   Exposes window.studySyncOpenProfile() to reopen pre-filled.
============================================================ */

(function () {
  'use strict';

  const backdrop   = document.getElementById('ob-backdrop');
  const card       = document.getElementById('ob-card');
  const step1      = document.getElementById('ob-step-1');
  const step2      = document.getElementById('ob-step-2');
  const dots       = document.querySelectorAll('.ob-dot');

  const gradeNum   = document.getElementById('ob-grade-num');
  const gradeDown  = document.getElementById('ob-grade-down');
  const gradeUp    = document.getElementById('ob-grade-up');
  const step1Next  = document.getElementById('ob-step1-next');

  const subjectInput = document.getElementById('ob-subject-input');
  const subjectAdd   = document.getElementById('ob-subject-add');
  const chipsWrap    = document.getElementById('ob-chips');
  const chipsEmpty   = document.getElementById('ob-chips-empty');
  const subjectError = document.getElementById('ob-subject-error');
  const step2Finish  = document.getElementById('ob-step2-finish');
  const obClose = document.getElementById('ob-close');

  let grade = 10;
  const MIN_GRADE = 6;
  const MAX_GRADE = 13;
  let subjects = [];

  /* ── Grade controls ── */
  function updateGradeDisplay() {
    gradeNum.textContent = grade;
    gradeDown.disabled = grade <= MIN_GRADE;
    gradeUp.disabled   = grade >= MAX_GRADE;
  }
  obClose.addEventListener('click', () => {
  backdrop.classList.add('ob-gone');
});

  gradeDown.addEventListener('click', () => {
    if (grade > MIN_GRADE) { grade--; updateGradeDisplay(); }
  });
  gradeUp.addEventListener('click', () => {
    if (grade < MAX_GRADE) { grade++; updateGradeDisplay(); }
  });

  updateGradeDisplay();

  /* ── Step navigation ── */
  step1Next.addEventListener('click', () => {
    step1.classList.add('ob-step--hidden');
    step2.classList.remove('ob-step--hidden');
    dots[0].classList.remove('ob-dot--active');
    dots[1].classList.add('ob-dot--active');
    subjectInput.focus();
  });

  /* ── Chips ── */
  function renderChips() {
    Array.from(chipsWrap.children).forEach(el => {
      if (el !== chipsEmpty) el.remove();
    });
    if (subjects.length === 0) {
      chipsEmpty.style.display = '';
    } else {
      chipsEmpty.style.display = 'none';
      subjects.forEach((sub, i) => {
        const chip = document.createElement('span');
        chip.className = 'ob-chip';
        chip.innerHTML = sub + ' <button class="ob-chip-remove" aria-label="Remove ' + sub + '">&times;</button>';
        chip.querySelector('button').addEventListener('click', () => {
          subjects.splice(i, 1);
          renderChips();
        });
        chipsWrap.appendChild(chip);
      });
    }
  }

  function addSubject() {
    const val = subjectInput.value.trim();
    if (!val) return;
    if (subjects.map(s => s.toLowerCase()).includes(val.toLowerCase())) {
      subjectInput.value = '';
      return;
    }
    subjects.push(val);
    subjectInput.value = '';
    renderChips();
    subjectError.classList.add('ob-error--hidden');
    subjectInput.focus();
  }

  subjectAdd.addEventListener('click', addSubject);
  subjectInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); addSubject(); }
  });

  /* ── Open modal — pass saved profile to prefill, or null for fresh ── */
  function openModal(prefill) {
    grade    = prefill ? (prefill.grade    || 10)              : 10;
    subjects = prefill ? [...(prefill.subjects || [])]         : [];

    updateGradeDisplay();
    renderChips();

    /* Reset to step 1 */
    step1.classList.remove('ob-step--hidden');
    step2.classList.add('ob-step--hidden');
    dots[0].classList.add('ob-dot--active');
    dots[1].classList.remove('ob-dot--active');

    card.style.transition = '';
    card.style.transform  = '';
    card.style.opacity    = '';

    backdrop.classList.remove('ob-gone');
  }

  /* ── Save & close ── */
  step2Finish.addEventListener('click', () => {
    if (subjects.length === 0) {
      subjectError.classList.remove('ob-error--hidden');
      subjectInput.focus();
      return;
    }
    subjectError.classList.add('ob-error--hidden');

    const profile = { grade, subjects };
    localStorage.setItem('studySyncProfile', JSON.stringify(profile));

    populateSubjectSelect(subjects);

    const badge    = document.getElementById('hero-grade-badge');
    const badgeTxt = document.getElementById('hero-grade-text');
    if (badge && badgeTxt) {
      badgeTxt.textContent = 'Grade ' + grade;
      badge.classList.remove('hidden');
    }

    card.style.transition = 'transform .3s ease, opacity .3s ease';
    card.style.transform  = 'scale(0.94)';
    card.style.opacity    = '0';

    setTimeout(() => {
      backdrop.classList.add('ob-gone');
      card.style.transition = '';
      card.style.transform  = '';
      card.style.opacity    = '';
      document.dispatchEvent(new CustomEvent('studysync:onboarding-done'));
    }, 320);
  });

  /* ── Populate subject <select> ── */
  function populateSubjectSelect(subs) {
    const sel = document.querySelector('[data-subject-select]');
    if (!sel) return;
    sel.innerHTML = '<option value="">Pick a subject\u2026</option>';
    subs.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      sel.appendChild(opt);
    });
    const other = document.createElement('option');
    other.value = 'Other'; other.textContent = 'Other';
    sel.appendChild(other);
  }

  /* ── On page load: populate select if profile exists ── */
  ssReady(() => {
    const saved = JSON.parse(localStorage.getItem('studySyncProfile') || 'null');
    if (saved && saved.subjects) populateSubjectSelect(saved.subjects);
  });

  /* ── Public API ── */
  window.studySyncShowOnboarding = function () { openModal(null); };
  window.studySyncOpenProfile    = function () {
    const saved = JSON.parse(localStorage.getItem('studySyncProfile') || 'null');
    openModal(saved);
  };
  /* legacy alias */
  window.studySyncResetProfile = window.studySyncOpenProfile;

})();