# ScamShield Live 🛡️

> *A website that shows how easily people get fooled online, proves it with real data from our batch, and gives a tool to stay safe — built with only HTML, CSS and JavaScript.*

Web version of the **ScamShield** Flutter app. No frameworks, no build step, no AI. The scam checker is a deterministic rule engine ported from Dart to JavaScript.

---

## 1. What's inside

| Page | File | What it does |
|---|---|---|
| 1 Home | `index.html` | Start button, links to checker and report |
| 2 Footprint Mirror | `mirror.html` + `js/mirror.js` | Shows what any website can read about you without asking |
| 3 Confidence Check | `confidence.html` | 1–5 stars: "How good are you at spotting scams?" |
| 4 Player card: photo | `trap-camera.html` | Permission trap 1. Looks like a normal app step. Real camera prompt → 3-second live preview → camera switched off |
| 5 Player card: city | `trap-location.html` | Permission trap 2. Real location prompt → your exact position on a map (on your screen only) |
| 6 Player card: alerts | `trap-notify.html` | Permission trap 3. **Fake** HTML permission box + fake spam pop-ups, then the reveal of all three |
| 7 Spot the Scam | `game.html` + `js/game.js` + `js/rounds.js` | 8 rounds, 15 s timer, red flags highlighted by the engine |
| 8 Digital Arrest | `story.html` + `js/story.js` | Fake "CBI officer" video-call chat with 3 choices |
| 9 Score Card | `score.html` + `js/score.js` | Awareness score, badge, share; saves result once (survey mode) |
| 10 Batch Report | `report.html` + `js/report.js` | Stats for the whole batch, confidence gap, % fooled per round |
| 11 Checker | `check.html` + `js/check.js` | Paste any message → verdict, risk meter, highlighted red flags |
| 12 Stay Safe | `safe.html` | Official cybercrime numbers (with sources) + 6 golden rules |

Shared files:

- `css/style.css`: the one stylesheet (colours, buttons, every page's layout)
- `js/session.js`: remembers progress in `sessionStorage` (survey/demo mode, anonymous ID)
- `js/ui.js`: helpers (top bar, typing effect, toast, count-up, safe element builder, highlighter)
- `js/engine.js`: **the ScamShield rule engine** (port of `reference/scamshield-dart/`)
- `js/firebase.js`: save/load anonymous results
- `firestore.rules`: database security rules
- `tests/engine.test.html` + `tests/cases.js`: engine test page

## 2. Run it on your laptop

ES modules don't work from `file://`, so use a tiny local server. From inside the `scamshield-live` folder:

```powershell
python -m http.server 8080
```

Then open http://localhost:8080. (Or `npx serve` if you prefer Node.)

**Test on your phone (same Wi-Fi):** run `python -m http.server 8080 --bind 0.0.0.0`, find your laptop's IP with `ipconfig` (e.g. `192.168.1.5`) and open `http://192.168.1.5:8080` on the phone.
Camera and location **need HTTPS**, so on plain `http://` over Wi-Fi those two traps show "not available". Everything else works. Test the traps on GitHub Pages (HTTPS).

**Demo mode:** add `?demo` to any URL (e.g. `index.html?demo`). It sticks for the whole tab, shows a yellow DEMO pill, never saves to Firebase, shows "Skip to story →" after round 3, and lets you tap the timer to pause. Close the tab to leave demo mode.

## 3. Engine tests

Open **http://localhost:8080/tests/engine.test.html**. It runs:

- the detector unit tests from `rules_test.dart` (40 checks)
- the 4 demo samples from `demo_samples.dart`
- all **289** cases from `eval_harness_test.dart`
- all **55** held-out cases from `heldout_eval_test.dart`
- the 8 game rounds (scam rounds must be flagged, legit rounds must be SAFE)

Current result: **396 / 396 passed** (100% match with the Dart labels; every expected signal fires and every highlight position is exact).

## 4. Firebase setup (for the batch report)

Until you do this, the site works fully but the report says "Results database not connected yet."

1. Go to https://console.firebase.google.com → **Add project** → name it `scamshield-live` → you can turn Google Analytics **off** → Create.
2. Left menu → **Build → Firestore Database → Create database** → choose **production mode** → location **asia-south1 (Mumbai)** → Enable.
3. Left menu → **Build → Authentication → Get started → Sign-in method → Anonymous → Enable → Save**.
4. Project Overview (⚙️) → **Project settings → Your apps → `</>` (Web)** → nickname `scamshield-web` → Register (no hosting needed). Copy the `firebaseConfig` object.
5. Paste those values into `js/firebase.js` where it says `// TODO: paste your Firebase config`.
6. Firestore → **Rules** tab → delete everything → paste the contents of `firestore.rules` → **Publish**.
7. Authentication → **Settings → Authorized domains** → add `YOUR-USERNAME.github.io` (localhost is already there).

> The Firebase "apiKey" is **not a secret**: it's normal for it to be in web code. Security comes from the rules: anyone can read the anonymous results, a visitor can only *create* one correctly-shaped result, and nobody can edit or delete.

### What gets saved (nothing else is allowed by the rules)

```js
{ v: 1, confidence: 1-5, correct: 0-8, awareness: 0-100,
  rounds: [8 × true/false], traps: { camera, location, notify },
  escaped: true/false, createdAt: server time }
```

No name, email, IP, device info, location or images. The document ID is a random session ID, and since updates are forbidden, refreshing the score page can never create a duplicate.

### Firestore rules (same as `firestore.rules`)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /results/{sessionId} {
      allow read: if true;
      allow create: if request.auth != null && isValidResult(request.resource.data);
      allow update, delete: if false;
    }
    match /{document=**} { allow read, write: if false; }
    // isValidResult(): exact keys, int ranges, 8 booleans, allowed trap
    // values, createdAt == request.time (see firestore.rules for full text)
  }
}
```

## 5. Deploy to GitHub Pages

```powershell
git init
git add .
git commit -m "ScamShield Live"
```

1. Create a new **public** repo on GitHub called `scamshield-live` (no README).
2. Push:
   ```powershell
   git remote add origin https://github.com/YOUR-USERNAME/scamshield-live.git
   git branch -M main
   git push -u origin main
   ```
3. Repo → **Settings → Pages → Source: Deploy from a branch → main / (root) → Save**.
4. After ~1 minute the site is live at `https://YOUR-USERNAME.github.io/scamshield-live/`.

**QR code:** the report page draws a QR code for the live URL automatically (when there are fewer than 5 results). For a poster/slide, open the report on the live site and screenshot it, or save it as `assets/qr.png`.

**Offline backup (night before the event):** open `report.html?demo` on the live site → press **⬇ Export snapshot** → put the downloaded file at `assets/report-snapshot.json` → commit and push. If Firebase is unreachable on stage, the report reads this file instead and says "📦 Offline snapshot from …".

## 6. Privacy: how each feature practises what it preaches

| Feature | What happens | What never happens |
|---|---|---|
| Camera (player card photo) | Live preview on your screen for 3 s, then every camera track is stopped | No photo, no recording, no upload, no canvas |
| Location (player card city) | Position shown on a map on your phone | Coordinates are never sent to us or saved (map tiles load from OpenStreetMap like any map app) |
| Notifications (player card alerts) | A **fake** permission box made of HTML | `Notification.requestPermission()` is never called |
| Footprint Mirror | Browser info shown only to you; one city lookup via `ipapi.co` | Nothing stored or sent to us |
| Checker | Runs 100% in the browser | No network request while checking (verify in DevTools → Network) |
| Survey | Anonymous scores + allow/block choices | No personal data at all |

User text is never put into the page with `innerHTML`. Every message is built with `textContent` / DOM nodes (see `el()` and `buildHighlighted()` in `js/ui.js`), so a pasted `<script>` is shown as plain text.

## 7. How the engine decides (explain this to judges)

1. **10 detectors** look for patterns with regular expressions: secret request (OTP/PIN), payment demand, remote access (AnyDesk), digital-arrest threat, urgency, reward lure, job lure, risky link, brand impersonation, callback number.
2. **Weights:** critical demands = 60 (secret, payment, remote access, digital arrest) · techniques = 40 (urgency, reward, job) · supporting = 20 (impersonation), 15 (callback). Links: 20 + 10 (no https) + 15 (shortener) + 20 (IP address) + 25 (fake bank domain), max 60 for all links.
3. Each signal type counts **once**. Impersonation only counts if something else was found.
4. If anything was found, the score is at least 30 (never SAFE when there is evidence).
5. **Demand gate:** a message can only be DANGEROUS if it *demands* something (secret, money, remote access, police threat) or mixes urgency with a link/lure. Otherwise it stays SUSPICIOUS (max 59): we don't call a bare link "dangerous".
6. Score < 30 = 🟢 SAFE · < 60 = 🟡 SUSPICIOUS · otherwise 🔴 DANGEROUS.
7. **Advice guards:** "Never share your OTP" is advice, not a request, so it stays SAFE.

## 8. Awareness score formula

```
round(correct ÷ 8 × 60)  +  10 per trap blocked (max 30)  +  10 if you escaped the story
```

Badges: ≥ 85 🥷 Cyber Ninja · 60–84 🛡️ Alert Citizen · 35–59 ⚠️ Needs Practice · < 35 🎯 Easy Target.

## 9. Sources for the Stay Safe numbers

All four numbers come from one official release: Ministry of Home Affairs, *"National Cyber Crime Data"*, PIB, 21 July 2026 — https://www.pib.gov.in/PressReleasePage.aspx?PRID=2287039

- 1,01,928 cyber crime cases registered in India in 2024 (NCRB *Crime in India*; 50,035 in 2020)
- 11,073 of them in Uttar Pradesh (2024, Annexure-I)
- More than 65,89,201 financial-fraud complaints and more than ₹55,050 crore reported on NCRP, 2021–2025
- More than ₹11,158 crore saved in more than 32.80 lakh complaints via CFCFRMS / 1930 (till 30.06.2026)

Re-check these before the event, and only replace them with newer **official** figures (I4C / MHA, NCRB, PIB, RBI).

---

## 10. Presentation script (~5 min, phone mirrored to projector)

Open `index.html?demo` on your phone. Use a **mobile hotspot**, not college Wi-Fi.

| Time | Page | What you say |
|---|---|---|
| 0:00 | Home | 🎤 "Let's see how safe we really are online." |
| 0:15 | Mirror | 🎤 "Before I say anything, look what my browser already revealed. I didn't ask permission for any of this. Every website can see it." |
| 0:30 | Confidence | 🎤 "Remember your answer, because we'll check it at the end." |
| 0:40 | Player card: photo (tap **Take photo → Allow**) | 🎤 "It's asking for a photo for my score card. Sounds reasonable, right? One tap." |
| 1:00 | City + alerts → the reveal | 🎤 "My city, then alerts for my result. Every request had a friendly reason." *(spam floods in, reveal appears)* "That wasn't a player card. In under a minute I gave a website my camera, my exact location, and the right to message me forever. No hacking. Just trust." |
| 1:30 | Game: 3 rounds, then **Skip to story** | 🎤 "Would you spot this one? Most of our batch didn't." |
| 2:30 | Story | 🎤 "People have lost their life savings to this exact script." |
| 3:00 | Score | (quick look at the badge) |
| 3:15 | Report | 🎤 "I tested N students from our own batch. X% felt confident. Only Y% were actually safe. Look at this gap." |
| 4:00 | Checker (**Try a sample** → sample 1) | 🎤 "So I built a tool. Paste any message and it tells you why it's dangerous, entirely on your phone." |
| 4:40 | Stay Safe → close | 🎤 "Everything you saw is built with only HTML, CSS and JavaScript, the same things we learned in class. Thank you." |

**Backup:** mobile hotspot, the offline report snapshot, and a screen recording of the whole demo.

### Likely judge questions

- **Is the camera trick hacking?** No. It's the browser's own permission system. The danger is our careless tap.
- **Do you store photos or location?** Never. Only anonymous scores and allow/block choices.
- **Is it AI?** No. It's a rule engine, so every verdict can be explained. Security tools must be explainable.
- **How does the report update?** Each result is saved anonymously to Firebase Firestore, and the report page reads and calculates live in JavaScript.
- **Will it catch every scam?** No tool does. It catches common patterns, and when unsure it says SUSPICIOUS, never SAFE.
- **Where does the engine come from?** My ScamShield Android app (Flutter). I rewrote its rule engine in JavaScript and it matches the original on all 344 test messages.

## 11. Before-the-event checklist

- [x] Engine test page: 100% pass (396/396)
- [ ] Full flow on Android Chrome **and** iPhone Safari
- [ ] Camera/location prompts work over HTTPS (GitHub Pages) and the camera light turns off after 3 s
- [ ] Denying every permission still works smoothly
- [ ] `?demo` persists across all pages and never writes to Firebase
- [ ] Survey result saves exactly once (refreshing the score page doesn't duplicate)
- [ ] Report works with 0, 1, 5 and 50+ results
- [ ] Report snapshot fallback works with Wi-Fi off
- [ ] Checker shows nothing uploaded (DevTools → Network is empty while checking)
- [ ] 10 classmates test at once with no errors
- [ ] Re-verify the Stay Safe numbers


## 12. Design notes

The interface was redesigned with the method from **unslop** by Damir Sokolovsky ([@heydamir](https://x.com/heydamir), [github.com/heydamir/unslop](https://github.com/heydamir/unslop), CC BY 4.0).

- **Character:** candid, forensic, a little theatrical
- **World:** an investigator's desk at night. Phone screenshots are the evidence, and red marker goes on the lines that lie
- **Colour:** one dark "ink" neutral ramp, one teal accent used rarely (progress, selection), red only where it means danger
- **Type:** IBM Plex Sans for the interface, IBM Plex Mono for figures and meta
- **Icons:** line icons from [Lucide](https://lucide.dev) (ISC licence), all in `assets/icons.svg`. No emoji in the interface; emoji only appear inside the fake scam messages, because real scams use them
- **Signature:** the hand-drawn red marker underline on flagged words (game and checker). Red = the attack itself (asks for a secret, money, remote access, a police threat, a risky link), amber = a pressure trick (panic, prize, easy job), dotted = a supporting hint (brand name, phone number)

### Why the permission traps look trustworthy

Real scams don't look scary. They look like a friendly app asking for something with a good reason. So pages 4 to 6 are a "player card" set-up that belongs to this site: a photo for your score card, your city for the batch map, an alert when the report is ready. Each has a "Skip" option, like real apps. Nothing reveals itself until the end of page 6, where one screen shows what each permission gave away, why it worked (borrowed trust, a helpful reason, one tap each) and how to reset the permissions in the browser. The camera still switches off after 3 seconds, the location never leaves the phone and the notification prompt is fake HTML.
