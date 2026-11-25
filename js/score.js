// =====================================================================
// score.js — Score Card (Page 9)
// Works out the awareness score, shows the rank, and (survey mode only)
// saves the anonymous result to the batch report — exactly once.
// =====================================================================

import { initPage, el, icon, countUp, growBar, showToast, showStartOver } from './ui.js';
import { readState, updateState, isDemo } from './session.js';
import { saveResult, isConfigured } from './firebase.js';

initPage();

const TOTAL_ROUNDS = 8;

// The formula (also shown on the page and the report):
//   round(correct / 8 × 60) + 10 per blocked trap (max 30) + 10 if escaped
function awarenessScore(correct, traps, escaped) {
  let score = Math.round((correct / TOTAL_ROUNDS) * 60);
  let blocked = 0;
  for (const name of ['camera', 'location', 'notify']) {
    if (traps[name] === 'block') blocked += 1;
  }
  score += Math.min(blocked * 10, 30);
  if (escaped) score += 10;
  return score;
}

function rankFor(awareness) {
  if (awareness >= 85) return { icon: 'shield-check', name: 'Cyber Ninja', sub: '85 and above' };
  if (awareness >= 60) return { icon: 'shield', name: 'Alert Citizen', sub: '60 to 84' };
  if (awareness >= 35) return { icon: 'shield-alert', name: 'Needs Practice', sub: '35 to 59' };
  return { icon: 'triangle-alert', name: 'Easy Target', sub: 'below 35' };
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

function trapResult(value) {
  if (value === 'block') return { text: 'Blocked', cls: 'is-good' };
  if (value === 'allow') return { text: 'Allowed', cls: 'is-bad' };
  if (value === 'unsupported') return { text: 'Not available', cls: 'is-neutral' };
  return { text: 'Skipped', cls: 'is-neutral' };
}

function row(label, result) {
  return el('li', {}, [el('span', { className: 'label' }, label), el('span', { className: 'value ' + result.cls }, result.text)]);
}

async function main() {
  const state = readState();
  const page = document.getElementById('score-page');
  if (!state || state.rounds.length === 0 || state.story === null) {
    showStartOver(page, 'Play the game and the final call first. Your score card appears after that.');
    return;
  }

  // ---- Numbers ----
  const correct = state.rounds.filter((r) => r.correct).length;
  const played = state.rounds.length;
  const escaped = state.story.escaped;
  const awareness = awarenessScore(correct, state.traps, escaped);
  const rank = rankFor(awareness);

  countUp(document.getElementById('awareness'), awareness, '', 1100);
  growBar(document.getElementById('awareness-fill'), awareness / 100);
  document.getElementById('rank-icon').replaceChildren(icon(rank.icon));
  document.getElementById('rank-name').textContent = rank.name;
  document.getElementById('rank-sub').textContent = rank.sub;

  // ---- Confidence vs reality ----
  const conf = state.confidence || 0;
  let verdictLine = 'Your confidence matched how you did.';
  if (conf >= 4 && correct < 7) verdictLine = 'You felt sure, and the scams still got through. That gap is exactly what scammers count on.';
  else if (conf <= 2 && correct >= 7) verdictLine = 'You doubted yourself, and did better than you thought.';
  document.getElementById('confidence-card').replaceChildren(
    el('h3', {}, 'Confidence vs reality'),
    el('ul', { className: 'rows' }, [
      row('You rated yourself', { text: conf + ' of 5', cls: '' }),
      row('Messages judged right', { text: correct + ' of ' + TOTAL_ROUNDS + (played < TOTAL_ROUNDS ? ' (' + played + ' played)' : ''), cls: '' }),
    ]),
    el('p', { className: 'muted' }, verdictLine)
  );

  // ---- Result list ----
  document.getElementById('result-list').replaceChildren(
    row('Camera', trapResult(state.traps.camera)),
    row('Location', trapResult(state.traps.location)),
    row('Notifications', trapResult(state.traps.notify)),
    row('The "CBI" call', escaped ? { text: 'Escaped', cls: 'is-good' } : { text: 'Lost ₹4,20,000', cls: 'is-bad' })
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
    showToast('Your anonymous result was added to the batch report');
  }
}

async function share(awareness) {
  // Link to the home page of this site.
  const link = window.location.href.split('?')[0].replace(/score\.html$/, '');
  const text = 'I scored ' + awareness + '/100 on ScamShield Live. Can you beat me? ' + link;
  try {
    if (navigator.share) {
      await navigator.share({ title: 'ScamShield Live', text: text });
      return;
    }
    await navigator.clipboard.writeText(text);
    showToast('Copied. Paste it in your group chat', 'check');
  } catch (err) {
    // User closed the share sheet, or clipboard blocked: nothing to do.
  }
}

main();
