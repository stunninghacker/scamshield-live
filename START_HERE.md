# How to use this kit in Claude Code

## 1. Setup (once)
1. Unzip this folder and rename it `scamshield-live`.
2. Open a terminal in that folder and run `git init`.
3. Start Claude Code in the folder: `claude`
   - Claude Code automatically reads `CLAUDE.md` (the full build spec).
   - `reference/scamshield-dart/` holds your ScamShield engine + test cases, used for the JS port.

## 2. First prompt (paste this)

```
Read CLAUDE.md fully, and skim reference/scamshield-dart/.
Then do Phase 1 only (skeleton: all 12 pages, style.css design system,
top bar, navigation, session.js with survey/demo modes).
Stop after Phase 1, tell me what you built and how to test it on my phone.
```

## 3. Next prompts (one at a time, test between each)

```
Phase 2: port the ScamShield engine to js/engine.js and build tests/engine.test.html
with every case from the three Dart test files. Keep fixing until 100% pass.
```
```
Phase 3: build the checker page (check.html) exactly as in CLAUDE.md §7 Page 11.
```
```
Phase 4 and 5: Footprint Mirror page and the three permission traps.
```
```
Phase 6 and 7: the Spot the Scam game (8 rounds) and the Digital Arrest story.
```
```
Phase 8 and 9: score card, then walk me step by step through creating
the Firebase project, and wire up saving results + firestore.rules.
```
```
Phase 10 and 11: batch report page, then the Stay Safe page.
Search official sources (I4C, NCRB, PIB, RBI) for the cybercrime numbers and cite each one.
```
```
Phase 12 and 13: polish, accessibility, test on Android + iPhone, deploy to GitHub Pages,
make the QR code and write the README with the presentation script.
```

## 4. Tips
- Test on your **real phone** after every phase. Camera and location need HTTPS,
  so use GitHub Pages (or `npx serve` + your phone on the same Wi-Fi for quick checks).
- Ask Claude Code to **explain any file in simple words**. You must be able to explain it to the judges.
- Commit after every phase: `git add . && git commit -m "Phase N"`.

## 5. Timeline (adjust to your date)
| When | What |
|---|---|
| Days 1–3 | Phases 1–8 |
| Day 4 | Firebase + report, deploy, share link with batch |
| Days 5–7 | Collect 50+ results, polish, verify stats |
| Day before | Export snapshot, record backup video, 3–4 timed rehearsals |
