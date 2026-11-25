// =====================================================================
// traps.js — the three permission traps (Pages 4, 5, 6)
//
// Privacy promise (we practise what we preach):
//   camera   -> live preview on YOUR screen for 3 s, then the camera is
//               switched off. No photo, no recording, no upload.
//   location -> shown on a map on YOUR screen only. Never sent or saved.
//   notify   -> a FAKE permission box made of HTML. We never ask the
//               browser for real notification permission.
// Only the choice ("allow" / "block") is remembered.
// =====================================================================

import { initPage, el, sleep } from './ui.js';
import { updateState } from './session.js';

initPage();

const resultBox = document.getElementById('result');
const nextBox = document.getElementById('next');
const bait = document.getElementById('bait');
const baitBtn = document.getElementById('bait-btn');

// Remember the player's choice for this trap.
function record(trapName, choice) {
  updateState((s) => {
    s.traps[trapName] = choice;
  });
}

// Small helper to build a coloured result card.
function callout(kind, title, text) {
  return el('div', { className: 'callout callout-' + kind + ' fade-up' }, [
    el('strong', {}, title),
    text ? el('p', {}, text) : null,
  ]);
}

// The "this was a demo" card shown after every trap.
function reveal(message, tip) {
  return el('div', { className: 'card reveal fade-up' }, [
    el('p', { style: 'margin:0;font-weight:600' }, '🔍 ' + message),
    el('p', { className: 'tip' }, '💡 Tip: ' + tip),
  ]);
}

function finish(cards) {
  resultBox.replaceChildren(...cards);
  nextBox.classList.remove('hidden');
}

// ---------------------------------------------------------------------
// Page 4: CAMERA
// ---------------------------------------------------------------------
async function cameraTrap() {
  baitBtn.disabled = true;
  const tip = 'Websites only need your camera for video calls you started yourself.';
  const demoLine = 'This was a demo. No photo was taken or saved.';

  // Camera needs HTTPS and a browser that supports it.
  const supported = window.isSecureContext && navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function';
  if (!supported) {
    record('camera', 'unsupported');
    finish([
      callout('info', 'ℹ️ Camera not available here', 'This browser or connection (needs HTTPS) does not allow camera access, so the trap was skipped.'),
      reveal(demoLine, tip),
    ]);
    return;
  }

  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
  } catch (err) {
    // The player said "Block" (or there is no camera).
    record('camera', 'block');
    finish([
      callout('safe', '✅ Smart move! Never give camera access to unknown sites.'),
      reveal(demoLine, tip),
    ]);
    return;
  }

  // Allowed: show the live preview for 3 seconds.
  record('camera', 'allow');
  bait.classList.add('hidden');
  const camBox = document.getElementById('cam');
  const video = document.getElementById('cam-video');
  const countEl = document.getElementById('cam-count');
  camBox.classList.remove('hidden');
  video.srcObject = stream;

  for (let s = 3; s > 0; s--) {
    countEl.textContent = String(s);
    await sleep(1000);
  }

  // Switch the camera OFF (the camera light goes off).
  stream.getTracks().forEach((track) => track.stop());
  video.srcObject = null;
  camBox.classList.add('hidden');

  finish([
    callout('danger', '🚨 One tap. That\'s all it took.', 'For 3 seconds this page could see you. A real scam site could record, take photos or stream you to someone.'),
    reveal(demoLine + ' The camera is now switched off.', tip),
  ]);
}

// ---------------------------------------------------------------------
// Page 5: LOCATION
// ---------------------------------------------------------------------
function locationTrap() {
  baitBtn.disabled = true;
  const tip = 'Delivery updates come from the official app or website, never from a random link.';
  const demoLine = 'Your location was never sent or saved. It stayed on this phone.';

  if (!navigator.geolocation || !window.isSecureContext) {
    record('location', 'unsupported');
    finish([
      callout('info', 'ℹ️ Location not available here', 'This browser or connection (needs HTTPS) does not allow location access, so the trap was skipped.'),
      reveal(demoLine, tip),
    ]);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      // Allowed. Coordinates stay in this variable only.
      record('location', 'allow');
      showMap(position.coords.latitude, position.coords.longitude);
      finish([
        reveal(demoLine + ' (The map pictures come from OpenStreetMap, like any map app.)', tip),
      ]);
    },
    (error) => {
      // PERMISSION_DENIED = blocked. Timeout / unavailable = we treat
      // as blocked too, because the site did NOT get the location.
      record('location', 'block');
      const title = error.code === error.PERMISSION_DENIED
        ? '✅ Good! Delivery companies never need this from a random link.'
        : '✅ The site could not get your location.';
      finish([callout('safe', title), reveal(demoLine, tip)]);
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
}

function showMap(lat, lng) {
  bait.classList.add('hidden');
  document.getElementById('map-wrap').classList.remove('hidden');
  if (typeof window.L === 'undefined') {
    // Map library failed to load (offline). Show a simple text instead.
    document.getElementById('map').replaceChildren(
      el('p', { style: 'padding:16px' }, '📍 Your position was found (map could not load offline).')
    );
    return;
  }
  const map = window.L.map('map', { zoomControl: false }).setView([lat, lng], 16);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  window.L.marker([lat, lng]).addTo(map).bindPopup('You are here').openPopup();
}

// ---------------------------------------------------------------------
// Page 6: NOTIFICATIONS (fully simulated)
// ---------------------------------------------------------------------
const SPAM = [
  '⚠️ Your phone has 3 viruses! Clean now',
  '💰 Claim ₹10,000 now! Offer ends in 5 min',
  '🔒 Account blocked! Verify immediately',
  '🎁 You won a free iPhone 16 — tap to claim',
  '📉 Battery damaged by virus (87%)',
  '❤️ Hot singles near you',
];

function notifyTrap() {
  baitBtn.disabled = true;
  // Show the fake permission box (just HTML).
  const perm = document.getElementById('perm');
  perm.classList.remove('hidden');
  document.getElementById('perm-allow').focus();

  document.getElementById('perm-allow').addEventListener('click', async () => {
    perm.classList.add('hidden');
    record('notify', 'allow');
    bait.classList.add('hidden');
    await floodWithSpam();
    finish([
      callout('danger', '🚨 This is how adware takes over phones.', 'One "Allow" lets a site push alerts like these any time, even when the site is closed.'),
      reveal('No real notifications were enabled. This was a simulation.', 'If a site already spams you: browser Settings → Site settings → Notifications → Block it.'),
    ]);
  }, { once: true });

  document.getElementById('perm-block').addEventListener('click', () => {
    perm.classList.add('hidden');
    record('notify', 'block');
    finish([
      callout('safe', '✅ Correct! Real prizes never need this.'),
      reveal('No real notifications were enabled. This was a simulation.', '"You won" pages that want notifications are adware traps.'),
    ]);
  }, { once: true });
}

async function floodWithSpam() {
  const stack = document.getElementById('notif-stack');
  for (const text of SPAM) {
    const note = el('div', { className: 'fake-notif' }, [
      el('div', { ariaHidden: 'true' }, '🔔'),
      el('div', {}, [
        el('div', { className: 'n-site' }, 'lucky-winner-today.click · now'),
        el('div', { className: 'n-text' }, text),
      ]),
    ]);
    stack.prepend(note);
    await sleep(450);
  }
  await sleep(1400);
  stack.replaceChildren();
}

// ---------------------------------------------------------------------
// Start the right trap for this page
// ---------------------------------------------------------------------
const trap = document.body.dataset.trap;
if (trap === 'camera') baitBtn.addEventListener('click', cameraTrap);
if (trap === 'location') baitBtn.addEventListener('click', locationTrap);
if (trap === 'notify') baitBtn.addEventListener('click', notifyTrap);
