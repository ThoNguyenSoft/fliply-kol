/**
 * Fliply Captain Signup — Typeform-style multi-step form
 *
 * Submission: POSTs JSON to CONFIG.endpoint. Dev team should swap the
 * endpoint URL to your internal API. A localStorage backup is always saved
 * under `fliply.signup.backup` so nothing is lost if the network is down.
 */

const CONFIG = {
  // >>> DEV TEAM: change this to your internal backend endpoint <<<
  endpoint: '/api/captain-signup',
  storageKey: 'fliply.signup.backup',
  draftKey: 'fliply.signup.draft',
  source: 'fliply-one-pager'
};

const state = {
  current: 0,
  slides: [],
  answers: {},
  submitting: false
};

const progressFill = document.getElementById('progressFill');
const navPrev = document.getElementById('navPrev');
const navNext = document.getElementById('navNext');
const thanksNameEl = document.getElementById('thanksName');

function init() {
  state.slides = Array.from(document.querySelectorAll('.slide'));
  loadDraft();
  bindSlideActions();
  bindNavControls();
  bindKeyboard();
  goTo(0, { skipTransition: true });
}

/* ===== Navigation ===== */

function goTo(index, opts = {}) {
  if (index < 0 || index >= state.slides.length) return;
  const prev = state.slides[state.current];
  const next = state.slides[index];
  if (!next) return;

  if (prev && prev !== next) {
    prev.classList.remove('is-active');
    if (!opts.skipTransition) prev.classList.add('is-leaving');
    setTimeout(() => prev.classList.remove('is-leaving'), 500);
  }

  next.classList.add('is-active');
  state.current = index;
  updateProgress();
  updateNavButtons();
  focusCurrent();
}

function goNext() {
  if (state.submitting) return;
  const slide = state.slides[state.current];
  if (!slide) return;
  const type = slide.dataset.type;

  if (type === 'welcome') {
    goTo(state.current + 1);
    return;
  }
  if (type === 'loading' || type === 'thanks') return;
  if (type === 'error') return;

  if (!validateCurrent()) return;

  const action = slide.querySelector('[data-action]')?.dataset.action;
  if (action === 'submit') {
    submitForm();
    return;
  }
  goTo(state.current + 1);
}

function goPrev() {
  if (state.submitting) return;
  const slide = state.slides[state.current];
  if (slide && (slide.dataset.type === 'loading' || slide.dataset.type === 'thanks')) return;
  if (state.current > 0) goTo(state.current - 1);
}

function skipCurrent() {
  const slide = state.slides[state.current];
  if (!slide) return;
  clearCurrentValue(slide);
  goTo(state.current + 1);
}

/* ===== Progress + nav UI ===== */

function updateProgress() {
  const questionSlides = state.slides.filter(s => isQuestion(s));
  const currentSlide = state.slides[state.current];
  const qIndex = questionSlides.indexOf(currentSlide);
  let pct = 0;
  if (currentSlide.dataset.type === 'welcome') pct = 0;
  else if (['thanks', 'loading'].includes(currentSlide.dataset.type)) pct = 100;
  else if (qIndex >= 0) pct = ((qIndex + 1) / questionSlides.length) * 100;
  progressFill.style.width = `${pct}%`;
  const bar = progressFill.parentElement;
  if (bar) bar.setAttribute('aria-valuenow', Math.round(pct));
}

function updateNavButtons() {
  const slide = state.slides[state.current];
  const terminal = slide && ['loading', 'thanks', 'error'].includes(slide.dataset.type);
  navPrev.disabled = state.current === 0 || terminal;
  navNext.disabled = terminal || state.current >= state.slides.length - 1;
}

function isQuestion(slide) {
  return !['welcome', 'loading', 'thanks', 'error'].includes(slide.dataset.type);
}

/* ===== Focus management ===== */

function focusCurrent() {
  const slide = state.slides[state.current];
  if (!slide) return;
  const input = slide.querySelector('.q-input:not([hidden])');
  if (input) {
    setTimeout(() => input.focus({ preventScroll: true }), 300);
    return;
  }
  const firstChoice = slide.querySelector('.choice');
  if (firstChoice) setTimeout(() => firstChoice.focus({ preventScroll: true }), 300);
}

/* ===== Validation ===== */

function validateCurrent() {
  const slide = state.slides[state.current];
  const type = slide.dataset.type;
  const required = slide.dataset.required === 'true';
  const key = slide.dataset.key;
  const errorEl = slide.querySelector('.q-error');
  const clearError = () => { if (errorEl) errorEl.textContent = ''; };

  if (type === 'text' || type === 'email') {
    const input = slide.querySelector('.q-input:not([hidden])');
    const value = (input?.value || '').trim();
    input?.classList.remove('has-error');
    clearError();
    if (!value) {
      if (required) {
        showError(slide, 'This field is required.');
        input?.classList.add('has-error');
        return false;
      }
      state.answers[key] = '';
      saveDraft();
      return true;
    }
    if (type === 'email' && !isValidEmail(value)) {
      showError(slide, 'Please enter a valid email address.');
      input?.classList.add('has-error');
      return false;
    }
    if (slide.querySelector('input[type="url"]') && value && !isValidUrl(value)) {
      showError(slide, 'Please enter a valid URL (including https://).');
      input?.classList.add('has-error');
      return false;
    }
    state.answers[key] = value;
    saveDraft();
    return true;
  }

  if (type === 'single') {
    clearError();
    const selected = slide.querySelector('.choice.is-selected');
    if (!selected) {
      if (required) {
        showError(slide, 'Please pick one option.');
        return false;
      }
      state.answers[key] = '';
      saveDraft();
      return true;
    }
    let value = selected.dataset.value;
    // Handle "Other" with specify input
    if (selected.dataset.other === 'true') {
      const otherInput = slide.querySelector('[data-other-input]');
      const otherVal = (otherInput?.value || '').trim();
      if (!otherVal) {
        showError(slide, 'Please specify your platform.');
        otherInput?.focus();
        return false;
      }
      value = `Other: ${otherVal}`;
    }
    state.answers[key] = value;
    saveDraft();
    return true;
  }

  if (type === 'multi') {
    clearError();
    const selected = Array.from(slide.querySelectorAll('.choice.is-selected')).map(c => c.dataset.value);
    if (selected.length === 0 && required) {
      showError(slide, 'Please select at least one option.');
      return false;
    }
    state.answers[key] = selected;
    saveDraft();
    return true;
  }

  return true;
}

function showError(slide, msg) {
  const errorEl = slide.querySelector('.q-error');
  if (errorEl) errorEl.textContent = msg;
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isValidUrl(v) {
  try {
    const u = new URL(v.startsWith('http') ? v : `https://${v}`);
    return !!u.hostname.includes('.');
  } catch { return false; }
}

function clearCurrentValue(slide) {
  const type = slide.dataset.type;
  const key = slide.dataset.key;
  if (type === 'text' || type === 'email') {
    const input = slide.querySelector('.q-input:not([hidden])');
    if (input) input.value = '';
    state.answers[key] = '';
  } else if (type === 'single') {
    slide.querySelectorAll('.choice.is-selected').forEach(c => c.classList.remove('is-selected'));
    const otherInput = slide.querySelector('[data-other-input]');
    if (otherInput) { otherInput.value = ''; otherInput.hidden = true; }
    state.answers[key] = '';
  } else if (type === 'multi') {
    slide.querySelectorAll('.choice.is-selected').forEach(c => c.classList.remove('is-selected'));
    state.answers[key] = [];
  }
  saveDraft();
}

/* ===== Slide interactions ===== */

function bindSlideActions() {
  state.slides.forEach(slide => {
    const type = slide.dataset.type;

    // Input live-clear error
    slide.querySelectorAll('.q-input').forEach(input => {
      input.addEventListener('input', () => {
        input.classList.remove('has-error');
        const err = slide.querySelector('.q-error');
        if (err) err.textContent = '';
      });
    });

    // Button actions
    slide.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const action = btn.dataset.action;
        if (action === 'start' || action === 'next' || action === 'submit') goNext();
        else if (action === 'skip') skipCurrent();
        else if (action === 'retry') { goTo(state.slides.findIndex(s => s.dataset.key === 'squadSize')); }
      });
    });

    // Choice buttons
    const choices = slide.querySelectorAll('.choice');
    choices.forEach(choice => {
      choice.addEventListener('click', () => handleChoiceClick(slide, choice, type));
    });
  });
}

function handleChoiceClick(slide, choice, type) {
  if (type === 'single') {
    slide.querySelectorAll('.choice').forEach(c => c.classList.remove('is-selected'));
    choice.classList.add('is-selected');
    // "Other" behavior
    const otherInput = slide.querySelector('[data-other-input]');
    if (otherInput) {
      if (choice.dataset.other === 'true') {
        otherInput.hidden = false;
        setTimeout(() => otherInput.focus(), 100);
      } else {
        otherInput.hidden = true;
        otherInput.value = '';
      }
    }
    // Auto-advance for single-choice (small delay so user sees selection)
    if (choice.dataset.other !== 'true') {
      setTimeout(() => {
        if (state.slides[state.current] === slide) goNext();
      }, 350);
    }
  } else if (type === 'multi') {
    choice.classList.toggle('is-selected');
  }
}

/* ===== Keyboard ===== */

function bindKeyboard() {
  document.addEventListener('keydown', (e) => {
    const slide = state.slides[state.current];
    if (!slide) return;
    const type = slide.dataset.type;

    // Enter → advance
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.target && e.target.tagName === 'TEXTAREA') return;
      e.preventDefault();
      goNext();
      return;
    }

    // Tab / Shift+Tab already handled by browser for inputs; we do arrow keys for choices
    if (['single', 'multi'].includes(type)) {
      const choices = Array.from(slide.querySelectorAll('.choice'));
      if (!choices.length) return;
      const active = document.activeElement;
      let idx = choices.indexOf(active);
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        idx = idx < 0 ? 0 : (idx + 1) % choices.length;
        choices[idx].focus();
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        idx = idx < 0 ? choices.length - 1 : (idx - 1 + choices.length) % choices.length;
        choices[idx].focus();
      } else if (/^[a-z]$/i.test(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // Don't steal focus from typeable inputs (other-input)
        if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
        const letter = e.key.toUpperCase();
        const match = choices.find(c => c.querySelector('.choice-key')?.textContent === letter);
        if (match) {
          e.preventDefault();
          handleChoiceClick(slide, match, type);
        }
      }
    }
  });
}

/* ===== Nav buttons ===== */

function bindNavControls() {
  navPrev.addEventListener('click', goPrev);
  navNext.addEventListener('click', goNext);
}

/* ===== Draft / backup ===== */

function saveDraft() {
  try {
    localStorage.setItem(CONFIG.draftKey, JSON.stringify({
      answers: state.answers,
      current: state.current,
      ts: Date.now()
    }));
  } catch (e) { /* ignore */ }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem(CONFIG.draftKey);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || !data.answers) return;
    // Only restore if less than 24h old
    if (Date.now() - (data.ts || 0) > 24 * 3600 * 1000) return;
    state.answers = data.answers || {};
    restoreAnswersToDom();
  } catch (e) { /* ignore */ }
}

function restoreAnswersToDom() {
  state.slides.forEach(slide => {
    const key = slide.dataset.key;
    const type = slide.dataset.type;
    const val = state.answers[key];
    if (val == null) return;
    if (type === 'text' || type === 'email') {
      const input = slide.querySelector('.q-input:not([hidden])');
      if (input && typeof val === 'string') input.value = val;
    } else if (type === 'single') {
      const choices = slide.querySelectorAll('.choice');
      choices.forEach(c => {
        const cv = c.dataset.value;
        if (typeof val === 'string' && (val === cv || val.startsWith('Other:') && c.dataset.other === 'true')) {
          c.classList.add('is-selected');
          if (c.dataset.other === 'true') {
            const oi = slide.querySelector('[data-other-input]');
            if (oi) { oi.hidden = false; oi.value = val.replace(/^Other:\s*/, ''); }
          }
        }
      });
    } else if (type === 'multi') {
      if (Array.isArray(val)) {
        slide.querySelectorAll('.choice').forEach(c => {
          if (val.includes(c.dataset.value)) c.classList.add('is-selected');
        });
      }
    }
  });
}

function clearDraft() {
  try { localStorage.removeItem(CONFIG.draftKey); } catch (e) { /* ignore */ }
}

/* ===== Submission ===== */

async function submitForm() {
  if (state.submitting) return;
  state.submitting = true;

  const payload = {
    ...state.answers,
    submittedAt: new Date().toISOString(),
    source: CONFIG.source,
    userAgent: navigator.userAgent,
    locale: navigator.language
  };

  // Always save backup so data isn't lost
  try {
    const existing = JSON.parse(localStorage.getItem(CONFIG.storageKey) || '[]');
    existing.push(payload);
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(existing));
  } catch (e) { /* ignore */ }

  goToKey('loading');

  let success = false;
  try {
    const res = await fetch(CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    success = res.ok;
    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn('[Fliply signup] endpoint responded', res.status, '— payload saved to localStorage backup');
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[Fliply signup] network error — payload saved to localStorage backup', err);
  }

  // Always treat as success for UX (dev team wires backend later; backup is always saved)
  // Change this logic once the backend is live if you want hard-fail on errors.
  state.submitting = false;
  if (success) clearDraft();
  showThanks(payload.fullName);
}

function goToKey(key) {
  const idx = state.slides.findIndex(s => s.dataset.key === key);
  if (idx >= 0) goTo(idx);
}

function showThanks(name) {
  if (thanksNameEl && name) {
    const first = String(name).trim().split(/\s+/)[0] || 'Captain';
    thanksNameEl.textContent = first;
  }
  goToKey('thanks');
}

/* ===== Boot ===== */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
