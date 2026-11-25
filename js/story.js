// =====================================================================
// story.js — "Digital Arrest" story (Page 8)
// A fake CBI officer pressures you in 3 steps. Choice A = you obey,
// choice B = the safe move. One safe choice ends the story: you escape.
// Three "A" choices = you lose the money.
// =====================================================================

import { initPage, el, icon, sleep, reducedMotion } from './ui.js';
import { updateState, pageLink } from './session.js';

initPage();

// ---------- The script (DATA) ----------
const STEPS = [
  {
    officer: ['Hello, this is CBI Officer R. Sharma, Delhi.',
      'Your Aadhaar is linked to a money laundering case. A warrant is issued.'],
    a: 'I\'m scared, what do I do?',
    b: 'I\'ll hang up and call 1930.',
  },
  {
    officer: ['Do not tell anyone. Not your parents, not your friends.',
      'This is confidential. Stay on video call. You are under digital arrest.'],
    a: 'Okay sir.',
    b: 'Police never arrest anyone on a video call.',
  },
  {
    officer: ['To prove you are innocent, your money must be checked.',
      'Transfer ₹4,20,000 to the RBI safe account for verification.'],
    a: 'Sending now.',
    b: 'Block and report.',
  },
];

const chat = document.getElementById('chat');
const choicesBox = document.getElementById('choices');
const endingBox = document.getElementById('ending');
const choices = []; // 'a' / 'b' for each step

// ---------- Call timer (just for realism) ----------
const callStart = Date.now();
const callTimeEl = document.getElementById('call-time');
const callTimer = setInterval(() => {
  const secs = Math.floor((Date.now() - callStart) / 1000);
  const mm = String(Math.floor(secs / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  callTimeEl.textContent = mm + ':' + ss;
}, 1000);

// ---------- Chat helpers ----------
function addBubble(text, fromMe) {
  const bubble = el('div', { className: 'msg ' + (fromMe ? 'msg-out' : 'msg-in') }, text);
  chat.appendChild(bubble);
  bubble.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
}

// "..." typing dots, then the officer's message.
async function officerSays(text) {
  const typing = el('div', { className: 'typing', ariaLabel: 'Officer is typing' },
    [el('span'), el('span'), el('span')]);
  chat.appendChild(typing);
  await sleep(reducedMotion() ? 200 : 1100);
  typing.remove();
  addBubble(text, false);
}

// ---------- Story flow ----------
async function playStep(index) {
  const step = STEPS[index];
  for (const line of step.officer) {
    await officerSays(line);
  }
  await sleep(300);
  showChoices(index);
}

function showChoices(index) {
  const step = STEPS[index];
  const btnA = el('button', { className: 'btn btn-block', type: 'button' }, [el('span', { className: 'letter' }, 'A'), step.a]);
  const btnB = el('button', { className: 'btn btn-block', type: 'button' }, [el('span', { className: 'letter' }, 'B'), step.b]);
  btnA.addEventListener('click', () => choose(index, 'a'));
  btnB.addEventListener('click', () => choose(index, 'b'));
  choicesBox.replaceChildren(btnA, btnB);
  btnA.focus({ preventScroll: true });
}

async function choose(index, letter) {
  choicesBox.replaceChildren();
  choices.push(letter);
  const step = STEPS[index];
  addBubble(letter === 'a' ? step.a : step.b, true);
  await sleep(500);

  if (letter === 'b') {
    finish(true); // any safe choice = escaped
  } else if (index === STEPS.length - 1) {
    finish(false); // three "A" choices = lost
  } else {
    playStep(index + 1);
  }
}

function finish(escaped) {
  clearInterval(callTimer);
  updateState((s) => {
    s.story = { escaped: escaped, choices: choices.slice() };
  });

  let card;
  if (escaped) {
    card = el('div', { className: 'ending ending-escaped' }, [
      el('p', { className: 'meta' }, 'You hung up · nothing lost'),
      el('div', { className: 'ending-figure' }, '₹0'),
      el('h2', {}, 'You escaped'),
      el('p', { className: 'muted' }, 'Real police, CBI or RBI never arrest anyone or ask for money on a video call.'),
    ]);
  } else {
    card = el('div', { className: 'ending ending-lost' }, [
      el('p', { className: 'meta' }, 'Transfer sent · money lost'),
      el('div', { className: 'ending-figure' }, '₹4,20,000'),
      el('h2', {}, 'This is a real scam pattern reported across India'),
      el('p', { className: 'muted' }, 'There is no such thing as "digital arrest", and there is no "RBI safe account".'),
    ]);
  }

  endingBox.replaceChildren(
    card,
    el('div', { className: 'note note-info', style: 'margin-top:24px' }, [
      icon('phone'),
      el('div', {}, [
        el('div', { className: 'note-title' }, 'Report fraud: call 1930'),
        el('p', {}, ['Or file a complaint at ',
          el('a', { href: 'https://cybercrime.gov.in', target: '_blank', rel: 'noopener' }, 'cybercrime.gov.in')]),
      ]),
    ]),
    el('a', { className: 'btn btn-primary btn-block', href: pageLink('score.html'), style: 'margin-top:24px' }, ['See my score', icon('arrow-right')])
  );
  endingBox.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
}

playStep(0);
