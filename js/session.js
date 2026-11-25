// =====================================================================
// session.js — remembers where the player is in the journey.
//
// We use sessionStorage: it lives only while this browser tab is open,
// and it never leaves the phone. Everything is stored under ONE key,
// "ssl_state", as a JSON string.
//
// Two modes:
//   survey (default) -> the result is saved once to the batch report
//   demo   (?demo)   -> for the stage presentation, never saves anything
// =====================================================================

const STORAGE_KEY = 'ssl_state';

// A fresh, empty state for a new player.
function newState(mode) {
  return {
    sessionId: makeId(),
    mode: mode, // 'survey' or 'demo'
    confidence: null, // 1-5 stars
    traps: { camera: null, location: null, notify: null },
    rounds: [], // [{ id, correct, timeMs }]
    story: null, // { escaped, choices }
    saved: false,
  };
}

// Random anonymous ID, e.g. "3f6c...". Not linked to the person at all.
function makeId() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  // Fallback for very old browsers.
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

// true if the page URL contains ?demo (or &demo).
function urlWantsDemo() {
  const params = new URLSearchParams(window.location.search);
  return params.has('demo');
}

// Read the state. Returns null if this tab has no state yet.
export function readState() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null; // storage blocked or broken JSON
  }
}

// Save the whole state object.
export function writeState(state) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    // Private mode may block storage. The site still works, it just
    // won't remember progress between pages.
  }
}

// Get the state, creating it if needed. Also switches to demo mode if
// the URL has ?demo (demo mode then sticks for the whole tab).
export function getState() {
  let state = readState();
  if (!state) {
    state = newState(urlWantsDemo() ? 'demo' : 'survey');
    writeState(state);
  } else if (urlWantsDemo() && state.mode !== 'demo') {
    state.mode = 'demo';
    writeState(state);
  }
  return state;
}

// Change part of the state: updateState(s => { s.confidence = 4; })
export function updateState(changeFn) {
  const state = getState();
  changeFn(state);
  writeState(state);
  return state;
}

// Start over (keeps the current mode).
export function resetState() {
  const old = readState();
  const mode = old ? old.mode : (urlWantsDemo() ? 'demo' : 'survey');
  const state = newState(mode);
  writeState(state);
  return state;
}

export function isDemo() {
  const state = readState();
  if (state) return state.mode === 'demo';
  return urlWantsDemo();
}

// Build a link that keeps ?demo when we are in demo mode.
export function pageLink(page) {
  return isDemo() ? page + '?demo' : page;
}

// Has the player done the steps a page needs? Used to show the
// friendly "Start from the beginning" card on direct visits.
export function hasProgress(requirement) {
  const state = readState();
  if (!state) return false;
  if (requirement === 'confidence') return state.confidence !== null;
  if (requirement === 'rounds') return state.rounds.length > 0;
  if (requirement === 'story') return state.story !== null;
  return true;
}
