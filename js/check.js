// =====================================================================
// check.js — ScamShield Checker (Page 11)
// Paste a message -> the rule engine scores it -> we show the verdict,
// a risk meter, the message with every red flag highlighted, and why.
//
// Safety: the message is the user's text, so we NEVER use innerHTML
// with it. Every piece goes in with textContent / text nodes.
// This page makes NO network requests while checking.
// =====================================================================

import { initPage, el, buildHighlighted, reducedMotion } from './ui.js';
import { analyze, SIGNAL_INFO, DEMO_SAMPLES } from './engine.js';

initPage();

const input = document.getElementById('msg');
const resultBox = document.getElementById('result');
const tip = document.getElementById('sig-tip');
let sampleIndex = 0;

const VERDICT_LOOK = {
  DANGEROUS: { icon: '🔴', text: 'DANGEROUS' },
  SUSPICIOUS: { icon: '🟡', text: 'SUSPICIOUS' },
  SAFE: { icon: '🟢', text: 'SAFE' },
};

// ---------- Verdict + meter ----------
function showVerdict(result) {
  const look = VERDICT_LOOK[result.verdict];
  const pill = document.getElementById('verdict');
  pill.className = 'verdict-pill verdict-' + result.verdict;
  pill.replaceChildren(el('span', { ariaHidden: 'true' }, look.icon), el('span', {}, look.text));

  const needle = document.getElementById('needle');
  needle.style.left = '0%';
  // Let the browser draw 0% first, then slide to the score.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    needle.style.left = result.score + '%';
  }));
  document.getElementById('score-text').textContent = 'risk ' + result.score + ' / 100';
}

// ---------- Highlighted message ----------
function showHighlights(result) {
  const box = document.getElementById('highlighted');
  tip.textContent = result.signals.length
    ? 'Tap a highlight to see what it means.'
    : 'No red flags found in this message.';

  const fragment = buildHighlighted(result.text, result.signals, (piece, covering) => {
    // If two signals overlap, colour by the strongest one.
    const strongest = covering.slice().sort((a, b) => b.weight - a.weight)[0];
    const labels = [];
    for (const s of covering) {
      const label = SIGNAL_INFO[s.id].short;
      if (!labels.includes(label)) labels.push(label);
    }
    const mark = el('mark', {
      className: 'sig',
      tabIndex: 0,
      title: labels.join(' + '),
      style: '--sig-color: var(--sig-' + strongest.id + ')',
    }, piece);
    const explain = () => {
      tip.replaceChildren(el('strong', {}, labels.join(' + ') + ': '),
        covering.map((s) => SIGNAL_INFO[s.id].en).filter((v, i, a) => a.indexOf(v) === i).join(' '));
    };
    mark.addEventListener('click', explain);
    mark.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); explain(); } });
    return mark;
  });
  box.replaceChildren(fragment);
}

// ---------- Why? list (from the breakdown) ----------
function showWhy(result) {
  // Biggest contributions first.
  const ids = Object.keys(result.breakdown).sort((a, b) => result.breakdown[b] - result.breakdown[a]);
  const why = document.getElementById('why');

  if (ids.length === 0) {
    why.replaceChildren(el('li', {}, [el('span', { className: 'pts', style: 'color:var(--safe)' }, '0'),
      el('span', {}, 'No scam patterns found. Still: never share OTP/PIN, and verify through the official app.')]));
    document.getElementById('hindi').replaceChildren();
    return;
  }

  why.replaceChildren(...ids.map((id) => el('li', {}, [
    el('span', { className: 'pts' }, '+' + result.breakdown[id]),
    el('span', {}, [
      el('span', { className: 'swatch', style: 'background: var(--sig-' + id + ')', ariaHidden: 'true' }),
      el('strong', {}, SIGNAL_INFO[id].short),
      ' — ' + SIGNAL_INFO[id].en,
    ]),
  ])));

  // Score note when the demand gate held the score back.
  const rawTotal = ids.reduce((sum, id) => sum + result.breakdown[id], 0);
  if (rawTotal > result.score) {
    why.appendChild(el('li', { className: 'small muted' }, [el('span', {}, ''),
      el('span', {}, result.verdict === 'SUSPICIOUS'
        ? 'Score held at ' + result.score + ': it never directly asks for money, a secret or remote access, so it stays SUSPICIOUS.'
        : 'The points add up to ' + rawTotal + ', so the score is capped at 100.')]));
  }

  // Hindi lines for the top 2 signals.
  const hindi = ids.slice(0, 2).map((id) => el('p', { className: 'hindi', style: 'margin:0 0 4px', lang: 'hi-Latn' }, '🗣️ ' + SIGNAL_INFO[id].hi));
  document.getElementById('hindi').replaceChildren(...hindi);
}

// ---------- What to do ----------
function showTodo(result) {
  let items;
  if (result.verdict === 'SAFE') {
    items = [
      'Looks normal — but if anything feels off, verify on the official app or website.',
      'Never share OTP, PIN or CVV, even with "bank staff".',
    ];
  } else {
    items = [
      '🚫 Don\'t click any link and don\'t call the number in the message.',
      '⛔ Block the sender.',
      '📞 Report at 1930 or cybercrime.gov.in (also: forward spam SMS to the Sanchar Saathi "Chakshu" portal).',
    ];
  }
  document.getElementById('todo').replaceChildren(...items.map((t) => el('li', {}, t)));
}

// ---------- Main ----------
function runCheck() {
  const text = input.value;
  if (text.trim() === '') {
    input.focus();
    return;
  }
  const result = analyze(text);
  resultBox.classList.remove('hidden');
  showVerdict(result);
  showHighlights(result);
  showWhy(result);
  showTodo(result);
  resultBox.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
}

document.getElementById('check-btn').addEventListener('click', runCheck);

// "Try a sample" cycles through the 4 demo messages.
document.getElementById('sample-btn').addEventListener('click', () => {
  const sample = DEMO_SAMPLES[sampleIndex];
  sampleIndex = (sampleIndex + 1) % DEMO_SAMPLES.length;
  input.value = sample.text;
  runCheck();
});

// Ctrl/Cmd + Enter = check
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runCheck();
});
