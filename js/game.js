// =====================================================================
// game.js — "Spot the Scam" (Page 7)
// 8 rounds. Each round: show a message on a realistic phone screen,
// 15-second timer, player taps Scam or Legit. Then we mark the red
// flags using the SAME engine as the checker page, so both agree.
// =====================================================================

import { initPage, el, icon, goTo, buildHighlighted, findPhrase, markerClass, mostSerious, phoneStatusBar } from './ui.js';
import { updateState, isDemo } from './session.js';
import { ROUNDS } from './rounds.js';
import { analyze, SIGNAL_INFO } from './engine.js';

initPage();

const ROUND_SECONDS = 15;
const RING_LENGTH = 131.95; // circumference of the timer circle (2 × π × 21)

// ---------- Page elements ----------
const stage = document.getElementById('stage');
const feedback = document.getElementById('feedback');
const answers = document.getElementById('answers');
const btnScam = document.getElementById('btn-scam');
const btnLegit = document.getElementById('btn-legit');
const timerBtn = document.getElementById('timer');
const timerNum = document.getElementById('timer-num');
const ring = document.getElementById('ring');
const hudRound = document.getElementById('hud-round');
const hudScore = document.getElementById('hud-score');
const track = document.getElementById('track');
const skipBox = document.getElementById('skip-box');
const prompt = document.getElementById('prompt');

// ---------- Game state (only for this page) ----------
let roundIndex = 0; // 0..7
let score = 0;
let secondsLeft = ROUND_SECONDS;
let timerId = null;
let paused = false;
let answered = false;
let roundStartTime = 0;
let textBox = null; // the element holding the message text (for marks)
const results = []; // true / false per round

// Start fresh: forget any earlier game in this tab.
updateState((s) => {
  s.rounds = [];
});

// =====================================================================
// Drawing the messages on a phone (one function per type)
// =====================================================================

// Phone frame with status bar + an app header.
function phone(extraClass, headChildren, bodyChildren) {
  return el('div', { className: 'phone ' + extraClass }, el('div', { className: 'phone-screen' }, [
    phoneStatusBar(),
    headChildren,
    el('div', { className: 'app-body' }, bodyChildren),
  ]));
}

function appHead(avatar, name, sub) {
  return el('div', { className: 'app-head' }, [
    el('div', { className: 'app-avatar' }, avatar),
    el('div', {}, [el('div', { className: 'app-name' }, name), el('div', { className: 'app-sub' }, sub)]),
  ]);
}

// First two letters of an SMS sender, e.g. "AD-HDFCBK" -> "AD"
function initials(sender) {
  return sender.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase();
}

function drawSms(round) {
  textBox = el('div', { className: 'sms-bubble' }, round.text);
  return phone('', appHead(initials(round.sender), round.sender, 'Text message'), [
    el('div', { className: 'app-time' }, 'Today ' + round.time),
    textBox,
  ]);
}

function drawWhatsapp(round) {
  textBox = el('span', {}, round.text);
  return phone('wa', appHead(icon('user'), round.sender, 'not in your contacts'), [
    el('div', { className: 'wa-banner' }, 'This number is not in your contacts. Be careful with messages from unknown numbers.'),
    el('div', { className: 'wa-bubble' }, [textBox, el('span', { className: 'stamp' }, round.time)]),
  ]);
}

function drawEmail(round) {
  textBox = el('div', { className: 'mail-body' }, round.text);
  return el('div', { className: 'phone mail' }, el('div', { className: 'phone-screen' }, [
    phoneStatusBar(),
    el('div', { className: 'mail-subject' }, round.subject),
    appHead(initials(round.sender), round.sender.split('<')[0].trim(), 'to me · ' + round.time),
    textBox,
  ]));
}

function drawUpi(round) {
  textBox = el('div', { className: 'upi-note' }, round.text);
  return el('div', { className: 'phone upi' }, el('div', { className: 'phone-screen' }, [
    phoneStatusBar(),
    el('div', { className: 'upi-head' }, [icon('badge-indian-rupee'), 'Payment request']),
    el('div', { className: 'upi-card' }, [
      el('div', { className: 'upi-tag' }, 'Requested by'),
      el('div', { className: 'upi-from' }, round.sender),
      el('div', { className: 'upi-amount' }, round.amount),
      textBox,
      el('div', { className: 'upi-actions', ariaHidden: 'true' }, [
        el('span', { className: 'upi-decline' }, 'Decline'),
        el('span', { className: 'upi-pay' }, 'Pay'),
      ]),
    ]),
  ]));
}

function drawQr(round) {
  textBox = el('span', {}, round.text);
  return phone('wa', appHead(icon('user'), round.sender, 'not in your contacts'), [
    el('div', { className: 'wa-bubble' }, [textBox, el('span', { className: 'stamp' }, round.time)]),
    el('div', { className: 'qr-card' }, [
      el('div', { className: 'qr-img' }, fakeQrGraphic()),
      el('div', { className: 'qr-caption' }, 'Scan to receive ₹1,499'),
      el('div', { className: 'qr-sub' }, 'Sample picture, not a real QR code'),
    ]),
  ]);
}

// A QR-LOOKING picture drawn with SVG squares. It is random on purpose,
// so it cannot be scanned. (We never show a real payment QR.)
function fakeQrGraphic() {
  const ns = 'http://www.w3.org/2000/svg';
  const size = 25;
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  svg.setAttribute('width', '140');
  svg.setAttribute('height', '140');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('shape-rendering', 'crispEdges');

  function square(x, y, w, color) {
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', x);
    r.setAttribute('y', y);
    r.setAttribute('width', w);
    r.setAttribute('height', w);
    r.setAttribute('fill', color);
    svg.appendChild(r);
  }

  let seed = 11; // fixed seed: same picture every time
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      seed = (seed * 9301 + 49297) % 233280;
      if (seed / 233280 > 0.52) square(x, y, 1, '#111');
    }
  }
  // the three corner squares that make it look like a QR code
  for (const [x, y] of [[0, 0], [18, 0], [0, 18]]) {
    square(x, y, 7, '#111');
    square(x + 1, y + 1, 5, '#fff');
    square(x + 2, y + 2, 3, '#111');
  }
  return svg;
}

function drawMessage(round) {
  if (round.type === 'sms') return drawSms(round);
  if (round.type === 'whatsapp') return drawWhatsapp(round);
  if (round.type === 'email') return drawEmail(round);
  if (round.type === 'upi') return drawUpi(round);
  return drawQr(round);
}

// =====================================================================
// Timer
// =====================================================================

function drawTimer() {
  timerNum.textContent = String(secondsLeft);
  const used = (ROUND_SECONDS - secondsLeft) / ROUND_SECONDS;
  ring.style.strokeDashoffset = String(RING_LENGTH * used);
  timerBtn.classList.toggle('low', secondsLeft <= 5);
  timerBtn.setAttribute('aria-label', secondsLeft + ' seconds left' + (paused ? ' (paused)' : ''));
}

function startTimer() {
  stopTimer();
  secondsLeft = ROUND_SECONDS;
  paused = false;
  timerBtn.classList.remove('paused');
  drawTimer();
  timerId = setInterval(() => {
    if (paused) return;
    secondsLeft -= 1;
    drawTimer();
    if (secondsLeft <= 0) {
      stopTimer();
      answer(null); // time up = wrong answer
    }
  }, 1000);
}

function stopTimer() {
  if (timerId !== null) {
    clearInterval(timerId);
    timerId = null;
  }
}

// Demo mode only: tap the timer to pause / resume (handy on stage).
if (isDemo()) {
  timerBtn.classList.add('can-pause');
  timerBtn.title = 'Tap to pause or resume';
  timerBtn.addEventListener('click', () => {
    if (answered) return;
    paused = !paused;
    timerBtn.classList.toggle('paused', paused);
    drawTimer();
  });
}

// =====================================================================
// Rounds
// =====================================================================

function drawTrack() {
  const items = [];
  for (let i = 0; i < ROUNDS.length; i++) {
    let cls = '';
    if (i < results.length) cls = results[i] ? 'ok' : 'bad';
    else if (i === roundIndex) cls = 'now';
    items.push(el('span', { className: cls }));
  }
  track.replaceChildren(...items);
}

function showRound() {
  const round = ROUNDS[roundIndex];
  answered = false;
  hudRound.textContent = 'Round ' + (roundIndex + 1) + ' of ' + ROUNDS.length;
  hudScore.textContent = 'Score ' + score;
  feedback.replaceChildren();
  answers.classList.remove('hidden');
  prompt.classList.remove('hidden');
  btnScam.disabled = false;
  btnLegit.disabled = false;

  const message = drawMessage(round);
  message.classList.add('rise');
  stage.replaceChildren(message);
  drawTrack();

  roundStartTime = Date.now();
  startTimer();
}

// Mark the red flags inside the message text (the red marker).
function markFlags(round) {
  const spans = [];
  if (round.answer === 'scam') {
    for (const s of analyze(round.text).signals) spans.push(s);
  }
  for (const phrase of round.flags || []) {
    for (const found of findPhrase(round.text, phrase)) {
      found.id = 'FLAG'; // extra flags from rounds.js get the amber marker
      found.weight = 0;
      spans.push(found);
    }
  }
  if (spans.length === 0) return;
  const fragment = buildHighlighted(round.text, spans, (piece, covering) =>
    el('span', { className: markerClass(mostSerious(covering)) }, piece)
  );
  textBox.replaceChildren(fragment);
}

// Short list of WHY (from the engine), e.g. "Asks for OTP or PIN".
function reasonList(round) {
  if (round.answer !== 'scam') return null;
  const result = analyze(round.text);
  const ids = Object.keys(result.breakdown).sort((a, b) => result.breakdown[b] - result.breakdown[a]);
  if (ids.length === 0) return null;
  return el('ul', {}, ids.map((id) => el('li', {}, SIGNAL_INFO[id].en)));
}

// choice = 'scam' | 'legit' | null (null = time ran out)
function answer(choice) {
  if (answered) return;
  answered = true;
  stopTimer();
  btnScam.disabled = true;
  btnLegit.disabled = true;

  const round = ROUNDS[roundIndex];
  const correct = choice === round.answer;
  const timeMs = Date.now() - roundStartTime;
  if (correct) score += 1;
  results.push(correct);
  hudScore.textContent = 'Score ' + score;

  updateState((s) => {
    s.rounds.push({ id: round.id, correct: correct, timeMs: timeMs });
  });

  markFlags(round);
  answers.classList.add('hidden');
  prompt.classList.add('hidden');

  const label = round.answer === 'scam' ? 'a scam' : 'legit';
  let title;
  if (choice === null) title = 'Time\'s up. It was ' + label;
  else if (correct) title = 'Correct, it\'s ' + label;
  else title = 'Not quite. It\'s ' + label;

  const isLast = roundIndex === ROUNDS.length - 1;
  const nextBtn = el('button', { className: 'btn btn-primary btn-block', type: 'button' },
    [isLast ? 'Continue to the final challenge' : 'Next round', icon('arrow-right')]);
  nextBtn.addEventListener('click', nextRound);

  const note = el('div', { className: 'note verdict-note ' + (correct ? 'note-safe' : 'note-danger') }, [
    icon(correct ? 'circle-check' : 'circle-x'),
    el('div', {}, [
      el('div', { className: 'note-title' }, title),
      el('p', {}, round.explain),
      reasonList(round),
    ]),
  ]);
  feedback.replaceChildren(note, el('div', { style: 'margin-top:16px' }, nextBtn));
  nextBtn.focus({ preventScroll: true });

  if (!correct) {
    stage.classList.remove('shake');
    void stage.offsetWidth; // restart the animation
    stage.classList.add('shake');
  }

  drawTrack();
  // Demo mode: after round 3, allow skipping to the story.
  if (isDemo() && roundIndex >= 2) skipBox.classList.remove('hidden');
}

function nextRound() {
  roundIndex += 1;
  if (roundIndex >= ROUNDS.length) {
    goTo('story.html');
    return;
  }
  showRound();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

btnScam.addEventListener('click', () => answer('scam'));
btnLegit.addEventListener('click', () => answer('legit'));

showRound();
