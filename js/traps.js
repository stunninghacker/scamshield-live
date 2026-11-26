// =====================================================================
// traps.js — the permission trap, disguised as "Create your player card"
// (setup.html, Page 3)
//
// THE IDEA: real scams don't look scary. They look like a normal app
// asking for something with a friendly reason. So this page is ordinary
// onboarding: type a name, tick a "human check", then ONE button,
// "Allow and finish". What that button really does is only written in
// the small print under it, like real apps do.
//
// Behind that one button:
//   1. camera   -> the phone shows its real camera prompt. If allowed,
//                  we take ONE still photo with no preview, then switch
//                  the camera off straight away.
//   2. location -> the phone shows its real location prompt.
//   3. alerts   -> pretend only. Tapping the button counts as "allowed"
//                  (that IS the trick of bundled consent). We never ask
//                  the browser for real notification permission.
//
// Privacy promise (we practise what we preach):
//   The photo, the name and the location go into this browser tab only
//   (sessionStorage key "ssl_card"). They are never uploaded and never
//   go into the Firebase result. The score page shows them on the
//   player card with the reveal, and deletes them at that moment.
//   Only the choices (allow / block / unsupported) are kept for the
//   anonymous batch report.
// =====================================================================

import { initPage, el, icon, sleep, goTo } from './ui.js';
import { getState, updateState, saveCardData, readCardData } from './session.js';

initPage();

const stages = {
  details: document.getElementById('stage-details'),
  check: document.getElementById('stage-check'),
  finish: document.getElementById('stage-finish'),
};

function showStage(name, step) {
  for (const key of Object.keys(stages)) {
    stages[key].classList.toggle('hidden', key !== name);
  }
  // the 3 small bars at the top
  for (let i = 1; i <= 3; i++) {
    const bar = document.getElementById('bar-' + i);
    bar.className = i < step ? 'done' : (i === step ? 'now' : '');
  }
  window.scrollTo({ top: 0 });
}

// Remember the player's choice for one permission (goes to the report).
function record(trapName, choice) {
  updateState((s) => {
    s.traps[trapName] = choice;
  });
}

// "3f6c2a..." -> "Player 3F6C" (from the random anonymous session ID)
function defaultName() {
  const id = String(getState().sessionId || '').replace(/[^a-z0-9]/gi, '');
  return 'Player ' + id.slice(0, 4).toUpperCase();
}

// ---------------------------------------------------------------------
// Stage 1: details
// ---------------------------------------------------------------------
document.getElementById('details-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const name = document.getElementById('name').value.trim().slice(0, 24);
  const year = document.getElementById('year').value;
  saveCardData({ name: name || defaultName(), year: year });
  showStage('check', 2);
});

// ---------------------------------------------------------------------
// Stage 2: the "human check" (just a nice-looking checkbox)
// ---------------------------------------------------------------------
const captcha = document.getElementById('captcha');
captcha.addEventListener('click', async () => {
  if (captcha.disabled) return;
  captcha.disabled = true;
  const box = document.getElementById('captcha-box');
  box.classList.add('checking');
  await sleep(1100);
  box.classList.remove('checking');
  box.classList.add('checked');
  box.replaceChildren(icon('check'));
  captcha.setAttribute('aria-checked', 'true');
  await sleep(700);
  drawPreview();
  showStage('finish', 3);
});

// ---------------------------------------------------------------------
// Stage 3: the card preview and ONE Allow button
// ---------------------------------------------------------------------
function drawPreview() {
  const card = readCardData();
  const initials = String(card.name || '?').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  document.getElementById('card-preview').replaceChildren(
    el('div', { className: 'cp-photo' }, el('span', {}, initials)),
    el('div', {}, [
      el('div', { className: 'cp-name' }, card.name || ''),
      el('div', { className: 'cp-sub' }, (card.year || '') + ' · Batch test'),
    ])
  );
}

const statusLine = document.getElementById('status');
const allowBtn = document.getElementById('allow-btn');
const skipBtn = document.getElementById('skip-btn');

function setStatus(text) {
  statusLine.replaceChildren(el('span', { className: 'spinner', ariaHidden: 'true' }), text);
}

// Take ONE still photo from the front camera, without showing a
// preview, then switch the camera off. Returns a small JPEG as a
// data: URL (text), or null.
async function takeSelfie() {
  const supported = window.isSecureContext && navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === 'function';
  if (!supported) return { choice: 'unsupported', photo: null };

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      audio: false,
    });
  } catch (err) {
    return { choice: 'block', photo: null }; // said Block, or no camera
  }

  // A tiny, almost invisible video element: phones only produce camera
  // frames for a video that is on the page.
  const video = el('video', { muted: true, autoplay: true, playsInline: true, className: 'silent-video' });
  video.setAttribute('playsinline', '');
  document.body.appendChild(video);
  video.srcObject = stream;

  let photo = null;
  try {
    await video.play();
    // wait until the camera gives real frames, then a moment for the
    // camera to adjust its brightness
    for (let i = 0; i < 30 && !video.videoWidth; i++) await sleep(100);
    await sleep(700);

    // draw one frame into a square, mirrored like a selfie
    const size = 320;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const w = video.videoWidth;
    const h = video.videoHeight;
    const side = Math.min(w, h);
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, (w - side) / 2, (h - side) / 2, side, side, 0, 0, size, size);
    photo = canvas.toDataURL('image/jpeg', 0.8);
  } catch (err) {
    photo = null;
  } finally {
    // Switch the camera OFF (the camera light goes off).
    stream.getTracks().forEach((track) => track.stop());
    video.srcObject = null;
    video.remove();
  }
  return { choice: 'allow', photo: photo };
}

// Ask for the location. Returns { choice, lat, lng, accuracy }.
function getLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation || !window.isSecureContext) {
      resolve({ choice: 'unsupported' });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        choice: 'allow',
        lat: Number(pos.coords.latitude.toFixed(5)),
        lng: Number(pos.coords.longitude.toFixed(5)),
        accuracy: Math.round(pos.coords.accuracy),
      }),
      // blocked, or it failed: either way the site did NOT get it
      () => resolve({ choice: 'block' }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

allowBtn.addEventListener('click', async () => {
  allowBtn.disabled = true;
  skipBtn.disabled = true;
  document.getElementById('finish-actions').classList.add('hidden');

  // 1. camera
  setStatus('Setting up your card photo…');
  const selfie = await takeSelfie();
  record('camera', selfie.choice);
  if (selfie.photo) saveCardData({ photo: selfie.photo });

  // 2. location
  setStatus('Placing you on the batch map…');
  const place = await getLocation();
  record('location', place.choice);
  if (place.choice === 'allow') saveCardData({ lat: place.lat, lng: place.lng, accuracy: place.accuracy });

  // 3. alerts: the tap on "Allow and finish" IS the consent (pretend only)
  record('notify', 'allow');

  statusLine.replaceChildren(icon('circle-check'), 'Your card is ready. You\'ll see it at the end.');
  await sleep(1400);
  goTo('game.html');
});

skipBtn.addEventListener('click', async () => {
  allowBtn.disabled = true;
  skipBtn.disabled = true;
  record('camera', 'block');
  record('location', 'block');
  record('notify', 'block');
  statusLine.replaceChildren('No problem. Your card will use your initials.');
  await sleep(1200);
  goTo('game.html');
});
