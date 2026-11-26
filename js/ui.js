// =====================================================================
// ui.js — small helpers shared by every page:
//   initPage()          top bar + keep ?demo on links
//   icon()              a line icon from assets/icons.svg
//   el()                build HTML elements safely (no innerHTML)
//   typeText()          typewriter effect
//   showToast()         small message at the bottom
//   countUp()           number that counts up
//   buildHighlighted()  text with some parts marked (scam flags)
//   showStartOver()     friendly card when someone skips ahead
// =====================================================================

import { getState, isDemo, pageLink, resetState } from './session.js';

export const TOTAL_STEPS = 9;
const ICON_FILE = 'assets/icons.svg';

// true if the phone asks for less animation.
export function reducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Wait for some milliseconds: await sleep(400)
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A line icon, e.g. icon('camera'). Icons come from one file
// (assets/icons.svg) so they all share one size and one stroke.
export function icon(name, extraClass) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'icon' + (extraClass ? ' ' + extraClass : ''));
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', ICON_FILE + '#' + name);
  svg.appendChild(use);
  return svg;
}

// Build an element safely. Text always goes in through text nodes,
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

// "4" -> "04"
function twoDigits(n) {
  return n < 10 ? '0' + n : String(n);
}

// Draw the top bar: logo, step "04 / 12", progress line, Demo tag.
function renderTopBar(step) {
  const header = document.getElementById('topbar');
  if (!header) return;
  header.className = 'topbar';

  const right = el('div', { className: 'topbar-right' }, [
    isDemo() ? el('span', { className: 'demo-tag', title: 'Demo mode: nothing is saved' }, 'Demo') : null,
    step
      ? el('span', { className: 'topbar-step', ariaLabel: 'Step ' + step + ' of ' + TOTAL_STEPS },
        twoDigits(step) + ' / ' + TOTAL_STEPS)
      : el('a', { className: 'topbar-link', href: pageLink('report.html') }, 'Batch report'),
  ]);

  header.appendChild(el('div', { className: 'topbar-inner' }, [
    el('a', { className: 'logo', href: pageLink('index.html') }, [icon('shield-check'), 'ScamShield Live']),
    right,
  ]));

  if (step) {
    const fill = el('div', { className: 'progress-fill' });
    fill.style.transform = 'scaleX(' + (step / TOTAL_STEPS) + ')';
    header.appendChild(el('div', {
      className: 'progress',
      role: 'progressbar',
      ariaValuemin: '1',
      ariaValuemax: String(TOTAL_STEPS),
      ariaValuenow: String(step),
      ariaLabel: 'Progress',
    }, fill));
  }
}

// In demo mode, add ?demo to every link to our own pages, so the mode
// survives clicks.
function keepDemoOnLinks() {
  if (!isDemo()) return;
  for (const a of document.querySelectorAll('a[href$=".html"]')) {
    const href = a.getAttribute('href');
    if (!href.includes('?') && !href.startsWith('http')) {
      a.setAttribute('href', href + '?demo');
    }
  }
}

// Turn <i data-icon="camera"></i> placeholders in the HTML into icons.
function fillIconPlaceholders() {
  for (const spot of document.querySelectorAll('i[data-icon]')) {
    spot.replaceWith(icon(spot.dataset.icon, spot.className));
  }
}

// Call this at the top of every page script.
export function initPage() {
  getState(); // creates the session / picks up ?demo
  const step = Number(document.body.dataset.step) || 0;
  renderTopBar(step);
  fillIconPlaceholders();
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

// Small message at the bottom of the screen.
export function showToast(message, iconName, ms) {
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const toast = el('div', { className: 'toast', role: 'status' }, [icon(iconName || 'circle-check'), message]);
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

// Grow a bar from 0 to `fraction` (0..1) after it is on screen.
export function growBar(element, fraction) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    element.style.transform = 'scaleX(' + Math.max(0, Math.min(1, fraction)) + ')';
  }));
}

// Replace the page content with a "Start from the beginning" card.
export function showStartOver(container, message) {
  container.replaceChildren(
    el('div', { className: 'card no-state rise' }, [
      icon('rotate-ccw'),
      el('h2', {}, 'This step needs the earlier ones'),
      el('p', { className: 'muted' }, message || 'Your answers from the earlier steps are missing on this device.'),
      el('a', { className: 'btn btn-primary btn-block', href: pageLink('index.html') }, 'Start from the beginning'),
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

// How serious a flag is, from 1 to 3:
//   3 = the attack itself (asks for a secret, money, remote access,
//       makes a police threat, or a risky link)  -> red marker
//   2 = a pressure trick (panic, prize, easy job) -> amber marker
//   1 = supporting hint (brand name, phone number) -> dotted line
const RED_SIGNALS = ['SECRET_REQUEST', 'PAYMENT_PULL', 'REMOTE_ACCESS', 'DIGITAL_ARREST'];
const AMBER_SIGNALS = ['URGENCY_THREAT', 'REWARD_LURE', 'JOB_LURE', 'FLAG'];

export function severity(signal) {
  if (RED_SIGNALS.includes(signal.id)) return 3;
  if (signal.id === 'LINK_RISK') return signal.weight >= 45 ? 3 : 2;
  if (AMBER_SIGNALS.includes(signal.id)) return 2;
  return 1;
}

// The most serious signal in a list.
export function mostSerious(signals) {
  let best = signals[0];
  for (const s of signals) {
    if (severity(s) > severity(best)) best = s;
  }
  return best;
}

// Which marker style fits a signal.
export function markerClass(signal) {
  const level = severity(signal);
  if (level === 3) return 'marker';
  if (level === 2) return 'marker marker-amber';
  return 'marker marker-dotted';
}

// A phone status bar ("9:41  ▂▄▆ wifi battery") for the mock-ups.
export function phoneStatusBar() {
  return el('div', { className: 'phone-status', ariaHidden: 'true' }, [
    el('span', {}, '9:41'),
    el('span', { className: 'bars' }, [el('span', {}, '5G'), icon('battery-charging')]),
  ]);
}

// Used by the Home page "Start" button: fresh run, same mode.
export function startFresh() {
  resetState();
  goTo('confidence.html');
}
