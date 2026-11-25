// =====================================================================
// traps.js — the three permission traps (Pages 4, 5, 6)
//
// THE IDEA: real scams don't look scary. They look like a normal,
// friendly app asking for something with a good reason. So these three
// pages look like a "player card" set-up that belongs to this site.
// After the third one, we reveal the truth about all three.
//
// Privacy promise (we practise what we preach):
//   camera   -> live preview on YOUR screen for 3 s, then the camera is
//               switched off. No photo is taken, nothing is recorded.
//   location -> shown on a map on YOUR screen only. Never sent or saved.
//   notify   -> a FAKE permission box made of HTML. We never ask the
//               browser for real notification permission.
// Only the choice ("allow" / "block" / "unsupported") is remembered.
// =====================================================================

import { initPage, el, icon, sleep, goTo } from './ui.js';
import { getState, updateState, pageLink } from './session.js';

initPage();

const primaryBtn = document.getElementById('primary-btn');
const skipBtn = document.getElementById('skip-btn');
const statusLine = document.getElementById('status');

// Remember the player's choice for this trap.
function record(trapName, choice) {
  updateState((s) => {
    s.traps[trapName] = choice;
  });
}

function lockButtons() {
  if (primaryBtn) primaryBtn.disabled = true;
  if (skipBtn) skipBtn.disabled = true;
}

// "3f6c2a..." -> "Player 3F6C" (from the random anonymous session ID)
function playerName() {
  const id = String(getState().sessionId || '').replace(/[^a-z0-9]/gi, '');
  return 'Player ' + id.slice(0, 4).toUpperCase();
}

// What to show for each field on the player card.
function fieldText(choice, addedText) {
  if (choice === 'allow') return { text: addedText, set: true };
  if (choice === 'block' || choice === 'unsupported') return { text: 'Skipped', set: false };
  return { text: 'Not set', set: false };
}

// Draw the player card preview (page 4).
function renderPlayerCard(photoContent) {
  const slot = document.getElementById('player-card');
  if (!slot) return null;
  const traps = getState().traps;
  const photo = el('div', { className: 'pc-photo' }, photoContent || icon('user'));
  const fields = [
    ['Photo', fieldText(traps.camera, 'Added')],
    ['City', fieldText(traps.location, 'Pinned')],
    ['Alerts', fieldText(traps.notify, 'On')],
  ];
  slot.replaceChildren(el('div', { className: 'player-card' }, [
    photo,
    el('div', {}, [
      el('div', { className: 'pc-name' }, playerName()),
      el('div', { className: 'pc-sub' }, 'Batch test · today'),
    ]),
    el('div', { className: 'pc-fields' }, fields.map(([k, v]) =>
      el('div', {}, [el('div', { className: 'k' }, k), el('div', { className: 'v' + (v.set ? ' set' : '') }, v.text)])
    )),
  ]));
  return photo;
}

// ---------------------------------------------------------------------
// Page 4: CAMERA ("Add a photo")
// ---------------------------------------------------------------------
async function cameraTrap() {
  lockButtons();

  const supported = window.isSecureContext && navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function';
  if (!supported) {
    record('camera', 'unsupported');
    moveOn('Camera not available here. We\'ll use your initials.', 'trap-location.html');
    return;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
  } catch (err) {
    record('camera', 'block'); // said "Block", or no camera
    moveOn('No problem. We\'ll use your initials.', 'trap-location.html');
    return;
  }

  // Allowed: live preview inside the round photo frame for 3 seconds.
  record('camera', 'allow');
  const video = el('video', { muted: true, autoplay: true, playsInline: true });
  video.setAttribute('playsinline', '');
  video.srcObject = stream;
  renderPlayerCard(video);

  const live = document.getElementById('camera-live');
  const liveText = document.getElementById('camera-text');
  live.classList.remove('hidden');
  for (let s = 3; s > 0; s--) {
    liveText.textContent = 'Camera on · hold still ' + s;
    await sleep(1000);
  }

  // Switch the camera OFF (the camera light goes off). No photo taken.
  stream.getTracks().forEach((track) => track.stop());
  video.srcObject = null;
  live.classList.add('hidden');

  renderPlayerCard([icon('user'), el('span', { className: 'done-badge' }, icon('check'))]);
  moveOn('Photo added', 'trap-location.html');
}

// Show a short status line, then go to the next page.
async function moveOn(message, nextPage) {
  statusLine.textContent = message;
  await sleep(1300);
  goTo(nextPage);
}

// ---------------------------------------------------------------------
// Page 5: LOCATION ("Pin your city")
// ---------------------------------------------------------------------
function locationTrap() {
  lockButtons();

  if (!navigator.geolocation || !window.isSecureContext) {
    record('location', 'unsupported');
    moveOn('Location not available here. Skipping this step.', 'trap-notify.html');
    return;
  }

  statusLine.textContent = 'Finding you…';
  navigator.geolocation.getCurrentPosition(
    (position) => {
      // Allowed. The coordinates only live in this variable.
      record('location', 'allow');
      showMap(position.coords.latitude, position.coords.longitude);
      statusLine.textContent = 'Location added to your player card';
      document.getElementById('actions').classList.add('hidden');
      document.getElementById('next').classList.remove('hidden');
    },
    () => {
      // Blocked, or it failed: either way the site did NOT get it.
      record('location', 'block');
      moveOn('No problem. You can add it later.', 'trap-notify.html');
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
  );
}

function showMap(lat, lng) {
  document.getElementById('map-slot').classList.add('hidden');
  const mapBox = document.getElementById('map');
  mapBox.classList.remove('hidden');
  if (typeof window.L === 'undefined') {
    // Map library could not load (offline). Show text instead.
    mapBox.replaceChildren(el('p', { style: 'padding:20px' }, 'Position found (the map could not load offline).'));
    return;
  }
  const map = window.L.map('map', { zoomControl: false, attributionControl: true }).setView([lat, lng], 17);
  window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors',
  }).addTo(map);
  window.L.circleMarker([lat, lng], { radius: 9, color: '#0b0d14', weight: 3, fillColor: '#ff5a4e', fillOpacity: 1 }).addTo(map);
}

// ---------------------------------------------------------------------
// Page 6: NOTIFICATIONS (fully simulated), then THE REVEAL
// ---------------------------------------------------------------------
const SPAM = [
  'Your phone has 3 viruses. Clean now',
  'Claim ₹10,000 cashback. Offer ends in 5 min',
  'Your bank account is blocked. Verify immediately',
  'You won an iPhone 16. Tap to claim',
  'Battery damaged by virus (87%). Repair now',
  'KYC expired. Update today to avoid suspension',
];

function notifyTrap() {
  lockButtons();
  const perm = document.getElementById('perm');
  // The fake prompt shows this site's real address, like the real one.
  document.getElementById('perm-site').textContent = window.location.host || 'this site';
  perm.classList.remove('hidden');
  document.getElementById('perm-allow').focus();

  document.getElementById('perm-allow').addEventListener('click', async () => {
    perm.classList.add('hidden');
    record('notify', 'allow');
    await floodWithSpam();
    showReveal();
  }, { once: true });

  document.getElementById('perm-block').addEventListener('click', () => {
    perm.classList.add('hidden');
    record('notify', 'block');
    showReveal();
  }, { once: true });
}

function notNowNotify() {
  lockButtons();
  record('notify', 'block');
  showReveal();
}

async function floodWithSpam() {
  const stack = document.getElementById('notif-stack');
  const site = window.location.host || 'this site';
  for (const text of SPAM) {
    stack.prepend(el('div', { className: 'fake-notif' }, [
      el('div', { className: 'n-icon' }, icon('triangle-alert')),
      el('div', {}, [el('div', { className: 'n-site' }, site + ' · now'), el('div', { className: 'n-text' }, text)]),
    ]));
    await sleep(420);
  }
  await sleep(1500);
  stack.replaceChildren();
}

// One row of the reveal list.
function permRow(iconName, title, choice, ifAllowed) {
  let state = { text: 'Blocked', cls: 'is-good' };
  if (choice === 'allow') state = { text: 'Allowed', cls: 'is-bad' };
  if (choice === 'unsupported') state = { text: 'Not available', cls: 'is-neutral' };
  if (choice === null || choice === undefined) state = { text: 'Not asked', cls: 'is-neutral' };
  return el('li', {}, [
    icon(iconName),
    el('div', {}, [el('div', { className: 'what' }, title), el('div', { className: 'why' }, ifAllowed)]),
    el('span', { className: 'state ' + state.cls }, state.text),
  ]);
}

function showReveal() {
  const traps = getState().traps;
  let allowed = 0;
  for (const name of ['camera', 'location', 'notify']) {
    if (traps[name] === 'allow') allowed += 1;
  }

  const headline = 'That wasn\'t a player card.';
  let lead = 'In under a minute this page asked for three permissions, each with a friendly reason. You gave ' +
    allowed + ' of 3. Scam sites and fake apps work exactly like this.';
  if (allowed === 0) {
    lead = 'In under a minute this page asked for three permissions, each with a friendly reason. You gave none. ' +
      'Most people give at least one, because the reason sounded helpful.';
  }

  const reveal = document.getElementById('reveal');
  reveal.replaceChildren(
    el('div', { className: 'reveal-head rise' }, [
      el('p', { className: 'meta' }, 'What just happened'),
      el('h1', {}, headline),
      el('p', { className: 'lead' }, lead),
    ]),
    el('ul', { className: 'perm-list rise' }, [
      permRow('camera', 'Camera', traps.camera,
        'The page could watch you live. A scam page can record you or grab your face for fake KYC and blackmail.'),
      permRow('map-pin', 'Location', traps.location,
        'Your exact position, accurate to a few metres. Not your city: where you are standing.'),
      permRow('bell-ring', 'Notifications', traps.notify,
        'A site you allow can push alerts like those any time, even after you close it. That is how fake virus and prize alerts reach phones.'),
    ]),
    el('div', { className: 'stack' }, [
      el('h2', {}, 'Why it works'),
      el('ul', { className: 'steps-list' }, [
        el('li', {}, [el('b', {}, 'Borrowed trust. '), 'This site had been honest with you so far, so the requests felt safe.']),
        el('li', {}, [el('b', {}, 'A helpful reason. '), 'A photo for your card, a city for the map, an alert for your result.']),
        el('li', {}, [el('b', {}, 'One tap each. '), 'No password, no warning. The browser asks, and we tap Allow.']),
      ]),
    ]),
    el('div', { className: 'note note-info' }, [
      icon('lock'),
      el('div', {}, [
        el('div', { className: 'note-title' }, 'This was a demo'),
        el('p', {}, 'No photo was taken, your location never left this phone, and no real notifications were turned on.'),
      ]),
    ]),
    el('div', { className: 'note note-info' }, [
      icon('rotate-ccw'),
      el('div', {}, [
        el('div', { className: 'note-title' }, 'Undo what you allowed'),
        el('p', {}, 'Your browser still remembers your choices for this site. Tap the icon to the left of the web address, open Permissions or Site settings, and reset them.'),
      ]),
    ]),
    el('a', { className: 'btn btn-primary btn-block', href: pageLink('game.html') },
      ['Start the game', icon('arrow-right')])
  );

  document.getElementById('setup').classList.add('hidden');
  reveal.classList.remove('hidden');
  window.scrollTo({ top: 0 });
}

// ---------------------------------------------------------------------
// Start the right trap for this page
// ---------------------------------------------------------------------
const trap = document.body.dataset.trap;

if (trap === 'camera') {
  renderPlayerCard();
  primaryBtn.addEventListener('click', cameraTrap);
  skipBtn.addEventListener('click', () => {
    lockButtons();
    record('camera', 'block');
    moveOn('Skipped. We\'ll use your initials.', 'trap-location.html');
  });
}

if (trap === 'location') {
  primaryBtn.addEventListener('click', locationTrap);
  skipBtn.addEventListener('click', () => {
    lockButtons();
    record('location', 'block');
    moveOn('Skipped', 'trap-notify.html');
  });
}

if (trap === 'notify') {
  primaryBtn.addEventListener('click', notifyTrap);
  skipBtn.addEventListener('click', notNowNotify);
}
