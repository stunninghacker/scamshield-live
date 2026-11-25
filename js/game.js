// =====================================================================
// game.js — "Spot the Scam" (Page 7)
// 8 rounds. Each round: show a fake message, 15-second timer, player
// taps SCAM or LEGIT. Then we highlight the red flags using the SAME
// engine as the checker page, so both always agree.
// =====================================================================

import { initPage, el, goTo, buildHighlighted, findPhrase } from './ui.js';
import { updateState, isDemo } from './session.js';
import { ROUNDS } from './rounds.js';
import { analyze, SIGNAL_INFO } from './engine.js';

initPage();

const ROUND_SECONDS = 15;
const RING_LENGTH = 150.8; // circumference of the timer circle (2 × π × 24)

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
const dots = document.getElementById('dots');
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
let textBox = null; // the element holding the message text (for highlights)
const results = []; // true / false per round

// Start fresh: forget any earlier game in this tab.
updateState((s) => {
  s.rounds = [];
});

// =====================================================================
// Drawing the fake messages (one function per type)
// =====================================================================

function phoneHeader(avatarText, name, sub) {
  return el('div', { className: 'phone-head' }, [
    el('div', { className: 'avatar', ariaHidden: 'true' }, avatarText),
    el('div', {}, [el('div', { className: 'who' }, name), el('div', { className: 'sub' }, sub)]),
  ]);
}

function drawSms(round) {
  textBox = el('div', { className: 'bubble' }, round.text);
  return el('div', { className: 'phone mock-sms' }, [
    phoneHeader('💬', round.sender, 'Text message · now'),
    textBox,
  ]);
}

function drawWhatsapp(round) {
  textBox = el('div', { className: 'bubble' }, round.text);
  return el('div', { className: 'phone mock-wa' }, [
    phoneHeader('👤', round.sender, 'not in your contacts'),
    el('div', { className: 'wa-warn' }, 'This sender is not in your contact list.'),
    textBox,
  ]);
}

function drawEmail(round) {
  textBox = el('div', { className: 'em-body' }, round.text);
  return el('div', { className: 'mock-email' }, [
    el('div', { className: 'em-subject' }, round.subject),
    el('div', { className: 'em-from' }, 'From: ' + round.sender),
    textBox,
  ]);
}

function drawUpi(round) {
  textBox = el('div', { className: 'upi-note' }, round.text);
  return el('div', { className: 'mock-upi' }, [
    el('div', { className: 'upi-label' }, '⚡ UPI collect request'),
    el('div', { className: 'upi-from' }, 'From: ' + round.sender),
    el('div', { className: 'upi-amount' }, round.amount),
    textBox,
    el('span', { className: 'upi-pay', ariaHidden: 'true' }, 'PAY'),
    el('span', { className: 'upi-decline', ariaHidden: 'true' }, 'Decline'),
  ]);
}

function drawQr(round) {
  textBox = el('div', { className: 'bubble' }, round.text);
  return el('div', { className: 'phone mock-wa' }, [
    phoneHeader('👤', round.sender, 'not in your contacts'),
    textBox,
    el('div', { className: 'mock-qr-card' }, [
      fakeQrGraphic(),
      el('div', { className: 'qr-caption' }, 'Scan to receive ₹1,499'),
      el('div', { className: 'qr-sub' }, 'Sample picture only — not a real QR code'),
    ]),
  ]);
}

// A QR-LOOKING picture drawn with SVG squares. It is random on purpose,
// so it cannot be scanned. (We never show a real payment QR.)
function fakeQrGraphic() {
  const ns = 'http://www.w3.org/2000/svg';
  const size = 21;
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  svg.setAttribute('width', '150');
  svg.setAttribute('height', '150');
  svg.setAttribute('aria-hidden', 'true');

  function square(x, y, w, color) {
    const r = document.createElementNS(ns, 'rect');
    r.setAttribute('x', x);
    r.setAttribute('y', y);
    r.setAttribute('width', w);
    r.setAttribute('height', w);
    r.setAttribute('fill', color);
    svg.appendChild(r);
  }

  // random-looking dots (fixed seed so it looks the same each time)
  let seed = 7;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      seed = (seed * 9301 + 49297) % 233280;
      if (seed / 233280 > 0.55) square(x, y, 1, '#111');
    }
  }
  // the three big corner squares that make it look like a QR code
  for (const [x, y] of [[0, 0], [14, 0], [0, 14]]) {
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
  timerBtn.title = 'Tap to pause / resume';
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

function drawDots() {
  const items = [];
  for (let i = 0; i < ROUNDS.length; i++) {
    let cls = '';
    if (i < results.length) cls = results[i] ? 'ok' : 'bad';
    else if (i === roundIndex) cls = 'now';
    items.push(el('span', { className: cls }));
  }
  dots.replaceChildren(...items);
}

function showRound() {
  const round = ROUNDS[roundIndex];
  answered = false;
  hudRound.textContent = 'Round ' + (roundIndex + 1) + ' / ' + ROUNDS.length;
  hudScore.textContent = 'Score ' + score;
  feedback.replaceChildren();
  answers.classList.remove('hidden');
  prompt.classList.remove('hidden');
  btnScam.disabled = false;
  btnLegit.disabled = false;

  const message = drawMessage(round);
  message.classList.add('fade-up');
  stage.replaceChildren(message);
  drawDots();

  roundStartTime = Date.now();
  startTimer();
}

// Highlight the red flags inside the message text.
function highlightFlags(round) {
  const spans = [];
  if (round.answer === 'scam') {
    for (const s of analyze(round.text).signals) spans.push(s);
  }
  for (const phrase of round.flags || []) {
    for (const found of findPhrase(round.text, phrase)) spans.push(found);
  }
  if (spans.length === 0) return;
  const fragment = buildHighlighted(round.text, spans, (piece) =>
    el('mark', { className: 'flag' }, piece)
  );
  textBox.replaceChildren(fragment);
}

// Short list of WHY (from the engine), e.g. "Asks for OTP / PIN".
function reasonList(round) {
  if (round.answer !== 'scam') return null;
  const result = analyze(round.text);
  const ids = Object.keys(result.breakdown);
  if (ids.length === 0) return null;
  const items = ids.map((id) => el('li', {}, SIGNAL_INFO[id].en));
  return el('ul', { className: 'small', style: 'margin:8px 0 0;padding-left:20px' }, items);
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

  // Save this round's result.
  updateState((s) => {
    s.rounds.push({ id: round.id, correct: correct, timeMs: timeMs });
  });

  highlightFlags(round);
  answers.classList.add('hidden');
  prompt.classList.add('hidden');

  // Title line: ✅ / ❌ (icon + text + colour, never colour alone)
  let title;
  if (choice === null) title = '⏰ Time\'s up! It was ' + round.answer.toUpperCase() + '.';
  else if (correct) title = '✅ Correct! It\'s ' + round.answer.toUpperCase() + '.';
  else title = '❌ Wrong — it\'s ' + round.answer.toUpperCase() + '.';

  const isLast = roundIndex === ROUNDS.length - 1;
  const nextBtn = el('button', { className: 'btn btn-primary btn-block', type: 'button' },
    isLast ? 'Continue to the final challenge →' : 'Next Round →');
  nextBtn.addEventListener('click', nextRound);

  const card = el('div', { className: 'callout ' + (correct ? 'callout-safe' : 'callout-danger') }, [
    el('strong', {}, title),
    el('p', { style: 'margin:0' }, round.explain),
    reasonList(round),
  ]);
  feedback.replaceChildren(card, el('div', { style: 'margin-top:14px' }, nextBtn));
  nextBtn.focus({ preventScroll: true });

  if (!correct) {
    stage.classList.remove('shake');
    void stage.offsetWidth; // restart the animation
    stage.classList.add('shake');
  }

  drawDots();
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
