// =====================================================================
// ui.js — small helpers shared by every page:
//   initPage()      top bar + keep ?demo on links
//   typeText()      typewriter effect
//   showToast()     small message at the bottom
//   countUp()       number that counts up
//   el()            build HTML elements safely (no innerHTML)
//   showStartOver() friendly card when someone skips ahead
// =====================================================================

import { getState, isDemo, pageLink, resetState } from './session.js';

export const TOTAL_STEPS = 12;

// true if the phone asks for less animation.
export function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Wait for some milliseconds: await sleep(400)
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Build an element safely. Text always goes in through textContent,
// so user text can never become HTML (protects against XSS).
//   el('p', { className: 'muted' }, 'Hello')
//   el('div', {}, [childA, childB])
export function el(tag, props, children) {
  const node = document.createElement(tag);
  if (props) {
    for (const key of Object.keys(props)) {
      if (key === 'dataset') {
        Object.assign(node.dataset, props.dataset);
      } else if (key === 'style') {
        node.setAttribute('style', props.style);
      } else if (key.startsWith('aria') || key === 'role' || key === 'for') {
        node.setAttribute(key.replace(/([A-Z])/g, '-$1').toLowerCase(), props[key]);
      } else {
        node[key] = props[key];
      }
    }
  }
  if (children !== undefined && children !== null) {
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child === null || child === undefined || child === false) continue;
      if (typeof child === 'string' || typeof child === 'number') {
        node.appendChild(document.createTextNode(String(child)));
      } else {
        node.appendChild(child);
      }
    }
  }
  return node;
}

// Draw the top bar: logo, "Step n / 12", progress line, DEMO pill.
function renderTopBar(step) {
  const header = document.getElementById('topbar');
  if (!header) return;
  header.className = 'topbar';

  const inner = el('div', { className: 'topbar-inner' }, [
    el('a', { className: 'logo', href: pageLink('index.html') }, '🛡️ ScamShield Live'),
    isDemo() ? el('span', { className: 'demo-pill', title: 'Demo mode: nothing is saved' }, 'DEMO') : null,
    step ? el('span', { className: 'topbar-step' }, 'Step ' + step + ' / ' + TOTAL_STEPS) : null,
  ]);
  header.appendChild(inner);

  if (step) {
    const fill = el('div', { className: 'progress-fill' });
    fill.style.width = Math.round((step / TOTAL_STEPS) * 100) + '%';
    const bar = el('div', {
      className: 'progress',
      role: 'progressbar',
      ariaValuemin: '1',
      ariaValuemax: String(TOTAL_STEPS),
      ariaValuenow: String(step),
      ariaLabel: 'Progress',
    }, fill);
    header.appendChild(bar);
  }
}

// In demo mode, add ?demo to every link to our own pages, so the mode
// survives clicks.
function keepDemoOnLinks() {
  if (!isDemo()) return;
  const links = document.querySelectorAll('a[href$=".html"]');
  for (const a of links) {
    const href = a.getAttribute('href');
    if (!href.includes('?') && !href.startsWith('http')) {
      a.setAttribute('href', href + '?demo');
    }
  }
}

// Call this at the top of every page script.
export function initPage() {
  getState(); // creates the session / picks up ?demo
  const step = Number(document.body.dataset.step) || 0;
  renderTopBar(step);
  keepDemoOnLinks();
}

// Go to another page (keeps ?demo).
export function goTo(page) {
  window.location.href = pageLink(page);
}

// Typewriter effect. Resolves when done.
export async function typeText(element, text, speed) {
  const delay = speed || 18;
  if (reducedMotion()) {
    element.textContent = text;
    return;
  }
  element.textContent = '';
  for (let i = 0; i < text.length; i++) {
    element.textContent += text[i];
    await sleep(delay);
  }
}

// Small popup message at the bottom of the screen.
export function showToast(message, ms) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const toast = el('div', { className: 'toast', role: 'status' }, message);
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), ms || 3500);
}

// Count a number up from 0 to `target`, e.g. 0 → 73.
export function countUp(element, target, suffix, duration) {
  const end = Math.round(target);
  const text = suffix || '';
  const ms = duration || 1000;
  if (reducedMotion() || end === 0) {
    element.textContent = end + text;
    return;
  }
  const startTime = performance.now();
  function frame(now) {
    const progress = Math.min((now - startTime) / ms, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // fast then slow
    element.textContent = Math.round(end * eased) + text;
    if (progress < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

// Replace the page content with a "Start from the beginning" card.
export function showStartOver(container, message) {
  container.replaceChildren(
    el('div', { className: 'card no-state fade-up' }, [
      el('div', { style: 'font-size:2.6rem' }, '🧭'),
      el('h2', {}, 'Looks like you skipped ahead'),
      el('p', { className: 'muted' }, message || 'This page needs your answers from the earlier steps.'),
      el('a', { className: 'btn btn-primary btn-block', href: pageLink('index.html') }, '▶ Start from the beginning'),
    ])
  );
}

// Build a message with some parts highlighted, WITHOUT innerHTML.
//   text   the full message
//   spans  [{ start, end, ...anything }]  (they may overlap)
//   makeMark(textPart, spansCoveringIt) must return an element
// Returns a DocumentFragment you can append anywhere.
//
// How: cut the text at every start/end position. Each small piece is
// either plain text, or covered by one or more spans -> highlighted.
export function buildHighlighted(text, spans, makeMark) {
  const cuts = new Set([0, text.length]);
  for (const s of spans) {
    cuts.add(s.start);
    cuts.add(s.end);
  }
  const points = Array.from(cuts).sort((a, b) => a - b);
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    if (from === to) continue;
    const piece = text.substring(from, to);
    const covering = spans.filter((s) => s.start <= from && s.end >= to);
    if (covering.length === 0) {
      fragment.appendChild(document.createTextNode(piece));
    } else {
      fragment.appendChild(makeMark(piece, covering));
    }
  }
  return fragment;
}

// Find every place a word/phrase appears (ignoring case).
export function findPhrase(text, phrase) {
  const found = [];
  const lowerText = text.toLowerCase();
  const lowerPhrase = phrase.toLowerCase();
  if (!lowerPhrase) return found;
  let index = lowerText.indexOf(lowerPhrase);
  while (index !== -1) {
    found.push({ start: index, end: index + phrase.length });
    index = lowerText.indexOf(lowerPhrase, index + phrase.length);
  }
  return found;
}

// 3 -> "★★★☆☆"
export function stars(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

// Used by the Home page "Start" button: fresh run, same mode.
export function startFresh() {
  resetState();
  goTo('mirror.html');
}
