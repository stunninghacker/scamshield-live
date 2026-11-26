// =====================================================================
// score.js — Player card, the reveal, and the score (Page 6)
//
// 1. Draws the player card from what the set-up page collected (name,
//    selfie, location) plus what the browser gives away without asking
//    (device, city, battery...).
// 2. Right under it, the reveal: how every detail was taken.
// 3. The score. In survey mode the ANONYMOUS result is saved once.
//
// Privacy: the selfie, name and location are read from this browser tab
// and DELETED straight away (clearCardData). They live only in this
// page's memory while you look at it, are never uploaded, and are never
// part of the Firebase result.
// =====================================================================

import { initPage, el, icon, countUp, growBar, showToast, showStartOver, sleep } from './ui.js';
import { readState, updateState, isDemo, readCardData, clearCardData } from './session.js';
import { saveResult, isConfigured } from './firebase.js';
import { collectFootprint } from './footprint.js';

initPage();

const TOTAL_ROUNDS = 8;

// The formula (also shown on the page and the report):
//   round(correct / 8 × 60) + 10 per blocked permission (max 30) + 10 if escaped
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
  if (awareness >= 85) return { icon: 'shield-check', name: 'Cyber Ninja' };
  if (awareness >= 60) return { icon: 'shield', name: 'Alert Citizen' };
  if (awareness >= 35) return { icon: 'shield-alert', name: 'Needs Practice' };
  return { icon: 'triangle-alert', name: 'Easy Target' };
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

function initialsOf(name) {
  return String(name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function row(label, result) {
  return el('li', {}, [el('span', { className: 'label' }, label), el('span', { className: 'value ' + (result.cls || '') }, result.text)]);
}

// =====================================================================
// 1. The player card
// =====================================================================
function drawCard(card, awareness, rank) {
  const today = new Date().toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

  const photo = card.photo
    ? el('img', { className: 'idc-photo', src: card.photo, alt: 'Your photo, taken by the camera' })
    : el('div', { className: 'idc-photo idc-initials' }, initialsOf(card.name));

  const awarenessNum = el('span', {}, '0');
  const fill = el('span');
  const top = el('div', { className: 'idc-top' }, [
    photo,
    el('div', { className: 'idc-who' }, [
      el('div', { className: 'idc-name' }, card.name || 'Player'),
      el('div', { className: 'idc-sub' }, [(card.year ? card.year + ' · ' : '') + 'Batch test · ' + today]),
      el('div', { className: 'idc-rank' }, [icon(rank.icon), rank.name]),
    ]),
  ]);

  const score = el('div', { className: 'idc-score' }, [
    el('div', { className: 'idc-score-row' }, [
      el('span', { className: 'muted' }, 'Awareness score'),
      el('span', { className: 'num' }, [awarenessNum, ' / 100']),
    ]),
    el('div', { className: 'awareness-bar' }, fill),
  ]);

  const parts = [top, score];

  // Location: a map with their exact spot
  if (typeof card.lat === 'number' && typeof card.lng === 'number') {
    parts.push(el('div', { className: 'idc-map-wrap' }, [
      el('div', { id: 'card-map', className: 'idc-map', role: 'img', ariaLabel: 'Map showing where you were when you tapped Allow' }),
      el('p', { className: 'idc-caption' }, [icon('map-pin', 'icon-sm'), ' Where you were when you tapped Allow · accurate to about ' + (card.accuracy || '?') + ' m']),
    ]));
  }

  // Device details, filled in when ready
  parts.push(el('ul', { id: 'idc-details', className: 'idc-details' }, el('li', { className: 'faint' }, 'Reading your device…')));

  document.getElementById('id-card').replaceChildren(...parts);
  countUp(awarenessNum, awareness, '', 1100);
  growBar(fill, awareness / 100);

  if (typeof card.lat === 'number') drawMap(card.lat, card.lng);
}

function drawMap(lat, lng) {
  if (typeof window.L === 'undefined') {
    document.getElementById('card-map').replaceChildren(el('p', { style: 'padding:16px' }, 'Your position was saved on this card (the map could not load offline).'));
    return;
  }
  const map = window.L.map('card-map', { zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false }).setView([lat, lng], 17);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  window.L.circleMarker([lat, lng], { radius: 9, color: '#0b0d14', weight: 3, fillColor: '#ff5a4e', fillOpacity: 1 }).addTo(map);
}

async function drawDetails() {
  const items = await collectFootprint();
  document.getElementById('idc-details').replaceChildren(...items.map((item) => el('li', {}, [
    icon(item.icon),
    el('div', {}, [el('div', { className: 'label' }, item.label), el('div', { className: 'value' }, item.value)]),
  ])));
}

// =====================================================================
// 2. The reveal
// =====================================================================
function permRow(iconName, title, state, text) {
  return el('li', {}, [
    icon(iconName),
    el('div', {}, [el('div', { className: 'what' }, title), el('div', { className: 'why' }, text)]),
    el('span', { className: 'state ' + state.cls }, state.text),
  ]);
}

function choiceState(choice) {
  if (choice === 'allow') return { text: 'Allowed', cls: 'is-bad' };
  if (choice === 'unsupported') return { text: 'Not available', cls: 'is-neutral' };
  if (choice === 'block') return { text: 'Blocked', cls: 'is-good' };
  return { text: 'Not asked', cls: 'is-neutral' };
}

function drawReveal(traps, card) {
  const given = [];
  if (traps.camera === 'allow') given.push('your camera');
  if (traps.location === 'allow') given.push('your exact location');
  if (traps.notify === 'allow') given.push('the right to send you alerts');

  let lead;
  if (given.length === 0) {
    lead = 'You skipped the Allow button, so this card only has what your browser gives away without asking. That alone is a lot. Most people tap Allow, because the reason sounds helpful.';
  } else {
    const list = given.length === 1 ? given[0]
      : given.slice(0, -1).join(', ') + ' and ' + given[given.length - 1];
    lead = 'You typed your name because a form asked nicely. Then one button, "Allow and finish", handed over ' + list +
      '. Your browser gave away everything else without asking anyone.';
  }

  const photoText = traps.camera === 'allow'
    ? (card.photo
      ? 'Taken by your camera without showing you a preview. A scam page can do this on every visit and use your face for fake KYC or blackmail.'
      : 'The camera was switched on for this site. A scam page can use it to watch or photograph you.')
    : 'This site asked for your camera to make your "card photo".';
  const placeText = traps.location === 'allow'
    ? 'Your exact position, accurate to about ' + (card.accuracy || '?') + ' m. Not your city: the spot where you were standing.'
    : 'This site asked for your location to put you "on the batch map".';
  const alertText = traps.notify === 'allow'
    ? 'You agreed in the small print under the button. A site with this permission can push alerts any time, even after you close it.'
    : 'The small print also asked to send you alerts.';

  document.getElementById('reveal').replaceChildren(
    el('div', { className: 'reveal-head' }, [
      el('p', { className: 'meta' }, 'Now look at your card again'),
      el('h1', {}, 'A website you met minutes ago built this card.'),
      el('p', { className: 'lead' }, lead),
    ]),
    el('ul', { className: 'perm-list' }, [
      permRow('user', 'Name and year', { text: 'Typed', cls: 'is-bad' }, 'You gave them yourself. Real scams start the same way: a friendly form.'),
      permRow('camera', 'Photo', choiceState(traps.camera), photoText),
      permRow('map-pin', 'Location', choiceState(traps.location), placeText),
      permRow('bell-ring', 'Alerts', choiceState(traps.notify), alertText),
      permRow('smartphone', 'Device, city, battery', { text: 'Read', cls: 'is-bad' }, 'Nobody asked you. Every site you open can read these the moment it loads.'),
    ]),
    el('div', { className: 'stack' }, [
      el('h2', {}, 'Why it works'),
      el('ul', { className: 'steps-list' }, [
        el('li', {}, [el('b', {}, 'Borrowed trust. '), 'It looked like part of a test you had already started.']),
        el('li', {}, [el('b', {}, 'A helpful reason. '), 'A card photo, a batch map, an alert for your result.']),
        el('li', {}, [el('b', {}, 'One tap, details in the small print. '), 'Three permissions behind one friendly button, then the phone\'s own prompts, which we tap on autopilot.']),
      ]),
    ]),
    el('div', { className: 'note note-info' }, [
      icon('lock'),
      el('div', {}, [
        el('div', { className: 'note-title' }, 'This was a demo'),
        el('p', {}, 'Your photo and location stayed in this browser tab and were deleted the moment this card appeared. Nothing was uploaded or saved, and no real notifications were turned on.'),
      ]),
    ]),
    el('div', { className: 'note note-danger' }, [
      icon('rotate-ccw'),
      el('div', {}, [
        el('div', { className: 'note-title' }, 'Undo what you allowed'),
        el('p', {}, 'Until you do, this site could turn on your camera or read your location again on your next visit without asking. Tap the icon to the left of the web address, open Permissions or Site settings, and reset them.'),
      ]),
    ])
  );
}

// The "alerts" you agreed to: a burst of fake notifications.
const SPAM = [
  'Your phone has 3 viruses. Clean now',
  'Claim ₹10,000 cashback. Offer ends in 5 min',
  'Your bank account is blocked. Verify immediately',
  'You won an iPhone 16. Tap to claim',
  'KYC expired. Update today to avoid suspension',
];

async function floodWithSpam() {
  const stack = document.getElementById('notif-stack');
  const site = window.location.host || 'this site';
  for (const text of SPAM) {
    stack.prepend(el('div', { className: 'fake-notif' }, [
      el('div', { className: 'n-icon' }, icon('triangle-alert')),
      el('div', {}, [el('div', { className: 'n-site' }, site + ' · now'), el('div', { className: 'n-text' }, text)]),
    ]));
    await sleep(450);
  }
  await sleep(1800);
  stack.replaceChildren();
}

// Start the spam once the reveal scrolls into view.
function spamWhenRevealSeen() {
  const target = document.getElementById('reveal');
  if (!('IntersectionObserver' in window)) {
    setTimeout(floodWithSpam, 2500);
    return;
  }
  const watcher = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) {
      watcher.disconnect();
      setTimeout(floodWithSpam, 600);
    }
  }, { threshold: 0.2 });
  watcher.observe(target);
}

// =====================================================================
// 3. The score
// =====================================================================
function trapResult(value) {
  const s = choiceState(value);
  return { text: s.text === 'Not asked' ? 'Skipped' : s.text, cls: s.cls };
}

function drawScore(state, correct, escaped) {
  const conf = state.confidence || 0;
  const played = state.rounds.length;
  let verdictLine = 'Your confidence matched how you did.';
  if (conf >= 4 && correct < 7) verdictLine = 'You felt sure, and the scams still got through. That gap is exactly what scammers count on.';
  else if (conf <= 2 && correct >= 7) verdictLine = 'You doubted yourself, and did better than you thought.';

  document.getElementById('confidence-card').replaceChildren(
    el('h3', {}, 'Confidence vs reality'),
    el('ul', { className: 'rows' }, [
      row('You rated yourself', { text: conf + ' of 5' }),
      row('Messages judged right', { text: correct + ' of ' + TOTAL_ROUNDS + (played < TOTAL_ROUNDS ? ' (' + played + ' played)' : '') }),
    ]),
    el('p', { className: 'muted' }, verdictLine)
  );

  document.getElementById('result-list').replaceChildren(
    row('Camera', trapResult(state.traps.camera)),
    row('Location', trapResult(state.traps.location)),
    row('Alerts', trapResult(state.traps.notify)),
    row('The "CBI" call', escaped ? { text: 'Escaped', cls: 'is-good' } : { text: 'Lost ₹4,20,000', cls: 'is-bad' })
  );
}

// =====================================================================
// Main
// =====================================================================
async function main() {
  const state = readState();
  const page = document.getElementById('score-page');
  if (!state || state.rounds.length === 0 || state.story === null) {
    showStartOver(page, 'Play the game and the final call first. Your player card appears after that.');
    return;
  }

  // Read the card data, then delete it from the browser straight away.
  const card = readCardData();
  clearCardData();

  const correct = state.rounds.filter((r) => r.correct).length;
  const escaped = state.story.escaped;
  const awareness = awarenessScore(correct, state.traps, escaped);
  const rank = rankFor(awareness);

  drawCard(card, awareness, rank);
  drawReveal(state.traps, card);
  drawScore(state, correct, escaped);
  drawDetails();
  if (state.traps.notify === 'allow') spamWhenRevealSeen();

  document.getElementById('share-btn').addEventListener('click', () => share(awareness));

  // ---- Save the ANONYMOUS result to the batch report (survey mode, once) ----
  // Only these fields are sent. No name, photo, location or device info.
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
    showToast('Your anonymous score was added to the batch report');
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
