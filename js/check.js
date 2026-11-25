// =====================================================================
// check.js — ScamShield Checker (Page 11)
// Paste a message -> the rule engine scores it -> we show the verdict,
// a risk meter, the message with every red flag marked, and why.
//
// Safety: the message is the user's text, so we NEVER use innerHTML
// with it. Every piece goes in with text nodes (see el() in ui.js).
// This page makes NO network requests while checking.
// =====================================================================

import { initPage, el, icon, buildHighlighted, markerClass, mostSerious, growBar, reducedMotion } from './ui.js';
import { analyze, SIGNAL_INFO, DEMO_SAMPLES, THRESHOLDS } from './engine.js';

initPage();

const input = document.getElementById('msg');
const resultBox = document.getElementById('result');
const tip = document.getElementById('sig-tip');
let sampleIndex = 0;

const VERDICT_LOOK = {
  DANGEROUS: { icon: 'triangle-alert', word: 'Dangerous', line: 'Do not reply, click or pay' },
  SUSPICIOUS: { icon: 'circle-alert', word: 'Suspicious', line: 'Check with the real sender first' },
  SAFE: { icon: 'circle-check', word: 'Looks safe', line: 'No scam patterns found' },
};

// ---------- Verdict + risk meter ----------
function showVerdict(result) {
  const look = VERDICT_LOOK[result.verdict];
  const box = document.getElementById('verdict');
  box.className = 'verdict v-' + result.verdict;

  const fill = el('div', { className: 'meter-fill' });
  const meter = el('div', { className: 'meter', role: 'img', ariaLabel: 'Risk ' + result.score + ' out of 100' }, [
    fill,
    el('span', { className: 'meter-zone', style: 'left:0;width:' + THRESHOLDS.suspicious + '%' }),
    el('span', { className: 'meter-zone', style: 'left:0;width:' + THRESHOLDS.dangerous + '%' }),
  ]);

  box.replaceChildren(
    icon(look.icon),
    el('div', {}, [el('div', { className: 'verdict-word' }, look.word), el('div', { className: 'small muted' }, look.line)]),
    el('div', { className: 'verdict-score' }, [el('b', {}, String(result.score)), 'risk / 100']),
    meter
  );
  growBar(fill, result.score / 100);
}

// ---------- The message with red flags marked ----------
function showEvidence(result) {
  const box = document.getElementById('evidence');
  tip.textContent = result.signals.length
    ? 'Tap a marked part to see what it means.'
    : 'Nothing marked: no scam patterns found.';

  const fragment = buildHighlighted(result.text, result.signals, (piece, covering) => {
    // If two signals overlap, style it by the most serious one.
    const strongest = mostSerious(covering);
    const names = [];
    for (const s of covering) {
      const name = SIGNAL_INFO[s.id].short;
      if (!names.includes(name)) names.push(name);
    }
    const mark = el('mark', { className: markerClass(strongest), tabIndex: 0, title: names.join(' + ') }, piece);
    const explain = () => {
      const texts = [];
      for (const s of covering) {
        const t = SIGNAL_INFO[s.id].en;
        if (!texts.includes(t)) texts.push(t);
      }
      tip.replaceChildren(el('b', {}, names.join(' + ') + '. '), texts.join(' '));
    };
    mark.addEventListener('click', explain);
    mark.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        explain();
      }
    });
    return mark;
  });
  box.replaceChildren(fragment);
}

// ---------- Why: points per signal, biggest first ----------
function showWhy(result) {
  const ids = Object.keys(result.breakdown).sort((a, b) => result.breakdown[b] - result.breakdown[a]);
  const why = document.getElementById('why');

  if (ids.length === 0) {
    why.replaceChildren(el('li', {}, [
      el('span', { className: 'pts' }, '0'),
      el('div', {}, [
        el('div', { className: 'why-name' }, 'No scam patterns found'),
        el('div', { className: 'why-text' }, 'Still never share an OTP or PIN, and verify anything important in the official app.'),
      ]),
    ]));
    return;
  }

  const rows = ids.map((id, index) => el('li', {}, [
    el('span', { className: 'pts' }, '+' + result.breakdown[id]),
    el('div', {}, [
      el('div', { className: 'why-name' }, SIGNAL_INFO[id].short),
      el('div', { className: 'why-text' }, SIGNAL_INFO[id].en),
      // Hindi line for the top 2 reasons
      index < 2 ? el('div', { className: 'why-hi', lang: 'hi-Latn' }, SIGNAL_INFO[id].hi) : null,
    ]),
  ]));

  // Explain when the score is lower than the points added up.
  let total = 0;
  for (const id of ids) total += result.breakdown[id];
  if (total > result.score) {
    const text = result.verdict === 'SUSPICIOUS'
      ? 'Held at ' + result.score + ': it never directly demands money, a secret or remote access.'
      : 'Points add up to ' + total + ', so the score is capped at 100.';
    rows.push(el('li', {}, [el('span', { className: 'pts' }, '='), el('div', { className: 'note-row' }, text)]));
  }
  why.replaceChildren(...rows);
}

// ---------- What to do ----------
function showTodo(result) {
  let items;
  if (result.verdict === 'SAFE') {
    items = [
      'If anything still feels off, check it in the official app or website, not through the message.',
      [el('b', {}, 'Never share OTP, PIN or CVV'), ', even with "bank staff".'],
    ];
  } else {
    items = [
      [el('b', {}, 'Don\'t click'), ' the link and don\'t call the number in the message.'],
      [el('b', {}, 'Block'), ' the sender.'],
      [el('b', {}, 'Report'), ' it: call 1930 or visit cybercrime.gov.in. Spam SMS and calls can be reported on the Sanchar Saathi "Chakshu" portal.'],
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
  showEvidence(result);
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
