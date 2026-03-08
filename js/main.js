/**
 * main.js — Women's Day Celebration Website
 *
 * Handles:
 *   1. Rendering the 10 numbered folder/document icons on Round pages.
 *   2. Opening a lightbox modal when a folder is clicked.
 *   3. Loading the correct image from  images/round2/  or  images/round3/
 *      (support .jpg, .jpeg, .png, .gif, .webp).
 *   4. Closing the lightbox on overlay-click, close-button, or Escape key.
 */

/* ─────────────────────────────────────────────────────────────
   SECTION 1 — Configuration
───────────────────────────────────────────────────────────── */
const FOLDER_COUNT_ROUND2 = 20;   // folders shown on Round 2 page
const FOLDER_COUNT_ROUND3 = 10;   // folders shown on Round 3 page
const FOLDER_COUNT_ROUND4 = 4;    // folders shown on Round 4 page

const TIMER_SECONDS = 15;         // countdown duration in seconds

// Supported image extensions (tried in this order)
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

// Active interval ID so we can cancel it when needed
let _timerInterval = null;

/* ─────────────────────────────────────────────────────────────
   SECTION 1c — Round 3 clue data
   Edit the two strings per entry to set your own hints.
   Keys 1-5  → Section 1 (Guess the Logo)
   Keys 6-10 → Section 2 (Guess the Famous Women in Tech)
───────────────────────────────────────────────────────────── */
const ROUND3_CLUES = {
  6: ['The world’s first computer programmer.', 'Wrote the first algorithm for the Analytical Engine'],
  7: ['Developed the first compiler for a machine.', 'Popularized the term "debugging" after finding a moth'],
  8: ['The visionary co-founder and CEO of Canva', 'Transformed graphic design into a simple, global tool'],
  9: ['The woman behind the Indian fintech giant MobiKwik', 'Ex-PayPal leader who pioneered digital wallets in India'],
  10: ['The first woman to chair a listed Indian IT firm, HCL', 'One of the world’s most powerful women in tech leadership'],
};

/* ─────────────────────────────────────────────────────────────
   SECTION 1b — Sound effects (Web Audio API, no files needed)
───────────────────────────────────────────────────────────── */

// Lazily created AudioContext — browsers require user gesture first
let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return _audioCtx;
}

/**
 * Single mechanical tick — a very short, high-pitched click.
 * Pitch escalates in the last 4 seconds to build urgency.
 *
 * @param {number} remaining — seconds left (used to pitch-shift)
 */
function playTick(remaining) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    // Higher pitch when almost out of time
    osc.type = 'square';
    osc.frequency.value = remaining <= 4 ? 1200 : 900;

    // Very short burst — sounds like a clock tick
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.start(now);
    osc.stop(now + 0.06);
  } catch (e) { /* AudioContext unavailable — silently ignore */ }
}

/**
 * Final buzzer — three descending tones that play when time's up.
 */
function playBuzzer() {
  try {
    const ctx = getAudioCtx();

    // Three tones: play one after another
    const tones = [
      { freq: 520, start: 0, dur: 0.18 },
      { freq: 380, start: 0.22, dur: 0.18 },
      { freq: 220, start: 0.44, dur: 0.45 },
    ];

    tones.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sawtooth';
      osc.frequency.value = freq;

      const t = ctx.currentTime + start;
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      osc.start(t);
      osc.stop(t + dur + 0.02);
    });
  } catch (e) { /* ignore */ }
}

/* ─────────────────────────────────────────────────────────────
   SECTION 2 — Lightbox helpers
───────────────────────────────────────────────────────────── */

/**
 * Creates the lightbox overlay element and appends it to <body>.
 * Returns a reference to the overlay so we can control it.
 */
function buildLightbox() {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.id = 'lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Image viewer');

  overlay.innerHTML = `
    <div class="lightbox-box" id="lightbox-box">
      <button class="lightbox-close" id="lightbox-close" aria-label="Close">&times;</button>
      <div class="lightbox-label" id="lightbox-label"></div>
      <!-- Row: image on the left, timer on the right — both inside the card -->
      <div class="lightbox-body">
        <div id="lightbox-content"></div>
        <!-- Timer injected here by buildTimer() -->
      </div>
      <!-- Clues panel — shown only for Round 3 -->
      <div class="lightbox-clues" id="lightbox-clues" hidden></div>
    </div>
  `;

  document.body.appendChild(overlay);

  /* Close when clicking outside the box — also stops the timer */
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { stopTimer(); closeLightbox(); }
  });

  /* Close button — also stops the timer */
  overlay.querySelector('#lightbox-close').addEventListener('click', () => {
    stopTimer();
    closeLightbox();
  });

  /* Close on Escape key — also stops the timer */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { stopTimer(); closeLightbox(); }
  });

  /* Close on overlay click — also stops the timer */
  // (already handled above, just ensure timer stops)

  /* Build the timer UI once (hidden until showImage runs) */
  buildTimer();

  return overlay;
}

/** Show the lightbox */
function openLightbox() {
  const lb = document.getElementById('lightbox');
  lb.classList.add('active');
  document.body.style.overflow = 'hidden'; // prevent background scroll
}

/** Hide the lightbox */
function closeLightbox() {
  const lb = document.getElementById('lightbox');
  lb.classList.remove('active');
  document.body.style.overflow = '';
}

/* ─────────────────────────────────────────────────────────────
   SECTION 2b — Countdown Timer
   A circular SVG ring that counts down from TIMER_SECONDS → 0.
   Colours: green (>8s) → orange (4–8s) → red (<4s).
───────────────────────────────────────────────────────────── */

/**
 * Builds the timer HTML and injects it after #lightbox-content.
 * Called once from buildLightbox().
 */
function buildTimer() {
  // SVG circumference for a circle radius 33 (2π×33 ≈ 207.3)
  const RADIUS = 33;
  const CIRC = +(2 * Math.PI * RADIUS).toFixed(2); // ≈ 207.35

  const wrap = document.createElement('div');
  wrap.className = 'timer-wrap';
  wrap.id = 'timer-wrap';

  wrap.innerHTML = `
    <div class="timer-badge">
      <!-- SVG ring -->
      <svg class="timer-svg" viewBox="0 0 80 80" aria-hidden="true">
        <!-- grey background track -->
        <circle class="timer-track" cx="40" cy="40" r="${RADIUS}"/>
        <!-- animated coloured ring -->
        <circle class="timer-ring" id="timer-ring"
                cx="40" cy="40" r="${RADIUS}"
                stroke-dasharray="${CIRC}"
                stroke-dashoffset="0"/>
      </svg>
      <!-- number in the centre -->
      <span class="timer-number" id="timer-number">${TIMER_SECONDS}</span>
    </div>
    <!-- shown only when time runs out -->
    <span class="timer-done" id="timer-done" style="display:none">Time's up!</span>
  `;

  // Insert timer into the .lightbox-body row (beside the image)
  const body = document.querySelector('.lightbox-body');
  body.appendChild(wrap);
}

/**
 * Stops any running timer, then starts a fresh 15-second countdown.
 * Updates the ring's stroke-dashoffset and colour every second.
 */
function startTimer() {
  stopTimer(); // clear any previous countdown

  const RADIUS = 33;
  const CIRC = +(2 * Math.PI * RADIUS).toFixed(2);

  const ring = document.getElementById('timer-ring');
  const numEl = document.getElementById('timer-number');
  const doneEl = document.getElementById('timer-done');

  // Reset display
  doneEl.style.display = 'none';
  numEl.style.display = '';
  ring.style.stroke = '#22c55e'; // green
  ring.setAttribute('stroke-dashoffset', '0');

  let remaining = TIMER_SECONDS;

  // Helper: update the ring each tick
  function tick() {
    // Update the displayed number
    numEl.textContent = remaining;

    // Compute how much of the ring to show
    const progress = remaining / TIMER_SECONDS;      // 1 → 0
    ring.setAttribute('stroke-dashoffset',
      String(CIRC * (1 - progress)));

    // Colour shift: green → orange → red
    if (remaining > 8) ring.style.stroke = '#22c55e'; // green
    else if (remaining > 3) ring.style.stroke = '#f97316'; // orange
    else ring.style.stroke = '#ef4444'; // red

    if (remaining === 0) {
      // Time's up! — play buzzer, show the message, then auto-close
      stopTimer();
      playBuzzer();
      numEl.style.display = 'none';
      doneEl.style.display = '';
      // Auto-close the lightbox after 1.5 seconds
      setTimeout(() => {
        closeLightbox();
      }, 1500);
      return;
    }

    // Play the tick sound for each passing second
    playTick(remaining);
    remaining--;
  }

  tick(); // run immediately so there's no 1s blank delay
  _timerInterval = setInterval(tick, 1000);
}

/** Cancels the active countdown interval if one is running. */
function stopTimer() {
  if (_timerInterval !== null) {
    clearInterval(_timerInterval);
    _timerInterval = null;
  }
}

/* ─────────────────────────────────────────────────────────────
   SECTION 3 — Image loading with fallback
───────────────────────────────────────────────────────────── */

/**
 * Tries to load an image from a list of candidate paths.
 * Resolves with the first path that loads successfully,
 * or rejects if none load.
 *
 * @param {string[]} paths — array of URL strings to try in order
 * @returns {Promise<string>}
 */
function tryLoadImage(paths) {
  return new Promise((resolve, reject) => {
    let index = 0;
    function attempt() {
      if (index >= paths.length) { reject(new Error('No image found')); return; }
      const img = new Image();
      img.onload = () => resolve(paths[index]);
      img.onerror = () => { index++; attempt(); };
      img.src = paths[index];
    }
    attempt();
  });
}

/**
 * Build the list of candidate image paths for a given round & number.
 *
 * Convention: place images at  images/round2/1.jpg  (or .png, etc.)
 *
 * @param {string} roundFolder — e.g. 'round2' or 'round3'
 * @param {number} num         — folder number (1 – 10)
 * @returns {string[]}
 */
function candidatePaths(roundFolder, num) {
  return IMAGE_EXTENSIONS.map(ext => `images/${roundFolder}/${num}.${ext}`);
}

/* ─────────────────────────────────────────────────────────────
   SECTION 4 — Folder card HTML builder
───────────────────────────────────────────────────────────── */

/**
 * Returns the inner HTML for one folder/document icon card.
 * Matches the design: golden yellow rectangle with folded top-right corner.
 *
 * @param {number} num — the numeric label to display
 * @returns {string}
 */
function folderCardHTML(num) {
  return `
    <div class="doc-icon" aria-hidden="true">
      <div class="doc-body"></div>
      <div class="doc-fold"></div>
      <div class="doc-number">${num}</div>
    </div>
  `;
}

/* ─────────────────────────────────────────────────────────────
   SECTION 5 — Main initialisation
   Called automatically when DOM is ready.
───────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {

  /* ── Build the lightbox once ── */
  buildLightbox();

  /* ── Find ALL grid containers on this page ── */
  // Round 2 has one grid (#folders-grid), Round 3 has two (#folders-grid-1, #folders-grid-2).
  // We support both by querying every element with the .folders-grid class.
  const grids = document.querySelectorAll('.folders-grid');
  if (!grids.length) return; // not a round page, nothing more to do

  grids.forEach((grid) => {
    /* ── Read which round this grid belongs to ── */
    const roundFolder = grid.dataset.round;   // e.g. 'round2' or 'round3'
    const roundLabel = grid.dataset.label;   // e.g. 'Round 2' or 'Round 3'

    /* ── Determine the range of folder numbers to render ── */
    // If the grid carries data-start / data-end, honour them.
    // Otherwise fall back to the full range for the round.
    const folderCount = roundFolder === 'round2' ? FOLDER_COUNT_ROUND2
      : roundFolder === 'round4' ? FOLDER_COUNT_ROUND4
        : FOLDER_COUNT_ROUND3;
    const start = parseInt(grid.dataset.start, 10) || 1;
    const end = parseInt(grid.dataset.end, 10) || folderCount;

    // data-display-start lets a section show labels 1-N while loading images 6-10, etc.
    const displayStart = parseInt(grid.dataset.displayStart, 10) || start;

    /* ── Render folder cards for this range ── */
    for (let i = start; i <= end; i++) {
      const displayNum = displayStart + (i - start); // visible label on the card
      const card = document.createElement('div');
      card.className = 'folder-card';
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `${roundLabel} — Entry ${displayNum}`);
      card.innerHTML = folderCardHTML(displayNum); // show 1-5 on the card face

      /* ── Click handler → open lightbox with the image (uses real index i) ── */
      const num = i; // capture loop variable — image still loaded from index 6-10
      card.addEventListener('click', () => showImage(roundFolder, roundLabel, num));

      /* ── Keyboard (Enter / Space) support ── */
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          showImage(roundFolder, roundLabel, num);
        }
      });

      grid.appendChild(card);
    }
  });
});

/* ─────────────────────────────────────────────────────────────
   SECTION 6 — Show image in lightbox
───────────────────────────────────────────────────────────── */

/**
 * Attempts to load the image for a given folder number,
 * then displays it (or a placeholder) inside the lightbox.
 *
 * @param {string} roundFolder — 'round2' or 'round3'
 * @param {string} roundLabel  — 'Round 2' or 'Round 3'
 * @param {number} num         — folder number
 */
async function showImage(roundFolder, roundLabel, num) {
  const contentEl = document.getElementById('lightbox-content');
  const labelEl = document.getElementById('lightbox-label');

  /* Update the header label */
  labelEl.textContent = `${roundLabel}  —  Entry ${num}`;

  /* ── Clues panel — only for Round 3, Section 2 (Women in Tech, entries 6–10) ── */
  const cluesEl = document.getElementById('lightbox-clues');
  if (roundFolder === 'round3' && num >= 6 && ROUND3_CLUES[num]) {
    const [c1, c2] = ROUND3_CLUES[num];
    cluesEl.hidden = false;
    cluesEl.innerHTML = `
      <div class="clue-row">
        <span class="clue-badge">🔍 Clue 1</span>
        <p class="clue-text">${c1}</p>
      </div>
      <div class="clue-row">
        <span class="clue-badge clue-badge--2">💡 Clue 2</span>
        <p class="clue-text">${c2}</p>
      </div>
    `;
  } else {
    cluesEl.hidden = true;
    cluesEl.innerHTML = '';
  }

  /* Show a loading spinner while we try to resolve the image */
  contentEl.innerHTML = `
    <div class="lightbox-placeholder">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="1.5">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 6v6l4 2"/>
      </svg>
      Loading…
    </div>
  `;

  openLightbox();

  /* Start the 15-second countdown as soon as the lightbox opens */
  startTimer();

  try {
    /* Try each extension in order until one resolves */
    const src = await tryLoadImage(candidatePaths(roundFolder, num));

    contentEl.innerHTML = `<img src="${src}" alt="${roundLabel} entry ${num}">`;
  } catch {
    /* No image found — show a friendly placeholder */
    contentEl.innerHTML = `
      <div class="lightbox-placeholder">
        <!-- Document icon -->
        <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="#bbb" stroke-width="1.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="9" y1="13" x2="15" y2="13"/>
          <line x1="9" y1="17" x2="13" y2="17"/>
        </svg>
        <span>
          No image yet for <strong>${roundLabel} — Entry ${num}</strong>.<br>
          Add an image to<br>
          <code>images/${roundFolder}/${num}.jpg</code>
        </span>
      </div>
    `;
  }
}
