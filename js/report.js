// =====================================================================
// report.js — Batch Awareness Report (Page 10)
// Loads every anonymous result and calculates all the numbers right
// here in JavaScript. If Firebase can't be reached, it falls back to an
// offline snapshot file (assets/report-snapshot.json).
// =====================================================================

import { initPage, el, countUp } from './ui.js';
import { isDemo } from './session.js';
import { loadResults } from './firebase.js';
import { ROUNDS } from './rounds.js';

initPage();

const MIN_RESULTS = 5; // below this we show "Collecting data…"

// ---------- Small maths helpers ----------

// What percent of `list` passes the test? (0 if list is empty)
function percent(list, test) {
  if (list.length === 0) return 0;
  const hits = list.filter(test).length;
  return Math.round((hits / list.length) * 100);
}

function average(numbers) {
  if (numbers.length === 0) return 0;
  let total = 0;
  for (const n of numbers) total += n;
  return Math.round(total / numbers.length);
}

// % who allowed a trap, counting only people who were actually asked
// (phones without a camera / without HTTPS show "unsupported").
function percentAllowed(results, trapName) {
  const asked = results.filter((r) => r.traps && (r.traps[trapName] === 'allow' || r.traps[trapName] === 'block'));
  return percent(asked, (r) => r.traps[trapName] === 'allow');
}

// ---------- Loading ----------

async function loadSnapshot() {
  try {
    const res = await fetch('assets/report-snapshot.json', { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data.results)) return null;
    return data;
  } catch (err) {
    return null;
  }
}

// ---------- Drawing ----------

function tile(icon, value, suffix, label, wide) {
  const num = el('div', { className: 't-num' }, '0' + suffix);
  const box = el('div', { className: 'tile' + (wide ? ' wide' : '') }, [
    el('div', { className: 't-icon', ariaHidden: 'true' }, icon),
    num,
    el('div', { className: 't-label' }, label),
  ]);
  countUp(num, value, suffix, 1200);
  return box;
}

function drawReport(results) {
  const n = results.length;
  const avgAwareness = average(results.map((r) => r.awareness));
  const felt = percent(results, (r) => r.confidence >= 4);
  const were = percent(results, (r) => r.correct >= 7);
  const lost = percent(results, (r) => r.escaped === false);

  countUp(document.getElementById('n'), n, '', 900);

  // Hero: the confidence gap
  document.getElementById('gap-banner').replaceChildren(
    el('span', { className: 'felt' }, [el('span', { className: 'num' }, felt + '%'), ' felt confident.']),
    el('br'),
    el('span', { className: 'were' }, ['Only ', el('span', { className: 'num' }, were + '%'), ' actually were.'])
  );

  document.getElementById('tiles').replaceChildren(
    tile('🧠', avgAwareness, '', 'Average awareness score (out of 100)'),
    tile('😎', felt, '%', 'Rated themselves 4–5 ⭐'),
    tile('🎯', were, '%', 'Actually scored 7/8 or more'),
    tile('📸', percentAllowed(results, 'camera'), '%', 'Allowed the camera'),
    tile('📍', percentAllowed(results, 'location'), '%', 'Allowed location'),
    tile('🔔', percentAllowed(results, 'notify'), '%', 'Allowed notifications'),
    tile('💸', lost, '%', 'Lost money in the "digital arrest" story', true)
  );

  drawBars(results);
}

// % fooled per round, worst round highlighted.
function drawBars(results) {
  const fooled = ROUNDS.map((round, i) => {
    const answered = results.filter((r) => Array.isArray(r.rounds) && typeof r.rounds[i] === 'boolean');
    return percent(answered, (r) => r.rounds[i] === false);
  });
  const worst = Math.max(...fooled);

  const rows = ROUNDS.map((round, i) => {
    const fill = el('div', { className: 'bar-fill' });
    const isWorst = fooled[i] === worst && worst > 0;
    const row = el('div', { className: 'bar-row' + (isWorst ? ' worst' : '') }, [
      el('span', { className: 'bar-label' }, (isWorst ? '⚠ ' : '') + round.short),
      el('div', { className: 'bar-track', role: 'img', ariaLabel: round.short + ': ' + fooled[i] + '% fooled' }, fill),
      el('span', { className: 'bar-pct' }, fooled[i] + '%'),
    ]);
    // animate after it is on screen
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = fooled[i] + '%'; }));
    return row;
  });
  document.getElementById('bars').replaceChildren(...rows);
}

function drawCollecting(count) {
  document.getElementById('collecting').classList.remove('hidden');
  document.getElementById('collecting-count').textContent =
    count === 0 ? 'No results yet.' : count + (count === 1 ? ' result' : ' results') + ' so far. Need at least ' + MIN_RESULTS + '.';

  // QR code that points to this website's home page.
  const siteUrl = window.location.href.split('?')[0].replace(/report\.html$/, '');
  document.getElementById('site-link').textContent = siteUrl;
  const box = document.getElementById('qr-box');
  if (typeof window.qrcode === 'function') {
    const qr = window.qrcode(0, 'M');
    qr.addData(siteUrl);
    qr.make();
    box.replaceChildren(el('img', { src: qr.createDataURL(6, 2), alt: 'QR code for ' + siteUrl }));
  } else {
    box.classList.add('hidden'); // library could not load (offline)
  }
}

// Demo mode: download the raw anonymous results as a JSON file, to be
// saved as assets/report-snapshot.json (offline backup for the event).
function setupExport(results) {
  if (!isDemo()) return;
  const btn = document.getElementById('export-btn');
  btn.classList.remove('hidden');
  btn.addEventListener('click', () => {
    const snapshot = { exportedAt: new Date().toISOString(), count: results.length, results: results };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const link = el('a', { href: URL.createObjectURL(blob), download: 'report-snapshot.json' });
    document.body.appendChild(link);
    link.click();
    link.remove();
  });
}

async function main() {
  let results = await loadResults();
  let sourceText = 'Live data from Firebase · calculated on this device';

  if (results === null) {
    const snapshot = await loadSnapshot();
    if (snapshot) {
      results = snapshot.results;
      const when = snapshot.exportedAt ? new Date(snapshot.exportedAt).toLocaleString() : 'unknown time';
      sourceText = '📦 Offline snapshot from ' + when;
    } else {
      results = [];
      sourceText = 'Results database not connected yet.';
    }
  }

  document.getElementById('loading').classList.add('hidden');
  document.getElementById('source-note').textContent = sourceText;

  if (results.length < MIN_RESULTS) {
    drawCollecting(results.length);
  } else {
    document.getElementById('report').classList.remove('hidden');
    drawReport(results);
  }
  setupExport(results);
}

main();
