// =====================================================================
// check.js — ScamShield Checker (Page 8)
// Paste a message -> the rule engine scores it -> we show the verdict,
// a risk meter, the message with every red flag marked, and why.
//
// The rule engine runs fully on the device and uploads nothing. There
// is an OPTIONAL "AI second opinion": if the person adds their own API
// key (see js/ai.js), a button lets them send the message to their
// chosen provider for a second view. It never changes the rule verdict.
//
// Safety: the message is the user's text, so we NEVER use innerHTML
// with it. Every piece goes in with text nodes (see el() in ui.js).
// =====================================================================

import { initPage, el, icon, buildHighlighted, markerClass, mostSerious, growBar, reducedMotion } from './ui.js';
import { analyze, SIGNAL_INFO, DEMO_SAMPLES, THRESHOLDS } from './engine.js';
import { PROVIDERS, loadConfig, saveConfig, clearConfig, hasKey, analyzeWithAI } from './ai.js';

initPage();

const input = document.getElementById('msg');
const resultBox = document.getElementById('result');
const tip = document.getElementById('sig-tip');
let sampleIndex = 0;
let lastText = ''; // the text of the latest check (for the AI button)

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

// =====================================================================
// The optional AI second opinion
// =====================================================================

const aiSlot = document.getElementById('ai-result');
let engineVerdict = 'SAFE'; // the rule engine's verdict of the last check

// Show (or hide) the "Ask the AI" card under the results.
function renderAiSlot() {
  const cfg = loadConfig();
  if (!cfg) {
    aiSlot.replaceChildren();
    return;
  }
  const provider = PROVIDERS[cfg.provider].label;
  const askBtn = el('button', { className: 'btn btn-block', type: 'button' }, [icon('sparkles'), 'Ask ' + provider]);
  askBtn.addEventListener('click', () => askAI(cfg));
  aiSlot.replaceChildren(el('div', { className: 'card ai-card' }, [
    el('div', { className: 'ai-card-head' }, [icon('bot'), el('h3', {}, 'AI second opinion')]),
    el('p', { className: 'small muted' }, 'Optional. This sends the message to ' + provider +
      ' using your key. The rule engine above stays the real verdict.'),
    askBtn,
  ]));
}

// A coloured dot + word for an AI verdict.
function aiVerdictPill(verdict) {
  const look = VERDICT_LOOK[verdict] || VERDICT_LOOK.SUSPICIOUS;
  return el('div', { className: 'ai-verdict v-' + verdict }, [icon(look.icon), el('span', {}, look.word)]);
}

async function askAI(cfg) {
  const provider = PROVIDERS[cfg.provider].label;
  aiSlot.replaceChildren(el('div', { className: 'card ai-card' }, [
    el('div', { className: 'ai-card-head' }, [icon('bot'), el('h3', {}, 'AI second opinion')]),
    el('p', { className: 'setup-status' }, [el('span', { className: 'spinner', ariaHidden: 'true' }), 'Asking ' + provider + '…']),
  ]));

  try {
    const ai = await analyzeWithAI(lastText);
    const agrees = ai.verdict === engineVerdict;
    const compare = agrees
      ? 'Agrees with the rule engine.'
      : 'Disagrees with the rule engine (which said ' + VERDICT_LOOK[engineVerdict].word + '). When they differ, trust the stricter one and verify through the official app.';

    aiSlot.replaceChildren(el('div', { className: 'card ai-card' }, [
      el('div', { className: 'ai-card-head' }, [
        icon('bot'),
        el('h3', {}, 'AI second opinion'),
        el('span', { className: 'ai-provider' }, provider),
      ]),
      el('div', { className: 'ai-verdict-row' }, [
        aiVerdictPill(ai.verdict),
        ai.confidence !== null ? el('span', { className: 'ai-confidence num' }, ai.confidence + '% sure') : null,
      ]),
      el('p', { className: 'small ' + (agrees ? 'muted' : 'ai-disagree') }, compare),
      ai.reasons.length ? el('ul', { className: 'steps-list', style: 'margin-top:4px' }, ai.reasons.map((r) => el('li', {}, r))) : null,
      ai.advice ? el('p', { className: 'small muted' }, ai.advice) : null,
      el('p', { className: 'small faint' }, 'An AI can be wrong, and a scam message can try to trick it. It never changes the verdict above.'),
      retryButton(cfg),
    ]));
  } catch (err) {
    aiSlot.replaceChildren(el('div', { className: 'card ai-card' }, [
      el('div', { className: 'ai-card-head' }, [icon('bot'), el('h3', {}, 'AI second opinion')]),
      el('div', { className: 'note note-danger', style: 'margin-top:0' }, [
        icon('triangle-alert'),
        el('div', {}, [el('div', { className: 'note-title' }, 'Couldn\'t get an answer'), el('p', {}, err.message)]),
      ]),
      retryButton(cfg),
    ]));
  }
}

function retryButton(cfg) {
  const btn = el('button', { className: 'btn btn-block', type: 'button', style: 'margin-top:12px' }, [icon('sparkles'), 'Ask again']);
  btn.addEventListener('click', () => askAI(cfg));
  return btn;
}

// ---------- The AI settings panel ----------
function setupAiPanel() {
  const toggle = document.getElementById('ai-toggle');
  const toggleText = document.getElementById('ai-toggle-text');
  const panel = document.getElementById('ai-panel');
  const providerSel = document.getElementById('ai-provider');
  const keyInput = document.getElementById('ai-key');
  const keyHint = document.getElementById('ai-key-hint');
  const modelInput = document.getElementById('ai-model');
  const saveBtn = document.getElementById('ai-save');
  const forgetBtn = document.getElementById('ai-forget');
  const savedMsg = document.getElementById('ai-saved');

  function reflectProvider() {
    const p = PROVIDERS[providerSel.value];
    keyHint.textContent = p.keyHint + ' · get one at ' + p.keyUrl;
    if (!modelInput.value.trim()) modelInput.placeholder = p.defaultModel;
  }

  function reflectSaved() {
    const cfg = loadConfig();
    if (cfg) {
      toggleText.textContent = 'AI second opinion: ' + PROVIDERS[cfg.provider].label + ' connected';
      toggle.querySelector('use').setAttribute('href', 'assets/icons.svg#sparkles');
      forgetBtn.classList.remove('hidden');
      savedMsg.classList.remove('hidden');
      savedMsg.textContent = 'Key saved on this device. Run a check, then tap "Ask".';
      providerSel.value = cfg.provider;
      modelInput.value = cfg.model && cfg.model !== PROVIDERS[cfg.provider].defaultModel ? cfg.model : '';
    } else {
      toggleText.textContent = 'Add an AI second opinion (optional)';
      forgetBtn.classList.add('hidden');
      savedMsg.classList.add('hidden');
    }
    reflectProvider();
    renderAiSlot();
  }

  toggle.addEventListener('click', () => {
    const open = panel.classList.toggle('hidden') === false;
    toggle.setAttribute('aria-expanded', String(open));
  });
  providerSel.addEventListener('change', reflectProvider);

  saveBtn.addEventListener('click', () => {
    const key = keyInput.value.trim();
    if (!key) {
      keyInput.focus();
      return;
    }
    saveConfig(providerSel.value, key, modelInput.value);
    keyInput.value = '';
    reflectSaved();
  });

  forgetBtn.addEventListener('click', () => {
    clearConfig();
    keyInput.value = '';
    reflectSaved();
  });

  reflectSaved();
}

// ---------- Main ----------
function runCheck() {
  const text = input.value;
  if (text.trim() === '') {
    input.focus();
    return;
  }
  lastText = text;
  const result = analyze(text);
  engineVerdict = result.verdict;
  resultBox.classList.remove('hidden');
  showVerdict(result);
  showEvidence(result);
  showWhy(result);
  showTodo(result);
  renderAiSlot(); // reset the AI card for this new message
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

setupAiPanel();
