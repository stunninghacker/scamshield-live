// =====================================================================
// score.js — Score Card (Page 9)
// Works out the awareness score, shows the badge, and (survey mode only)
// saves the anonymous result to the batch report — exactly once.
// =====================================================================

import { initPage, el, countUp, showToast, showStartOver, stars } from './ui.js';
import { readState, updateState, isDemo } from './session.js';
import { saveResult, isConfigured } from './firebase.js';

initPage();

const TOTAL_ROUNDS = 8;

// The formula (also shown on the page and the report):
//   round(correct / 8 × 60) + 10 per blocked trap (max 30) + 10 if escaped
export function awarenessScore(correct, traps, escaped) {
  let score = Math.round((correct / TOTAL_ROUNDS) * 60);
  let blocked = 0;
  for (const name of ['camera', 'location', 'notify']) {
    if (traps[name] === 'block') blocked += 1;
  }
  score += Math.min(blocked * 10, 30);
  if (escaped) score += 10;
  return score;
}

export function badgeFor(awareness) {
  if (awareness >= 85) return { icon: '🥷', name: 'Cyber Ninja' };
  if (awareness >= 60) return { icon: '🛡️', name: 'Alert Citizen' };
  if (awareness >= 35) return { icon: '⚠️', name: 'Needs Practice' };
  return { icon: '🎯', name: 'Easy Target' };
}

// Is the whole journey finished? (Only full runs go into the report.)
function isComplete(state) {
  return state.confidence !== null &&
    state.traps.camera !== null &&
    state.traps.location !== null &&
    state.traps.notify !== null &&
    state.rounds.length === TOTAL_ROUNDS &&
    state.story !== null;
}

function trapText(value) {
  if (value === 'block') return { text: '✅ Blocked', cls: 'res-good' };
  if (value === 'allow') return { text: '❌ Allowed', cls: 'res-bad' };
  if (value === 'unsupported') return { text: '— Not supported', cls: 'res-neutral' };
  return { text: '— Skipped', cls: 'res-neutral' };
}

function resultRow(label, value) {
  return el('li', {}, [el('span', {}, label), el('span', { className: 'res ' + value.cls }, value.text)]);
}

async function main() {
  const state = readState();
  const page = document.getElementById('score-page');
  if (!state || state.rounds.length === 0 || state.story === null) {
    showStartOver(page, 'Play the game and the story first, then your score card appears here.');
    return;
  }

  // ---- Numbers ----
  const correct = state.rounds.filter((r) => r.correct).length;
  const escaped = state.story.escaped;
  const awareness = awarenessScore(correct, state.traps, escaped);
  const badge = badgeFor(awareness);

  countUp(document.getElementById('correct'), correct, '', 900);
  countUp(document.getElementById('awareness'), awareness, '', 1200);
  document.getElementById('badge-icon').textContent = badge.icon;
  document.getElementById('badge-name').textContent = badge.name;
  if (state.rounds.length < TOTAL_ROUNDS) {
    document.getElementById('score-sub').textContent =
      'messages judged correctly (demo: ' + state.rounds.length + ' of 8 rounds played)';
  }

  // ---- Confidence vs reality ----
  const conf = state.confidence || 0;
  let verdictLine = 'Your confidence matched your result. Nice self-awareness!';
  if (conf >= 4 && correct < 7) verdictLine = '😬 You felt confident, but the scams got you. That is exactly how scammers win.';
  else if (conf <= 2 && correct >= 7) verdictLine = '🙂 You doubted yourself, but you did great!';
  document.getElementById('confidence-card').replaceChildren(
    el('h3', {}, 'Confidence vs reality'),
    el('p', { style: 'margin:0 0 6px' }, ['You rated yourself ', el('span', { style: 'color:#facc15', ariaLabel: conf + ' out of 5 stars' }, stars(conf)), ' and got ' + correct + ' / 8 right.']),
    el('p', { className: 'muted', style: 'margin:0' }, verdictLine)
  );

  // ---- Result list ----
  document.getElementById('result-list').replaceChildren(
    resultRow('📸 Camera trap', trapText(state.traps.camera)),
    resultRow('📍 Location trap', trapText(state.traps.location)),
    resultRow('🔔 Notification trap', trapText(state.traps.notify)),
    resultRow('👮 Digital arrest story', escaped
      ? { text: '✅ Escaped', cls: 'res-good' }
      : { text: '❌ Lost ₹4,20,000', cls: 'res-bad' })
  );

  // ---- Share ----
  document.getElementById('share-btn').addEventListener('click', () => share(awareness));

  // ---- Save to the batch report (survey mode, once) ----
  if (isDemo()) return; // demo mode never writes anything
  if (state.saved) return; // already saved (e.g. page refreshed)
  if (!isComplete(state)) return; // only full runs count
  if (!isConfigured()) return; // Firebase not set up yet

  const ok = await saveResult(state.sessionId, {
    confidence: state.confidence,
    correct: correct,
    awareness: awareness,
    rounds: state.rounds.map((r) => r.correct),
    traps: {
      camera: state.traps.camera,
      location: state.traps.location,
      notify: state.traps.notify,
    },
    escaped: escaped,
  });
  if (ok) {
    updateState((s) => { s.saved = true; });
    showToast('✔ Your anonymous result was added to the batch report');
  }
}

async function share(awareness) {
  // Link to the home page of this site.
  const link = window.location.href.split('?')[0].replace(/score\.html$/, '');
  const text = 'I scored ' + awareness + '/100 on ScamShield Live 🛡️ Can you beat me? ' + link;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'ScamShield Live', text: text });
      return;
    }
    await navigator.clipboard.writeText(text);
    showToast('📋 Copied! Paste it in your group chat.');
  } catch (err) {
    // User closed the share sheet, or clipboard blocked: nothing to do.
  }
}

main();
