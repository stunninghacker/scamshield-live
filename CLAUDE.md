# ScamShield Live — Build Spec for Claude Code

> Read this whole file before writing any code. It holds every decision already
> made. Don't re-decide them. Ask the owner only when something here is unclear.

---

## 0. Context

- **Owner:** Samarth Pandey, 1st-year B.Tech CSE (Cybersecurity), SRMU Lucknow, program run with L&T.
- **Why:** college website competition set by the L&T faculty. The class is currently learning **HTML, CSS and JavaScript**, and the project must clearly be built with those. The winner goes on to a department-level round.
- **Presentation style:** Samarth runs the whole demo himself on his own phone/laptop, mirrored to a projector. Judges watch and don't play live.
- **Real data:** before the event, classmates play the site (Survey Mode). Their anonymous results power the "Batch Awareness Report".
- **Existing work:** this is the web version of Samarth's Flutter app **ScamShield** (github.com/stunninghacker/ScamShield). Its rule engine is in `reference/scamshield-dart/` and must be **ported to JavaScript** (see §6).

**One-line pitch:** *A website that shows how easily people get fooled online, proves it with real data from our batch, and gives a tool to stay safe — built with only HTML, CSS and JavaScript.*

---

## 1. Hard constraints

1. **Plain HTML + CSS + vanilla JavaScript only.** No React, Vue, Tailwind, jQuery, bundlers, npm build steps or TypeScript. Native ES modules (`<script type="module">`) are fine.
2. Allowed external pieces, loaded from CDN:
   - **Firebase JS SDK** (Firestore + Anonymous Auth): survey results only
   - **Leaflet + OpenStreetMap tiles**: location-trap map only
   - **Google Fonts**: optional
   - **A QR code library** (e.g. `qrcode` from a CDN) is optional. A pre-made QR image also works.
3. **Hosting:** GitHub Pages (static). Every page must work as static files.
4. **Mobile first.** Design for a 360–430px wide phone screen, then scale up.
5. **The code must be explainable by a first-year student.** Clear names, short functions, comments in simple English. No clever one-liners. The owner must be able to explain every file to judges.
6. **No AI/LLM calls anywhere.** The checker is a deterministic rule engine.

---

## 2. Privacy and ethics rules (non-negotiable)

This is a cybersecurity project, so it has to practice what it preaches.

| Feature | Allowed | Never |
|---|---|---|
| Camera trap | Show live preview on the user's own screen for ~3 s, then stop all tracks | Capture frames, take photos, record, upload, draw to canvas for export |
| Location trap | Show user's position on a map, on their own device | Send, save or log coordinates anywhere |
| Notification trap | **Fake in-page modal** that looks like a permission prompt, plus fake in-page spam popups | Call `Notification.requestPermission()` or send real notifications |
| Footprint Mirror | Read browser info and show it to the user only | Save or send any of it |
| City lookup | One IP-geolocation request (e.g. `ipapi.co/json`), shown only to the user; fall back to timezone if it fails | Store the result |
| Survey results | Anonymous: random session ID, scores, star rating, allow/block choices, timestamp | Names, emails, IP, device info, location, images |

- Each trap must **reveal itself** right after, explaining it was a demo and nothing was recorded.
- Home page footer: *"No login · No photos, location or personal info is stored."*
- **Don't build any working fake login page** for a real organization. The game shows *screenshot-style mock-ups* of scam messages inside the game UI, which is fine. Don't use real bank logos. Text mentions of brand names inside scam message examples are okay (they're what real scams look like).
- Firebase config keys in client code are public by design. Security comes from **Firestore rules** (§8).

---

## 3. File structure

```
scamshield-live/
├── index.html            # Page 1 Home
├── mirror.html           # Page 2 Footprint Mirror
├── confidence.html       # Page 3 Confidence Check
├── trap-camera.html      # Page 4
├── trap-location.html    # Page 5
├── trap-notify.html      # Page 6
├── game.html             # Page 7 Spot the Scam (8 rounds)
├── story.html            # Page 8 Digital Arrest story
├── score.html            # Page 9 Your Score Card
├── report.html           # Page 10 Batch Awareness Report
├── check.html            # Page 11 ScamShield Checker
├── safe.html             # Page 12 Stay Safe
├── css/
│   └── style.css         # one shared stylesheet
├── js/
│   ├── session.js        # mode (survey/demo), session id, progress in sessionStorage
│   ├── mirror.js
│   ├── traps.js          # camera, location, notification logic
│   ├── rounds.js         # game content (data only)
│   ├── game.js
│   ├── story.js          # story script (data) + logic
│   ├── score.js
│   ├── firebase.js       # init + saveResult() + loadResults()
│   ├── report.js
│   ├── engine.js         # ScamShield rule engine (port of Dart)
│   ├── check.js          # checker UI
│   └── ui.js             # shared helpers (typing effect, toast, nav)
├── assets/               # icons, QR image, og-image
├── tests/
│   └── engine.test.html  # open in browser → runs engine test cases, shows pass/fail
└── README.md
```

A multi-page site (instead of one big single-page app) is intentional: it's easier for a first-year student to explain and matches what the class is learning.

---

## 4. Design system

- **Theme:** dark "cyber" look, clean rather than cluttered or "hacker-movie".
  - Background `#0b0f17`, surface `#131a26`, border `#1f2a3a`
  - Text `#e6edf3`, muted `#8b98a9`
  - Accent (brand) `#22d3ee` (cyan)
  - Danger `#ef4444`, Warning `#f59e0b`, Safe `#22c55e`
- **Fonts:** `Inter` (UI) and `JetBrains Mono` (data/typing effects). Fallback to system fonts.
- **Shapes:** 14–16px rounded corners, soft shadows, large tap targets (min 48px tall).
- **Motion:** subtle fades/slide-ups (200–300ms). Typing effect on the Mirror page. Shake on wrong answer. Count-up numbers on the report. Respect `prefers-reduced-motion`.
- **Accessibility:** never use color alone. Verdicts always have icon + text + color. Contrast at least WCAG AA.
- **Every page:** a small top bar with logo "🛡️ ScamShield Live" and a progress indicator (e.g. "Step 4 / 12").
- Avoid the generic AI-template look (purple gradients, three identical feature cards).

---

## 5. Modes (`js/session.js`)

| | Survey Mode (default) | Demo Mode (`?demo` on any URL) |
|---|---|---|
| Saves results to Firebase | ✅ once, at Score page | ❌ never |
| Game | all 8 rounds, 15 s timer | "Skip ahead" button after round 3; timer can pause (tap timer) |
| Badge | none | small "DEMO" pill in the top bar |

- On first load, create `sessionId = crypto.randomUUID()` and store it in `sessionStorage`. Store `mode` there too, so `?demo` persists across pages.
- Store progress in `sessionStorage` under one key, `ssl_state`:

```js
{
  sessionId, mode,                     // 'survey' | 'demo'
  confidence: 1-5,
  traps: { camera: 'allow'|'block'|'unsupported',
           location: 'allow'|'block'|'unsupported',
           notify: 'allow'|'block' },
  rounds: [ { id, correct: true/false, timeMs } ],   // 8 entries
  story: { escaped: true/false, choices: ['a','b','b'] },
  saved: false
}
```

- If someone opens a later page directly with no state, show a friendly "Start from the beginning" button.

---

## 6. ScamShield engine → `js/engine.js` (the most important part)

Port **faithfully** from `reference/scamshield-dart/`:
- `constants.dart`: weights, thresholds, shortener hosts, suspicious TLDs, brand keywords, trusted hosts
- `signals.dart`: the 10 detectors with all regexes and guards
- `scam_engine.dart`: scoring pipeline and the demand gate

**Public API:**
```js
export function analyze(text) → {
  verdict: 'SAFE' | 'SUSPICIOUS' | 'DANGEROUS',
  score: 0-100,
  signals: [{ id, label, weight, matchedText, start, end, detail }],
  breakdown: { LINK_RISK: 45, SECRET_REQUEST: 60, ... },
}
```

**Scoring rules to preserve exactly:**
- Weights: SECRET_REQUEST 60, PAYMENT_PULL 60, REMOTE_ACCESS 60, DIGITAL_ARREST 60, URGENCY_THREAT 40, REWARD_LURE 40, JOB_LURE 40, IMPERSONATION 20, CALLBACK 15.
- LINK_RISK per URL = base 20, +10 http, +15 shortener, +20 IP host, +25 lookalike. The total from all links is capped at 60.
- Every non-link class counts **once** per scan (spans still highlight every occurrence).
- IMPERSONATION fires only if some other signal fired.
- Clamp to 0..100. If any signal fired and score < 30, floor to 30.
- **Demand gate:** if there is no SECRET/REMOTE/ARREST/PAYMENT **and** no (URGENCY + LINK/REWARD/JOB), cap score at 59.
- Verdict: < 30 SAFE, < 60 SUSPICIOUS, otherwise DANGEROUS.
- Keep all advisory/negation guards ("never share your OTP" must stay SAFE).

**Dart → JS porting notes:**
- Dart `RegExp(..., caseSensitive:false)` → JS `/.../gi`. Use `matchAll` (needs the `g` flag). Create fresh regexes or reset `lastIndex` to avoid stateful bugs.
- Dart raw strings `r'...'` → JS regex literals; re-check escaping of `'`, `/`, `₹`.
- Use the `u` flag where `₹` appears.
- `_maskRanges` / `_withoutUrls` must keep string length identical so offsets stay valid.

**Tests (`tests/engine.test.html`):**
- Port **every** case from `rules_test.dart`, `eval_harness_test.dart` and `heldout_eval_test.dart` into a JS array `{ text, expected }`.
- The page runs them all and shows a green/red table and a total "X / Y passed".
- **Target: 100% match with the Dart engine.** Fix the port, never the expected labels.
- Also include the 4 samples from `demo_samples.dart` (expected: DANGEROUS, DANGEROUS, SUSPICIOUS, SAFE).

**Explanation text per signal** (used in the checker and game reveals):

| id | English | Hindi |
|---|---|---|
| SECRET_REQUEST | Asks for OTP / PIN / password. No real bank ever asks. | OTP/PIN kabhi share na karein. |
| PAYMENT_PULL | Asks you to pay or send money. | Paise bhejne ko keh raha hai. |
| REMOTE_ACCESS | Asks you to install AnyDesk / share screen. | Screen share ya app install na karein. |
| DIGITAL_ARREST | Fake police / CBI threat. Police never arrest on video call. | Video call par koi arrest nahi hota. |
| URGENCY_THREAT | Creates panic: "blocked", "24 hours". | Darr aur jaldi — scam ka sign. |
| REWARD_LURE | Prize, lottery or cashback bait. | Free inaam ka laalach. |
| JOB_LURE | Easy-money job or task offer. | Aasaan kamai wali naukri — fraud. |
| LINK_RISK | Risky or fake-looking link. | Link par click na karein. |
| IMPERSONATION | Pretends to be a bank, govt or courier. | Bank/sarkar ka naam leke dhokha. |
| CALLBACK | Pushes you to call a number. | Diye gaye number par call na karein. |

---

## 7. Page-by-page spec

The 🎤 lines are Samarth's presentation script. Put them in the README, not on the pages.

### Page 1: `index.html` Home
- Title **"ScamShield Live 🛡️"**, tagline *"Think you can't be scammed? Let's find out."*
- Big **▶ Start** button → `mirror.html` (keep `?demo` if present).
- Small links: "Just check a message →" (`check.html`), "See batch report →" (`report.html`).
- Footer: privacy line + "Built with HTML, CSS & JavaScript".
- 🎤 *"Let's see how safe we really are online."*

### Page 2: `mirror.html` Footprint Mirror
- Cards appear one by one (typing effect, ~400ms apart):
  - 📱 Device/OS (from `navigator.userAgentData` with a `userAgent` fallback)
  - 🌐 Browser + version
  - 🖥️ Screen (`screen.width × screen.height`, pixel ratio)
  - 🔋 Battery % + charging (only if `navigator.getBattery` exists; otherwise hide the card. iPhones don't expose it)
  - 🕐 Local time + timezone (`Intl.DateTimeFormat().resolvedOptions().timeZone`)
  - 📍 Approx city (IP lookup, 3s timeout, fallback "Asia/Kolkata region")
  - 🗣️ Language (`navigator.language`)
  - 🌗 Dark mode on/off (`matchMedia`)
  - 💻 CPU cores / RAM hint (`hardwareConcurrency`, `deviceMemory` if available)
- Red callout: **"You didn't share any of this. Your browser did."**
- Note: *"Shown only to you. Nothing saved."*
- **Next →** `confidence.html`
- 🎤 *"I didn't ask permission for any of this. Every website can see it."*

### Page 3: `confidence.html` Confidence Check
- *"How good are you at spotting scams?"* with 5 big tappable stars.
- Save `confidence`, then auto-advance after 600ms → `trap-camera.html`.
- 🎤 *"Remember your answer, because we'll check it at the end."*

### Page 4: `trap-camera.html` Camera Trap
- Looks like a generic "verification" page: robot icon, *"🤖 Verify you're human. Allow camera access to continue."*, button **Continue**.
- On Continue: `navigator.mediaDevices.getUserMedia({ video: true })`.
  - **Allowed:** show `<video>` (muted, playsinline, mirrored) inside a red pulsing frame with the overlay **"🚨 This website can now SEE you."** After 3s, stop every track (`stream.getTracks().forEach(t => t.stop())`), hide the video, show the reveal card. Record `allow`.
  - **Denied/error:** green card **"✅ Smart move! Never give camera access to unknown sites."** Record `block`.
  - **No camera API / insecure context:** record `unsupported`, show an info card.
- Reveal card (always): *"This was a demo. No photo was taken or saved."* plus one tip.
- **Next →** `trap-location.html`
- 🎤 *(tap Allow)* *"One tap. No hacking. That's all a scammer needs."*

### Page 5: `trap-location.html` Location Trap
- Fake delivery page: 📦 *"Your parcel is waiting! Allow location to find the nearest pickup point."*, button **Find my parcel**.
- `navigator.geolocation.getCurrentPosition` (timeout 8s).
  - **Allowed:** Leaflet map zooms to the position with a marker and the banner **"🚨 A scammer now knows where you are."** Coordinates stay in memory only. Record `allow`.
  - **Denied:** green **"✅ Good! Delivery companies never need this from a random link."** Record `block`.
- Reveal: *"Your location was never sent or saved."*
- **Next →** `trap-notify.html`
- 🎤 *"Fake delivery messages are one of the most common scams right now."*

### Page 6: `trap-notify.html` Notification Trap
- Prize page: 🎉 *"Congratulations! You've won an iPhone! Tap Allow to claim."*, button **Claim Prize**.
- Show a **fake** browser-style permission box (built in HTML), "*this site* wants to show notifications", with **Allow / Block**.
  - **Allow:** 5–6 fake notification toasts slide in quickly ("⚠️ Your phone has 3 viruses!", "💰 Claim ₹10,000 now!", "🔒 Account blocked!", …), then the reveal **"🚨 This is how adware takes over phones."** Record `allow`.
  - **Block:** **"✅ Correct! Real prizes never need this."** Record `block`.
- Reveal: *"No real notifications were enabled. This was a simulation."*
- **Start the Game →** `game.html`

### Page 7: `game.html` Spot the Scam (8 rounds)
- Top bar: `Round n / 8` · ⏱️ 15s ring timer · score.
- Middle: the round's message rendered as a **realistic mock-up** by `type`:
  - `sms` (phone SMS bubble with sender ID), `whatsapp` (green chat bubble, unknown number, profile placeholder), `email` (from / subject / body), `upi` (payment-app style collect request card: amount, "PAY" button), `qr` (QR card with caption, using a placeholder QR graphic only, not a real scannable payment QR).
- Bottom: two big buttons **🚨 SCAM** and **✅ LEGIT**.
- After answering (or timeout = wrong):
  - Green ✅ / red ❌ feedback, with a shake if wrong.
  - **Red flags highlighted** in the message. Use `engine.analyze(round.text)` spans for scam rounds so the game and checker agree. Add any extra `round.flags` text matches.
  - One-line `round.explain`.
  - **Next Round** button.
- Demo mode: show **Skip to story →** after round 3.
- Content lives in `js/rounds.js` as data:

```js
{ id, type, sender, subject?, text, answer: 'scam'|'legit', explain, flags?: [] }
```

The 8 rounds (write realistic Indian-context text; scam rounds must score DANGEROUS or SUSPICIOUS in `engine.analyze`, and legit rounds must score SAFE. Add this check to the engine test page):
1. Fake KYC SMS: account blocked, update KYC at a lookalike link. **scam**
2. Genuine bank debit alert: "Rs.1,250 debited… not you? call the number on the back of your card", with no link. **legit**
3. WhatsApp part-time job: "earn ₹5000/day liking YouTube videos, join Telegram". **scam**
4. Courier SMS: parcel on hold, pay ₹25 re-delivery fee via a short link. **scam**
5. Genuine OTP from an app: "123456 is your login OTP. Do not share it with anyone." **legit**
6. UPI collect request posing as "receive ₹5,000 cashback" (with PAY button). **scam**. Explain: *"You never enter your PIN to RECEIVE money."*
7. QR on a WhatsApp message: "scan this QR to receive your refund". **scam**
8. Genuine college/exam email: timetable released, check the official portal, no link to click, no payment. **legit**

### Page 8: `story.html` Digital Arrest story
- WhatsApp-video-call style chat from **"CBI Officer R. Sharma"** (generic avatar icon, not a real photo). Bubbles appear with a typing indicator.
- 3 decision points (data in `js/story.js`):
  1. 👮 *"Your Aadhaar is linked to a money laundering case. A warrant is issued."* → A: *"I'm scared, what do I do?"* · B: *"I'll hang up and call 1930."*
  2. 👮 *"This is confidential. Stay on video call. You are under digital arrest."* → A: *"Okay sir."* · B: *"Police never arrest anyone on a video call."*
  3. 👮 *"Transfer ₹4,20,000 to the RBI safe account for verification."* → A: *"Sending now."* · B: *"Block and report."*
- Any safe (B) choice ends the story immediately with the **escaped** ending. Three A choices lead to the **lost** ending.
  - **Lost:** screen fades dark red: **"💸 ₹4,20,000 lost."** *"This is a real scam pattern reported across India."*
  - **Escaped:** green: **"🛡️ You escaped! Real police, CBI or RBI NEVER arrest or ask for money on a video call."**
- Always end with: *"Report fraud: call 1930 or visit cybercrime.gov.in."*
- **See my score →** `score.html`
- 🎤 *"People have lost their life savings to this exact script."*

### Page 9: `score.html` Score Card
- Score `x / 8` (count-up), confidence stars vs result, trap results (✅/❌ each), story result.
- **Awareness score (0–100)**, the formula shown on the report page too:
  `round(correct/8 × 60) + 10 per trap blocked (max 30) + 10 if escaped story`
- Badge: ≥ 85 🥷 **Cyber Ninja** · 60–84 🛡️ **Alert Citizen** · 35–59 ⚠️ **Needs Practice** · < 35 🎯 **Easy Target**
- In **survey mode**, call `saveResult()` exactly once (guard with `state.saved`) and show a "✔ Your anonymous result was added to the batch report" toast.
- **Share** button (Web Share API, fallback copy link) with text: *"I scored X/100 on ScamShield Live 🛡️ Can you beat me? <link>"*
- **See batch report →** `report.html`

### Page 10: `report.html` Batch Awareness Report
- Loads all results (`loadResults()`), computes everything client-side.
- Header: 👥 **N students tested**
- Stat tiles (count-up animation):
  - 🧠 Average awareness score
  - 😎 % who rated themselves 4–5 ⭐
  - 🎯 % who actually scored ≥ 7/8
  - 📸 % who allowed camera · 📍 % allowed location · 🔔 % allowed notifications
  - 💸 % who "lost money" in the story
- **Confidence Gap banner** (the hero element): *"X% felt confident. Only Y% actually were."*
- Bar chart (plain CSS bars or `<canvas>`, no chart library needed): % fooled per round, with the most-fooled round highlighted.
- Closing line: **"We think we're safe. We're not. That's why cyber awareness matters."**
- If N < 5: show *"Collecting data… share the link!"* with the QR.
- **Demo-only safety net:** if Firebase is unreachable, read a cached `assets/report-snapshot.json`. Add a small **"Export snapshot"** button in demo mode that downloads the current stats as that JSON, so the owner can save it the day before.
- **How do we fix this? →** `check.html`
- 🎤 *"I tested N students from our own batch. Look at this gap."*

### Page 11: `check.html` ScamShield Checker
- Textarea *"Paste any suspicious message or link"*, buttons **Check** and **Try a sample** (cycles through the 4 demo samples).
- Result:
  - Big verdict pill (🔴 DANGEROUS / 🟡 SUSPICIOUS / 🟢 SAFE) and an animated risk meter 0–100.
  - The message with every signal span highlighted (color by signal; tap a highlight to see its label).
  - "Why?" list from `breakdown`, e.g. `+60 Asks for OTP`, `+40 Urgency`, `+45 Suspicious link`.
  - Hindi line(s) for the top 2 signals.
  - **What to do:** don't click · block sender · report at 1930 / cybercrime.gov.in.
- Badge: *"🔒 Runs 100% on your device. Nothing is uploaded."* (true: no network calls on this page).
- Escape all user text when rendering highlights. Build DOM nodes / `textContent`, **never `innerHTML` with user input**.
- **Stay safe tips →** `safe.html`
- 🎤 *"Paste any message and it tells you why it's dangerous, entirely on your phone."*

### Page 12: `safe.html` Stay Safe
- **India cybercrime numbers: TODO, verify before shipping.** Pull the latest figures only from official sources (I4C / MHA, NCRB, PIB press releases, RBI) and show the source + year under each number. **Never invent or estimate numbers.** If a figure can't be verified, leave it out.
- 6 golden rules:
  1. Never share OTP, PIN, CVV or passwords
  2. Real police / CBI never arrest anyone on a video call
  3. Never allow camera, location or notifications on unknown sites
  4. Check links before clicking. Short or weird links = danger
  5. You never need to pay or enter a PIN to receive money
  6. In doubt? Call **1930** or visit **cybercrime.gov.in**
- **🔁 Play again** → `index.html`
- 🎤 Close: *"Everything you saw is built with only HTML, CSS and JavaScript, the same things we learned in class. Thank you."*

---

## 8. Firebase (`js/firebase.js`)

- Firestore + Anonymous Auth. Collection `results`, one doc per session (`doc id = sessionId`).
- Document shape (nothing else is allowed):

```js
{
  v: 1,
  confidence: 1-5,
  correct: 0-8,
  awareness: 0-100,
  rounds: [true,false,...],          // 8 booleans
  traps: { camera, location, notify }, // 'allow'|'block'|'unsupported'
  escaped: true|false,
  createdAt: serverTimestamp()
}
```

- **Security rules** (put them in `firestore.rules` and the README):
  - `read`: allowed (data is anonymous aggregate input)
  - `create`: only if `request.auth != null`, the doc has exactly the allowed keys, types and ranges are valid, `createdAt == request.time`
  - `update`, `delete`: denied
- The config object goes in `js/firebase.js` with a clear `// TODO: paste your Firebase config` comment. Walk the owner through creating the project (Console → Add project → Firestore (production mode, region asia-south1) → Authentication → Anonymous on → Web app config).
- Wrap every Firebase call in try/catch. The site must never break if Firebase is down.

---

## 9. Build order (one phase at a time, owner checks each before moving on)

1. **Skeleton:** all 12 HTML pages, `style.css` design system, top bar, navigation, `session.js` (modes + state). Every page reachable.
2. **Engine:** `engine.js` port + `tests/engine.test.html`. **Must hit 100% on the ported tests before continuing.**
3. **Checker page:** full UI with highlights.
4. **Mirror page.**
5. **Three traps.**
6. **Game:** rounds data, mock-up renderers, timer, reveals, demo skip.
7. **Story page.**
8. **Score page:** awareness formula, badge, share.
9. **Firebase:** setup guide, save + load, rules.
10. **Report page:** stats, confidence gap, chart, snapshot export/fallback.
11. **Stay Safe page:** verified stats with sources.
12. **Polish:** animations, reduced-motion, accessibility pass, Lighthouse mobile (aim for 90+), favicon, `og:image`, test on Android Chrome **and** iPhone Safari.
13. **Deploy:** GitHub Pages, generate the QR code to `assets/qr.png`, README with run/deploy steps and the presentation script.

After each phase: list what changed, and how to test it on a phone.

---

## 10. Testing checklist (before the event)

- [ ] Engine test page: 100% pass
- [ ] Full flow on Android Chrome **and** iPhone Safari
- [ ] Camera/location prompts work over HTTPS (GitHub Pages) and the camera light turns off after 3 s
- [ ] Denying every permission still works smoothly
- [ ] `?demo` persists across all pages and never writes to Firebase
- [ ] Survey result saves exactly once (refreshing the score page doesn't duplicate)
- [ ] Report works with 0, 1, 5 and 50+ results
- [ ] Report snapshot fallback works with Wi-Fi off
- [ ] Checker shows nothing uploaded (DevTools → Network is empty while checking)
- [ ] No `innerHTML` with user input anywhere
- [ ] 10 classmates test at once with no errors

---

## 11. Data collection plan (owner does this)

1. Deploy, then share in class / batch WhatsApp groups: *"Can you spot a scam? 3-minute challenge 🎯 <link>"*
2. Target **50+ students** at least 3–4 days before the event.
3. The night before: open `report.html?demo`, press **Export snapshot**, and commit it as `assets/report-snapshot.json` (offline backup).

---

## 12. Presentation (~5 min, owner on stage, phone mirrored)

| Time | Page | Script |
|---|---|---|
| 0:00 | Home → Mirror | "Before I say anything, look what my browser already revealed." |
| 0:30 | Camera trap (Allow) | "One tap and this website can see me. No hacking." |
| 1:00 | Location + Notify traps | "Now it knows where I am, and can spam me forever." |
| 1:30 | Game, 3 rounds, skip | "Would you spot this one? Most of our batch didn't." |
| 2:30 | Story | "This exact script has cost people lakhs." |
| 3:15 | Report | "I tested N students. X% felt confident. Only Y% were actually safe." |
| 4:00 | Checker (sample 1) | "So I built a tool. It catches it and explains why." |
| 4:40 | Safe → close | "Built with only HTML, CSS and JavaScript. Thank you." |

**Backup:** use a mobile hotspot (not college Wi-Fi), keep the report snapshot, and have a screen recording of the full demo.

**Likely judge questions:**
- *Is the camera trick hacking?* No. It's the browser's own permission system. The danger is our careless tap.
- *Do you store photos or location?* Never. Only anonymous scores and allow/block choices.
- *Is it AI?* No. It's a rule engine, so every verdict can be explained. Security tools must be explainable.
- *How does the report update?* Each result is saved anonymously to Firebase Firestore, and the report page reads and calculates live in JavaScript.
- *Will it catch every scam?* No tool does. It catches common patterns, and when unsure it says SUSPICIOUS, never SAFE.
- *Where does the engine come from?* My ScamShield Android app (Flutter). I rewrote its rule engine in JavaScript for the web.
