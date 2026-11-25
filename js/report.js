// =====================================================================
// report.js — Batch Awareness Report (Page 10)
// Loads every anonymous result and calculates all the numbers right
// here in JavaScript. If Firebase can't be reached, it falls back to an
// offline snapshot file (assets/report-snapshot.json).
// =====================================================================

import { initPage, el, countUp, growBar } from './ui.js';
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

// A stat card: a label and a number. Nothing else.
function stat(label, value, suffix) {
  const num = el('div', { className: 's-num' }, '0' + suffix);
  countUp(num, value, suffix, 1200);
  return el('div', { className: 'stat' }, [el('div', { className: 's-label' }, label), num]);
}

// One bar of the confidence gap.
function gapRow(cls, label, pct) {
  const fill = el('div', { className: 'gap-fill' });
  growBar(fill, pct / 100);
  const num = el('span', { className: 'pct' }, '0%');
  countUp(num, pct, '%', 1200);
  return el('div', { className: 'gap-row ' + cls }, [
    el('div', { className: 'top' }, [el('span', { className: 'label' }, label), num]),
    el('div', { className: 'gap-track', role: 'img', ariaLabel: label + ': ' + pct + '%' }, fill),
  ]);
}

function drawReport(results) {
  const n = results.length;
  const avgAwareness = average(results.map((r) => r.awareness));
  const felt = percent(results, (r) => r.confidence >= 4);
  const were = percent(results, (r) => r.correct >= 7);
  const lost = percent(results, (r) => r.escaped === false);

  countUp(document.getElementById('n'), n, '', 900);

  // The moment: the confidence gap
  document.getElementById('gap').replaceChildren(
    el('p', { className: 'gap-title' }, felt + '% felt confident. Only ' + were + '% actually were.'),
    gapRow('gap-felt', 'Rated themselves 4 or 5 out of 5', felt),
    gapRow('gap-were', 'Judged 7 or 8 messages right', were)
  );

  document.getElementById('tiles').replaceChildren(
    stat('Allowed the camera', percentAllowed(results, 'camera'), '%'),
    stat('Allowed their location', percentAllowed(results, 'location'), '%'),
    stat('Allowed notifications', percentAllowed(results, 'notify'), '%'),
    stat('Lost money on the "CBI" call', lost, '%')
  );
  countUp(document.getElementById('avg'), avgAwareness, '', 1200);

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
    growBar(fill, fooled[i] / 100);
    return el('div', { className: 'bar-row' + (isWorst ? ' worst' : '') }, [
      el('span', { className: 'bar-label' }, round.short),
      el('div', { className: 'bar-track', role: 'img', ariaLabel: round.short + ': ' + fooled[i] + '% fooled' + (isWorst ? ', the most' : '') }, fill),
      el('span', { className: 'bar-pct' }, fooled[i] + '%'),
    ]);
  });
  document.getElementById('bars').replaceChildren(...rows);
}

function drawCollecting(count) {
  document.getElementById('collecting').classList.remove('hidden');
  document.getElementById('collecting-count').textContent =
    count === 0 ? 'No results yet. Share the link with your batch.' : count + (count === 1 ? ' result' : ' results') + ' so far. The report opens at ' + MIN_RESULTS + '. Share the link with your batch.';

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
  let sourceText = 'Live results, calculated on this device';

  if (results === null) {
    const snapshot = await loadSnapshot();
    if (snapshot) {
      results = snapshot.results;
      const when = snapshot.exportedAt ? new Date(snapshot.exportedAt).toLocaleString() : 'unknown time';
      sourceText = 'Offline snapshot from ' + when;
    } else {
      results = [];
      sourceText = 'The results database is not connected yet';
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
