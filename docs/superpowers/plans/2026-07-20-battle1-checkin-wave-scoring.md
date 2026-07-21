# Battle 1 Wave Check-In & Batch Scoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Battle 1's free-text bib entry with a check-in-driven
roster: 4 zone check-in stations confirm attendance per wave, station
judges see only their zone's checked-in roster for the active wave (batch
submit, no search needed), and wave status auto-completes once every
checked-in athlete is fully scored.

**Architecture:** Two new sheets (`Checkins`, `Waves`) back three new judge
surfaces (`judge/checkin.html`, `judge/battle1.html`) and an extension to
the existing `admin/index.html`. `judge/index.html` becomes a pure PIN
router for all four battles (it currently embeds Battle 1's UI directly —
the only exception to the router pattern Battle 2/3/Gym Battle already
use). Wave completion is computed and written at the end of every batch
score submission — no manual "mark complete" step.

**Tech Stack:** Google Apps Script (`backend/Code.gs`), vanilla HTML/CSS/JS,
Google Sheets as the data store.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-20-battle1-checkin-wave-scoring-design.md`
  — read it before starting.
- **No automated test framework exists for this GAS backend or its static
  HTML pages.** "Test"/"verify" steps in this plan mean manual code
  read-through (GAS can't run locally) plus, in Task 7, live verification
  requiring the organizer's phone and the Apps Script editor.
- The `Athletes` sheet's actual live columns are exactly: `athlete_id, name,
  email, category, wave` (confirmed with the organizer — **no `zone`
  column**, and none is added by this plan; zone comes from `Checkins`).
- Do not change Battle 2, Battle 3, or Gym Battle code/sheets/PINs.
  `Round1_Scores`'s existing schema and scoring math (per-station weighted
  points from the Scoring Table) are unchanged — only how a judge's UI
  gets to the point of writing to it changes.
- `backend/Code.gs` changes require a manual redeploy by the organizer
  (paste into Apps Script editor → Deploy → Manage deployments → edit
  existing → **New version**, never "new deployment") before they take
  effect live.
- **Never `git push` without the user's explicit go-ahead each time.**
- New one-off setup functions (`setupCheckinsSheet`, `setupWavesSheet`,
  `addCheckinPins`) must each be run once from the Apps Script editor by
  the organizer after the first redeploy that includes them — this is a
  manual step covered in Task 7, not something any task's code triggers
  automatically.

---

### Task 1: Backend — data model setup (Waves + Checkins sheets, check-in PINs)

**Files:**
- Modify: `backend/Code.gs` (new constants near the top, new one-off setup
  functions near `setupBattle2Sheet`/`addBattle3Pins`, and an update to
  `setupJudgeScoringSystem()`)

**Interfaces:**
- Consumes: nothing new — these are additive, one-off functions matching
  the existing `setupBattle2Sheet()`/`addBattle3Pins()` pattern.
- Produces: `CHECKINS_SHEET`, `WAVES_SHEET` constants; `setupCheckinsSheet()`,
  `setupWavesSheet()`, `addCheckinPins()` — all later tasks' backend code
  reads/writes the `Checkins` sheet (columns: `wave, zone, athlete_id,
  checked_in_at`) and the `Waves` sheet (columns: `wave_num, status`, status
  one of `'Draft'`/`'Active'`/`'Complete'`).

- [ ] **Step 1: Add the two new sheet-name constants**

Find this line near the top of `backend/Code.gs` (currently around line 14):

```javascript
const ROUND2_SCORES_SHEET = 'Round2_Scores';
```

Add directly after it:

```javascript
const CHECKINS_SHEET = 'Checkins';
const WAVES_SHEET    = 'Waves';
```

- [ ] **Step 2: Add `setupCheckinsSheet()` and `setupWavesSheet()`**

Find `setupBattle2Sheet()` in `backend/Code.gs` (the "One-time setup" section
near the bottom of the file, right before `migrateBattle2Schema()`). Add
these two new functions directly after `migrateBattle2Schema()`'s closing
`}`:

```javascript
function setupCheckinsSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(CHECKINS_SHEET);
  if (!sheet) sheet = ss.insertSheet(CHECKINS_SHEET);
  if (sheet.getLastRow() > 0) { Logger.log('Checkins already has data — leaving it alone.'); return; }
  const headers = ['wave', 'zone', 'athlete_id', 'checked_in_at'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  Logger.log('setupCheckinsSheet complete.');
}

// Populates one Draft row per distinct wave number already present in the
// Athletes sheet's `wave` column, so the organizer doesn't have to type
// wave numbers in by hand — only run against a brand-new, empty sheet.
function setupWavesSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(WAVES_SHEET);
  if (!sheet) sheet = ss.insertSheet(WAVES_SHEET);
  if (sheet.getLastRow() > 0) { Logger.log('Waves already has data — leaving it alone.'); return; }
  const headers = ['wave_num', 'status'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');

  const athleteSheet = ss.getSheetByName('Athletes');
  if (athleteSheet && athleteSheet.getLastRow() > 1) {
    const data = athleteSheet.getDataRange().getValues();
    const waveIdx = data[0].indexOf('wave');
    if (waveIdx > -1) {
      const waveNums = [...new Set(data.slice(1).map(r => String(r[waveIdx]).trim()).filter(Boolean))]
        .map(Number).sort((a, b) => a - b);
      const rows = waveNums.map(n => [n, 'Draft']);
      if (rows.length) sheet.getRange(2, 1, rows.length, 2).setValues(rows);
    }
  }
  Logger.log('setupWavesSheet complete.');
}
```

- [ ] **Step 3: Add `addCheckinPins()`**

Find `addBattle3Pins()` in `backend/Code.gs`. Add this new function directly
after its closing `}`:

```javascript
// Adds one check-in PIN per zone to the EXISTING Judges sheet without
// touching any PINs already generated — safe to run after other PINs have
// already been distributed or tested (same pattern as addBattle3Pins()).
function addCheckinPins() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(JUDGES_SHEET);
  if (!sheet) { Logger.log('Judges sheet not found — run generateJudgePins() first.'); return; }
  const data = sheet.getDataRange().getValues();
  const alreadyHas = data.some((r, i) => i > 0 && String(r[1]) === '1' && String(r[3]) === 'checkin');
  if (alreadyHas) { Logger.log('Check-in PINs already exist — not adding duplicates.'); return; }

  const randPin = () => Math.random().toString(36).substring(2, 8).toUpperCase();
  const ZONES = ['A', 'B', 'C', 'D'];
  const rows = ZONES.map(zone => [randPin(), '1', zone, 'checkin', `Battle 1 — Zone ${zone} — Check-In`]);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
  Logger.log(`addCheckinPins complete: ${rows.length} PINs added.`);
  rows.forEach(r => Logger.log(`${r[4]}: PIN=${r[0]}`));
}
```

- [ ] **Step 4: Wire the new setup functions into `setupJudgeScoringSystem()`**

Find `setupJudgeScoringSystem()`:

```javascript
function setupJudgeScoringSystem() {
  setupScoringTable();
  setupBattle2Sheet();
  setupBattle3Sheet();
  setupGymSheets();
  generateJudgePins();
  Logger.log('setupJudgeScoringSystem complete — check the Judges sheet for all PINs.');
}
```

Replace with:

```javascript
function setupJudgeScoringSystem() {
  setupScoringTable();
  setupBattle2Sheet();
  setupBattle3Sheet();
  setupGymSheets();
  setupCheckinsSheet();
  setupWavesSheet();
  generateJudgePins();
  Logger.log('setupJudgeScoringSystem complete — check the Judges sheet for all PINs.');
}
```

(This only affects a *fresh* setup run, e.g. for a future season — the live
sheet already has PINs and won't have this re-run wholesale; the organizer
runs `setupCheckinsSheet()`, `setupWavesSheet()`, and `addCheckinPins()`
individually in Task 7, the same way `addBattle3Pins()` was run standalone
earlier this project.)

- [ ] **Step 5: Manual verification (no automated test framework — see Global Constraints)**

Read through the four new/changed functions against this checklist:
- `setupCheckinsSheet()`/`setupWavesSheet()` both guard on `getLastRow() > 0`
  before writing headers, matching `setupBattle2Sheet()`'s existing
  "already has data, leave it alone" pattern — safe to re-run.
- `setupWavesSheet()`'s wave-number dedup (`new Set(...)`) and numeric sort
  produce a clean ascending list even if `Athletes.wave` has stray
  whitespace or is entered as text — `String(...).trim()` before dedup,
  `Number(...)` before sort.
- `addCheckinPins()`'s `alreadyHas` check looks for `battle==='1' &&
  station==='checkin'` specifically, not just any Battle 1 PIN — won't
  falsely think check-in PINs exist just because station PINs do.

- [ ] **Step 6: Commit**

```bash
git add backend/Code.gs
git commit -m "$(cat <<'EOF'
feat: add Checkins/Waves sheets and check-in PINs for Battle 1 redesign

Adds the data model two new judge surfaces (check-in, wave-scoped
Battle 1 scoring) will read/write, per
docs/superpowers/specs/2026-07-20-battle1-checkin-wave-scoring-design.md.
No behavior changes yet — these are additive, unused until later tasks.
EOF
)"
```

---

### Task 2: Backend — check-in endpoints

**Files:**
- Modify: `backend/Code.gs` (`doGet`/`doPost` dispatch tables, new
  functions placed in a new "Battle 1 — Check-In" section before the
  existing "Battle 2" section)

**Interfaces:**
- Consumes: `_lookupJudge(pin)`, `CHECKINS_SHEET`, `WAVES_SHEET`, `'Athletes'`
  sheet (columns `athlete_id, name, email, category, wave` — confirmed in
  Global Constraints).
- Produces:
  - `_checkinsForWave(waveNum)` → `[{ wave, zone, athlete_id, checked_in_at }]`,
    used by Task 4's `battle1Roster`/`battle1SubmitWave` too.
  - `athletesAll(e)` (GET `athletes_all`) → `{ athletes: [{ athlete_id, name,
    category }] }` — every athlete, no filtering.
  - `wavesOpenForCheckin(e)` (GET `waves_open`) → `{ waves: [{ wave_num,
    status }] }` — Draft or Active only, ascending by wave_num.
  - `checkinRoster(e)` (GET `checkin_roster`, params `wave`, `zone`) →
    `{ roster: [{ athlete_id, name }] }`.
  - `checkinSubmit(body)` (POST `checkin_submit`, body `{ pin, wave,
    athlete_id, force }`) → `{ success: true }` on success, or `{ error:
    'already_checked_in', existing_wave, existing_zone }` if a duplicate is
    found and `force` wasn't set, or `{ error: '<message>' }` for other
    failures.

- [ ] **Step 1: Add the check-in section to `backend/Code.gs`**

Find the comment header `// ─── Battle 2 — round/station grid (no stopwatch) ───`
(currently around line 516). Add this entire new section directly **before**
it:

```javascript
// ─── Battle 1 — Check-In ──────────────────────────────────────────────────
//
// Checkins is append-only: one row per (wave, zone, athlete_id). It is the
// real source of truth for "who's actually part of wave N, zone Z" — the
// Athletes sheet's `wave` column is just a pre-planned default, not
// binding. A no-show simply never gets a row here. A late arrival gets
// checked into whichever wave is currently open when they show up — this
// check-in action is the entire late-accommodation mechanism.

function _checkinsForWave(waveNum) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(CHECKINS_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return [];
  const data = sheet.getDataRange().getValues();
  return data.slice(1)
    .filter(r => r[0] && String(r[0]) === String(waveNum))
    .map(r => ({ wave: r[0], zone: r[1], athlete_id: r[2], checked_in_at: r[3] }));
}

// GET: full athlete list for the check-in screen's bib search. This is the
// only place a full-roster search is needed — check-in is a one-time
// action per arriving athlete, done by 4 staff, not repeated by the 28
// station judges.
function athletesAll(e) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Athletes');
  if (!sheet || sheet.getLastRow() <= 1) return jsonResponse({ athletes: [] });
  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx   = headers.indexOf('athlete_id');
  const nameIdx = headers.indexOf('name');
  const catIdx  = headers.indexOf('category');
  const athletes = data.slice(1)
    .filter(r => r[idIdx])
    .map(r => ({ athlete_id: r[idIdx], name: r[nameIdx], category: r[catIdx] }));
  return jsonResponse({ athletes });
}

// GET: waves still accepting check-ins (Draft or Active), for the check-in
// screen's wave selector — lets check-in for the next wave start while the
// current wave is still being scored.
function wavesOpenForCheckin(e) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(WAVES_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return jsonResponse({ waves: [] });
  const data = sheet.getDataRange().getValues();
  const waves = data.slice(1)
    .filter(r => r[0] && (r[1] === 'Draft' || r[1] === 'Active'))
    .map(r => ({ wave_num: r[0], status: r[1] }))
    .sort((a, b) => Number(a.wave_num) - Number(b.wave_num));
  return jsonResponse({ waves });
}

// GET: read-only — who's already checked into (wave, zone). Lets the
// check-in screen resync after a reload instead of losing state (same
// server-truth principle as battle2_status / gym_zone_status).
function checkinRoster(e) {
  const wave = e.parameter.wave;
  const zone = e.parameter.zone;
  if (!wave || !zone) return jsonResponse({ error: 'wave and zone required' });
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const athleteSheet = ss.getSheetByName('Athletes');
  const athleteData  = athleteSheet.getDataRange().getValues();
  const athleteH     = athleteData[0];
  const idIdx        = athleteH.indexOf('athlete_id');
  const nameIdx      = athleteH.indexOf('name');

  const checkedIn = _checkinsForWave(wave).filter(c => String(c.zone) === String(zone));
  const roster = checkedIn.map(c => {
    const athlete = athleteData.find((r, i) => i > 0 && String(r[idIdx]) === String(c.athlete_id));
    return { athlete_id: c.athlete_id, name: athlete ? athlete[nameIdx] : c.athlete_id };
  });
  return jsonResponse({ roster });
}

// POST: checks one athlete into (wave, zone). Guards against a duplicate
// check-in elsewhere (any wave/zone) unless the caller explicitly confirms
// with force:true — covers a genuine correction (moved zones) without
// silently double-checking someone in by accident.
function checkinSubmit(body) {
  const { pin, wave, athlete_id, force } = body;
  const judge = _lookupJudge(pin);
  if (!judge || String(judge.battle) !== '1' || judge.station !== 'checkin') return jsonResponse({ error: 'Invalid PIN' });
  if (!wave || !athlete_id) return jsonResponse({ error: 'wave and athlete_id required' });

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return jsonResponse({ error: 'Server busy — please retry' }); }
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(CHECKINS_SHEET);
    const data = sheet.getDataRange().getValues();
    const existing = data.find((r, i) => i > 0 && String(r[2]) === String(athlete_id));
    if (existing && !force) {
      return jsonResponse({ error: 'already_checked_in', existing_wave: existing[0], existing_zone: existing[1] });
    }
    sheet.appendRow([Number(wave), judge.assignment, athlete_id, new Date().toISOString()]);
    return jsonResponse({ success: true });
  } finally {
    lock.releaseLock();
  }
}

```

- [ ] **Step 2: Register the GET actions in `doGet`**

Find this line in `doGet` (currently around line 31):

```javascript
  if (action === 'battle2_roster')   return battle2Roster(e);
```

Add directly **before** it:

```javascript
  if (action === 'athletes_all')     return athletesAll(e);
  if (action === 'waves_open')       return wavesOpenForCheckin(e);
  if (action === 'checkin_roster')   return checkinRoster(e);
```

- [ ] **Step 3: Register the POST action in `doPost`**

Find this line in `doPost` (currently around line 48):

```javascript
  if (action === 'battle2_start')        return battle2Start(body);
```

Add directly **before** it:

```javascript
  if (action === 'checkin_submit')       return checkinSubmit(body);
```

- [ ] **Step 4: Manual verification (no automated test framework)**

- Confirm `checkinSubmit`'s duplicate check (`data.find(...String(r[2])
  === String(athlete_id))`) scans column index 2, matching the `Checkins`
  header order `wave(0), zone(1), athlete_id(2), checked_in_at(3)` from
  Task 1.
- Confirm the lock is acquired and released correctly (single
  `try/finally`, matching every other write endpoint in this file).
- Confirm `athletesAll`/`wavesOpenForCheckin`/`checkinRoster` are read-only
  (no `.setValue`/`.appendRow` calls) — no lock needed, matching
  `battle2Status`'s pattern.

- [ ] **Step 5: Commit**

```bash
git add backend/Code.gs
git commit -m "$(cat <<'EOF'
feat: add Battle 1 check-in backend (athletes_all, waves_open,
checkin_roster, checkin_submit)

Check-in is the roster source of truth for wave-scoped Battle 1
scoring — a no-show never gets a Checkins row, a late arrival gets
checked into whichever wave is currently open. Duplicate check-ins
require an explicit confirm (force:true) rather than silently
double-adding someone.
EOF
)"
```

---

### Task 3: Frontend — `judge/checkin.html` (new) + check-in routing

**Files:**
- Create: `judge/checkin.html`
- Modify: `judge/index.html` (`verifyPin`, one redirect added — this task
  does NOT yet remove Battle 1's embedded UI from `index.html`; that's
  Task 5, once `battle1.html` exists to redirect non-checkin Battle 1 PINs
  to)

**Interfaces:**
- Consumes: `judge_login` (existing), `athletes_all`, `waves_open`,
  `checkin_roster`, `checkin_submit` (all from Task 2).
- Produces: nothing consumed by later tasks — self-contained page.

- [ ] **Step 1: Create `judge/checkin.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>Check-In — RANNBHOOMI 2026</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Cinzel:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="icon" type="image/png" href="../images/logo-crimson.png">
<style>
:root { --crimson:#4c0007; --gold:#dec189; --parchment:#d6b97a; --border:rgba(76,0,7,0.22); --ok:#1a6b00; }
* { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
html, body { min-height:100%; background:#d6b97a; font-family:'Cinzel',serif; color:var(--crimson); }
body { padding: env(safe-area-inset-top,0) env(safe-area-inset-right,0) env(safe-area-inset-bottom,0) env(safe-area-inset-left,0); }

.screen { display:none; min-height:100vh; flex-direction:column; align-items:center; justify-content:center; padding:28px 18px 40px; }
.screen.active { display:flex; }
.card { width:100%; max-width:460px; background:rgba(214,185,122,0.55); border:1px solid var(--border); padding:32px 26px; }

.badge { font-size:9px; letter-spacing:4px; opacity:0.75; text-transform:uppercase; margin-bottom:10px; }
.title { font-family:'Bebas Neue',sans-serif; font-size:28px; letter-spacing:2px; color:var(--crimson); line-height:1.1; margin-bottom:4px; }
.rule { width:44px; height:2px; background:var(--crimson); opacity:0.3; margin-bottom:20px; }

.field-label { font-size:9px; letter-spacing:3px; opacity:0.75; margin-bottom:8px; display:block; }
select.field-input, .field-input {
  width:100%; padding:14px; border:1px solid var(--border);
  background:rgba(214,185,122,0.4); font-family:'Cinzel',serif;
  font-size:14px; color:var(--crimson); outline:none; -webkit-appearance:none; border-radius:0;
}
.field-input:focus { border-color:var(--crimson); background:rgba(214,185,122,0.7); }

.search-results { margin-top:8px; max-height:200px; overflow-y:auto; border:1px solid var(--border); display:none; }
.search-results.open { display:block; }
.search-row { padding:10px 12px; font-size:12px; letter-spacing:0.5px; cursor:pointer; border-bottom:1px solid rgba(76,0,7,0.08); }
.search-row:hover { background:rgba(76,0,7,0.06); }

.selected-box { margin-top:14px; padding:14px; border:2px solid var(--crimson); background:rgba(214,185,122,0.4); display:none; }
.selected-box.open { display:block; }
.selected-box .sb-name { font-family:'Bebas Neue',sans-serif; font-size:20px; }
.selected-box .sb-id { font-size:11px; opacity:0.7; margin-top:2px; }

.btn-primary {
  width:100%; margin-top:14px; padding:16px;
  background:var(--crimson); color:var(--gold);
  font-family:'Bebas Neue',sans-serif; font-size:18px; letter-spacing:4px;
  border:none; cursor:pointer; transition:opacity .15s;
}
.btn-primary:hover { opacity:.85; }
.btn-primary:disabled { opacity:.35; cursor:not-allowed; }
.msg { margin-top:14px; font-size:11px; letter-spacing:2px; min-height:16px; text-align:center; }
.msg.err { color:var(--crimson); }
.msg.ok  { color:var(--ok); }

.checked-list { margin-top:24px; }
.checked-list h3 { font-size:10px; letter-spacing:3px; opacity:0.7; margin-bottom:10px; }
.checked-row { display:flex; justify-content:space-between; padding:8px 0; border-bottom:1px solid rgba(76,0,7,0.08); font-size:12px; }

.confirm-overlay { display:none; position:fixed; inset:0; background:rgba(76,0,7,0.5); z-index:50; align-items:center; justify-content:center; padding:20px; }
.confirm-overlay.open { display:flex; }
.confirm-box { background:#d6b97a; border:1px solid var(--border); padding:28px 24px; max-width:340px; width:100%; }
.confirm-box p { font-size:12px; line-height:1.6; margin-bottom:20px; }
.confirm-btns { display:flex; gap:10px; }
.confirm-btns button { flex:1; padding:12px; font-family:'Cinzel',serif; font-size:11px; letter-spacing:2px; cursor:pointer; border:1px solid var(--border); }
.confirm-btns .btn-yes { background:var(--crimson); color:var(--gold); border:none; }
.confirm-btns .btn-no  { background:transparent; color:var(--crimson); }

.btn-logout { margin-top:24px; padding:10px 18px; background:transparent; color:var(--crimson); border:1px solid var(--border); font-family:'Cinzel',serif; font-size:9px; letter-spacing:3px; cursor:pointer; opacity:0.65; }
.btn-logout:hover { opacity:1; }
</style>
</head>
<body>

<div class="screen active" id="loadingScreen">
  <div class="card"><div class="title">LOADING…</div></div>
</div>

<div class="screen" id="checkinScreen">
  <div class="card">
    <div class="badge" id="zoneBadge">Check-In — Rannbhoomi 2026</div>
    <div class="title">CHECK-IN</div>
    <div class="rule"></div>

    <label class="field-label" for="waveSelect">Wave</label>
    <select class="field-input" id="waveSelect" onchange="onWaveChange()">
      <option value="">Loading waves…</option>
    </select>

    <label class="field-label" for="athleteSearch" style="margin-top:18px;">Search athlete (name or bib)</label>
    <input class="field-input" type="text" id="athleteSearch" placeholder="Type to search…" autocomplete="off" oninput="onSearchInput()">
    <div class="search-results" id="searchResults"></div>

    <div class="selected-box" id="selectedBox">
      <div class="sb-name" id="selectedName">—</div>
      <div class="sb-id" id="selectedId">—</div>
    </div>

    <button class="btn-primary" id="checkinBtn" onclick="doCheckin(false)" disabled>CHECK IN</button>
    <div class="msg" id="checkinMsg"></div>

    <div class="checked-list">
      <h3 id="checkedListLabel">CHECKED IN — WAVE — / ZONE —</h3>
      <div id="checkedRows"></div>
    </div>

    <button class="btn-logout" onclick="logout()">LOG OUT</button>
  </div>
</div>

<div class="confirm-overlay" id="dupOverlay">
  <div class="confirm-box">
    <p id="dupMsg">Already checked in.</p>
    <div class="confirm-btns">
      <button class="btn-no" onclick="closeDupOverlay()">CANCEL</button>
      <button class="btn-yes" onclick="doCheckin(true)">CHECK IN ANYWAY</button>
    </div>
  </div>
</div>

<script>
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxELQsXchGNJXNDyETPXuFOLNKXNNL48OZcG0IRtS-eohXx9gOSP-ZFC1J0PHl-QjNG/exec';

let judge = null;
let pin = null;
let allAthletes = [];
let selectedAthlete = null;

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

(async function init() {
  const params = new URLSearchParams(location.search);
  pin = params.get('pin') || sessionStorage.getItem('judge_pin') || '';
  if (!pin) { location.href = 'index.html'; return; }

  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=judge_login&pin=${encodeURIComponent(pin)}`);
    const data = await res.json();
    if (!data.found || String(data.judge.battle) !== '1' || data.judge.station !== 'checkin') {
      location.href = 'index.html?pin=' + encodeURIComponent(pin);
      return;
    }
    judge = data.judge;
    sessionStorage.setItem('judge_pin', pin);
    document.getElementById('zoneBadge').textContent = judge.label || ('Check-In — Zone ' + judge.assignment);

    const athletesRes = await fetch(`${APPS_SCRIPT_URL}?action=athletes_all`);
    const athletesData = await athletesRes.json();
    allAthletes = athletesData.athletes || [];

    await loadWaves();
    show('checkinScreen');
  } catch (err) {
    document.getElementById('loadingScreen').querySelector('.title').textContent = 'CONNECTION FAILED';
  }
})();

async function loadWaves() {
  const sel = document.getElementById('waveSelect');
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=waves_open`);
    const data = await res.json();
    const waves = data.waves || [];
    if (!waves.length) {
      sel.innerHTML = '<option value="">No open waves — check Waves sheet</option>';
      return;
    }
    sel.innerHTML = waves.map(w => `<option value="${w.wave_num}">Wave ${w.wave_num} (${w.status})</option>`).join('');
    await loadCheckedInList();
  } catch {
    sel.innerHTML = '<option value="">Failed to load waves</option>';
  }
}

function onWaveChange() {
  loadCheckedInList();
}

async function loadCheckedInList() {
  const wave = document.getElementById('waveSelect').value;
  const label = document.getElementById('checkedListLabel');
  const rows = document.getElementById('checkedRows');
  if (!wave) { label.textContent = 'CHECKED IN — SELECT A WAVE'; rows.innerHTML = ''; return; }
  label.textContent = `CHECKED IN — WAVE ${wave} / ZONE ${judge.assignment}`;
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=checkin_roster&wave=${encodeURIComponent(wave)}&zone=${encodeURIComponent(judge.assignment)}`);
    const data = await res.json();
    const roster = data.roster || [];
    rows.innerHTML = roster.length
      ? roster.map(a => `<div class="checked-row"><span>${escHtml(a.name)}</span><span>${a.athlete_id}</span></div>`).join('')
      : '<div class="checked-row" style="opacity:0.6;">Nobody checked in yet</div>';
  } catch {
    rows.innerHTML = '<div class="checked-row">Failed to load</div>';
  }
}

function onSearchInput() {
  const q = document.getElementById('athleteSearch').value.trim().toLowerCase();
  const box = document.getElementById('searchResults');
  selectedAthlete = null;
  document.getElementById('selectedBox').classList.remove('open');
  updateCheckinBtn();

  if (q.length < 2) { box.classList.remove('open'); box.innerHTML = ''; return; }
  const matches = allAthletes
    .filter(a => a.name.toLowerCase().includes(q) || String(a.athlete_id).toLowerCase().includes(q))
    .slice(0, 20);
  box.innerHTML = matches.map(a =>
    `<div class="search-row" onclick='pickAthlete(${JSON.stringify(a).replace(/'/g, "&#39;")})'>${escHtml(a.name)} — ${a.athlete_id}${a.category ? ' · ' + escHtml(a.category) : ''}</div>`
  ).join('');
  box.classList.toggle('open', matches.length > 0);
}

function pickAthlete(athlete) {
  selectedAthlete = athlete;
  document.getElementById('selectedName').textContent = athlete.name;
  document.getElementById('selectedId').textContent = athlete.athlete_id;
  document.getElementById('selectedBox').classList.add('open');
  document.getElementById('searchResults').classList.remove('open');
  document.getElementById('athleteSearch').value = athlete.name;
  updateCheckinBtn();
}

function updateCheckinBtn() {
  const wave = document.getElementById('waveSelect').value;
  document.getElementById('checkinBtn').disabled = !(selectedAthlete && wave);
}

async function doCheckin(force) {
  const wave = document.getElementById('waveSelect').value;
  const msg = document.getElementById('checkinMsg');
  if (!selectedAthlete || !wave) return;

  document.getElementById('checkinBtn').disabled = true;
  msg.textContent = '';
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'checkin_submit', pin, wave, athlete_id: selectedAthlete.athlete_id, force }),
    });
    const data = await res.json();

    if (data.error === 'already_checked_in') {
      document.getElementById('dupMsg').textContent =
        `${selectedAthlete.name} is already checked into Wave ${data.existing_wave}, Zone ${data.existing_zone}. Check in here too?`;
      document.getElementById('dupOverlay').classList.add('open');
      document.getElementById('checkinBtn').disabled = false;
      return;
    }
    if (!data.success) throw new Error(data.error || 'Failed');

    closeDupOverlay();
    msg.textContent = `${selectedAthlete.name} checked in.`;
    msg.className = 'msg ok';
    document.getElementById('athleteSearch').value = '';
    document.getElementById('selectedBox').classList.remove('open');
    selectedAthlete = null;
    updateCheckinBtn();
    await loadCheckedInList();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg err';
  }
  document.getElementById('checkinBtn').disabled = false;
}

function closeDupOverlay() {
  document.getElementById('dupOverlay').classList.remove('open');
}

function logout() {
  sessionStorage.removeItem('judge_pin');
  location.href = 'index.html';
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

updateCheckinBtn();
</script>
</body>
</html>
```

- [ ] **Step 2: Add check-in routing to `judge/index.html`**

Find this block in `verifyPin()` (currently around lines 225-243):

```javascript
    if (String(judge.battle) === '2') {
      location.href = 'battle2.html?pin=' + encodeURIComponent(pin);
      return;
    }
    if (String(judge.battle) === '3') {
      location.href = 'battle3.html?pin=' + encodeURIComponent(pin);
      return;
    }
    if (String(judge.battle) === 'gym') {
      location.href = 'gym.html?pin=' + encodeURIComponent(pin);
      return;
    }
    if (String(judge.battle) !== '1') {
      msg.textContent = 'Unknown assignment for this PIN';
      msg.className = 'msg err';
      btn.disabled = false;
      btn.textContent = 'ENTER';
      return;
    }

    showQueue();
```

Replace **only** the `if (String(judge.battle) === 'gym') { ... }` block's
immediately-following code — insert this new block right after it, before
the existing `if (String(judge.battle) !== '1')` check:

```javascript
    if (String(judge.battle) === 'gym') {
      location.href = 'gym.html?pin=' + encodeURIComponent(pin);
      return;
    }
    if (String(judge.battle) === '1' && judge.station === 'checkin') {
      location.href = 'checkin.html?pin=' + encodeURIComponent(pin);
      return;
    }
    if (String(judge.battle) !== '1') {
      msg.textContent = 'Unknown assignment for this PIN';
      msg.className = 'msg err';
      btn.disabled = false;
      btn.textContent = 'ENTER';
      return;
    }

    showQueue();
```

(Battle 1's non-checkin PINs still fall through to `showQueue()` — the
existing embedded queue UI — until Task 5 replaces that with a redirect to
the new `battle1.html`. This keeps Task 3 self-contained and testable
without depending on Task 5's not-yet-written page.)

- [ ] **Step 3: Manual verification**

- Confirm every `id` referenced in the script (`waveSelect`,
  `athleteSearch`, `searchResults`, `selectedBox`, `selectedName`,
  `selectedId`, `checkinBtn`, `checkinMsg`, `checkedListLabel`,
  `checkedRows`, `dupOverlay`, `dupMsg`, `zoneBadge`) has a matching
  element in the HTML.
- Confirm `pickAthlete`'s inline `onclick` JSON-embeds correctly (the
  `.replace(/'/g, "&#39;")` guards against an athlete name containing a
  single quote breaking the inline attribute).
- Confirm `judge/index.html`'s new block is inserted in the right place
  (after the `gym` redirect, before the `!== '1'` fallback) so Battle 2/3/
  Gym Battle routing is completely unaffected.

- [ ] **Step 4: Commit**

```bash
git add judge/checkin.html judge/index.html
git commit -m "$(cat <<'EOF'
feat: add Battle 1 check-in page (judge/checkin.html)

Full-roster bib search (the only place this is needed — check-in is
a one-time action per arriving athlete, done by 4 zone staff, not
repeated by station judges), wave selector defaulting to the lowest
open wave, and a duplicate-checkin confirm guard.
EOF
)"
```

---

### Task 4: Backend — Battle 1 wave roster + batch submit + auto-complete

**Files:**
- Modify: `backend/Code.gs` (`doGet`/`doPost` dispatch tables, new
  functions in the check-in section added in Task 2)

**Interfaces:**
- Consumes: `_checkinsForWave(waveNum)` (Task 2), `_lookupJudge`,
  `_getScoringRow`, `STATION_ROUNDS['1']`, `SCORE_SHEETS['1']`,
  `WAVES_SHEET`.
- Produces:
  - `_activeWave()` → `{ wave_num, status }` or `null`.
  - `battle1Roster(e)` (GET `battle1_roster`, params `pin`, optional `wave`)
    → `{ wave: <number|null>, roster: [{ athlete_id, name, existingValue }] }`.
    `existingValue` is `null` if this judge's station hasn't been scored
    for that athlete yet.
  - `battle1SubmitWave(body)` (POST `battle1_submit_wave`, body `{ pin,
    wave, scores: [{ athlete_id, value }] }`) → `{ success: true,
    submitted: <count>, skipped: [<athlete_id>, ...] }`. `skipped` lists any
    athlete_id in the request that wasn't actually checked into this
    judge's zone for that wave (defensive — the roster the judge submits
    from should never contain these, but the server doesn't trust the
    client blindly).
  - `_maybeCompleteWave(wave)` — no return value; flips `Waves.status` to
    `'Complete'` if every checked-in athlete for the wave (across all 4
    zones) now has `complete: true` in `Round1_Scores`.
  - `wavesForLateEntry(e)` (GET `waves_for_late_entry`) → `{ waves: [{
    wave_num, status }] }` — Active or Complete only (a Draft wave has no
    meaningful scores yet).

- [ ] **Step 1: Add `_activeWave()` and the Battle 1 scoring functions**

Find the `checkinSubmit` function added in Task 2 (the last function in
the new check-in section). Add these new functions directly after its
closing `}`:

```javascript
function _activeWave() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(WAVES_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return null;
  const data = sheet.getDataRange().getValues();
  const row = data.find((r, i) => i > 0 && r[1] === 'Active');
  return row ? { wave_num: row[0], status: row[1] } : null;
}

// GET: this judge's zone's checked-in roster for a wave (defaults to the
// current Active wave if none given — Late Entry passes an explicit
// wave), plus each athlete's existing value for THIS station if already
// scored, so a page reload pre-fills rather than risking a duplicate
// entry (server-truth resync, same principle as Battle 2/Gym Battle).
function battle1Roster(e) {
  const pin = e.parameter.pin;
  const judge = _lookupJudge(pin);
  if (!judge || String(judge.battle) !== '1' || judge.station === 'checkin') return jsonResponse({ error: 'Invalid PIN' });

  let wave = e.parameter.wave;
  if (!wave) {
    const active = _activeWave();
    if (!active) return jsonResponse({ wave: null, roster: [] });
    wave = active.wave_num;
  }

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const athleteSheet = ss.getSheetByName('Athletes');
  const athleteData  = athleteSheet.getDataRange().getValues();
  const athleteH     = athleteData[0];
  const idIdx        = athleteH.indexOf('athlete_id');
  const nameIdx      = athleteH.indexOf('name');

  const scoreSheet   = ss.getSheetByName(SCORE_SHEETS['1']);
  const scoreData    = scoreSheet.getDataRange().getValues();
  const scoreH       = scoreData[0];
  const scoreIdIdx   = scoreH.indexOf('athlete_id');
  const stationCol   = scoreH.indexOf(judge.station);

  const checkedIn = _checkinsForWave(wave).filter(c => String(c.zone) === String(judge.assignment));
  const roster = checkedIn.map(c => {
    const athlete  = athleteData.find((r, i) => i > 0 && String(r[idIdx]) === String(c.athlete_id));
    const scoreRow = scoreData.find((r, i) => i > 0 && String(r[scoreIdIdx]) === String(c.athlete_id));
    const existingValue = (scoreRow && stationCol > -1 && scoreRow[stationCol] !== '') ? scoreRow[stationCol] : null;
    return { athlete_id: c.athlete_id, name: athlete ? athlete[nameIdx] : c.athlete_id, existingValue };
  });

  return jsonResponse({ wave: Number(wave), roster });
}

// Batch-submits one station's values for every athlete in a wave/zone
// roster in a single locked read-modify-write — same one-call-per-batch
// principle as gym_submit_rotation, so a dropped connection can't leave
// some athletes scored and others not.
function battle1SubmitWave(body) {
  const { pin, wave, scores } = body;
  const judge = _lookupJudge(pin);
  if (!judge || String(judge.battle) !== '1' || judge.station === 'checkin') return jsonResponse({ error: 'Invalid PIN' });
  if (!wave || !Array.isArray(scores)) return jsonResponse({ error: 'wave and scores required' });

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return jsonResponse({ error: 'Server busy — please retry' }); }
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const checkedInIds = new Set(
      _checkinsForWave(wave).filter(c => String(c.zone) === String(judge.assignment)).map(c => String(c.athlete_id))
    );

    const sheet = ss.getSheetByName(SCORE_SHEETS['1']);
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const stationCol = headers.indexOf(judge.station);
    if (stationCol === -1) return jsonResponse({ error: 'Station column not found: ' + judge.station });

    const roundStations = STATION_ROUNDS['1'];
    let submitted = 0;
    const skipped = [];
    let data = sheet.getDataRange().getValues();

    scores.forEach(({ athlete_id, value }) => {
      if (!athlete_id || value === '' || value === null || value === undefined) return;
      if (!checkedInIds.has(String(athlete_id))) { skipped.push(athlete_id); return; }

      const rowIdx = data.findIndex((r, i) => i > 0 && String(r[0]) === String(athlete_id));

      if (rowIdx > 0) {
        sheet.getRange(rowIdx + 1, stationCol + 1).setValue(Number(value) || 0);
        data[rowIdx][stationCol] = Number(value) || 0;
      } else {
        const athleteSheet = ss.getSheetByName('Athletes');
        const athleteData  = athleteSheet.getDataRange().getValues();
        const athlete      = athleteData.find((r, i) => i > 0 && String(r[0]) === String(athlete_id));
        const name         = athlete ? athlete[1] : 'Unknown';
        const category     = athlete ? String(athlete[3]).toLowerCase() : '';
        const newRow = new Array(headers.length).fill('');
        const set = (h, v) => { const i = headers.indexOf(h); if (i > -1) newRow[i] = v; };
        set('athlete_id', athlete_id);
        set('name', name);
        set('category', category);
        set('wave', wave);
        set('zone', judge.assignment);
        set('complete', false);
        newRow[stationCol] = Number(value) || 0;
        sheet.appendRow(newRow);
        data.push(newRow);
      }
      submitted++;
    });

    // Recompute complete/total for every athlete just touched — same
    // per-athlete logic as the single-score handleScore() path.
    scores.forEach(({ athlete_id }) => {
      if (!athlete_id) return;
      const rowIdx = data.findIndex((r, i) => i > 0 && String(r[0]) === String(athlete_id));
      if (rowIdx <= 0) return;
      const row = data[rowIdx];
      const stationIdxs = roundStations.map(s => headers.indexOf(s)).filter(i => i > -1);
      const vals = stationIdxs.map(i => row[i]);
      const allFilled = vals.every(v => v !== '' && v !== null && v !== undefined);
      const total = roundStations.reduce((sum, st, i) => {
        const scoring = _getScoringRow('1', st);
        const pts = scoring ? Number(scoring.pointsPerUnit) || 0 : 1;
        return sum + (Number(vals[i]) || 0) * pts;
      }, 0);
      const setCell = (h, v) => { const i = headers.indexOf(h); if (i > -1) sheet.getRange(rowIdx + 1, i + 1).setValue(v); };
      setCell('complete', allFilled);
      setCell('submitted_at', new Date().toISOString());
      if (allFilled) setCell('total', total);
    });

    _maybeCompleteWave(wave);

    return jsonResponse({ success: true, submitted, skipped });
  } finally {
    lock.releaseLock();
  }
}

// Flips Waves.status to Complete once every checked-in athlete for a wave
// (across all 4 zones, not just this judge's own) has a complete
// Round1_Scores row — no manual "mark complete" action needed.
function _maybeCompleteWave(wave) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const checkedIn = _checkinsForWave(wave);
  if (checkedIn.length === 0) return;

  const scoreSheet = ss.getSheetByName(SCORE_SHEETS['1']);
  const data = scoreSheet.getDataRange().getValues();
  const headers = data[0];
  const idIdx = headers.indexOf('athlete_id');
  const completeIdx = headers.indexOf('complete');

  const allComplete = checkedIn.every(c => {
    const row = data.find((r, i) => i > 0 && String(r[idIdx]) === String(c.athlete_id));
    return row && row[completeIdx] === true;
  });
  if (!allComplete) return;

  const wavesSheet = ss.getSheetByName(WAVES_SHEET);
  const wavesData = wavesSheet.getDataRange().getValues();
  const rowIdx = wavesData.findIndex((r, i) => i > 0 && String(r[0]) === String(wave));
  if (rowIdx > -1) wavesSheet.getRange(rowIdx + 1, 2).setValue('Complete');
}

// GET: waves eligible for Late Entry (Active or Complete — not Draft,
// since a Draft wave has no meaningful roster/scores yet).
function wavesForLateEntry(e) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(WAVES_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return jsonResponse({ waves: [] });
  const data = sheet.getDataRange().getValues();
  const waves = data.slice(1)
    .filter(r => r[0] && (r[1] === 'Active' || r[1] === 'Complete'))
    .map(r => ({ wave_num: r[0], status: r[1] }))
    .sort((a, b) => Number(a.wave_num) - Number(b.wave_num));
  return jsonResponse({ waves });
}
```

- [ ] **Step 2: Register the GET actions in `doGet`**

Find the line added in Task 2 (`if (action === 'checkin_roster') ...`).
Add directly after it:

```javascript
  if (action === 'battle1_roster')       return battle1Roster(e);
  if (action === 'waves_for_late_entry') return wavesForLateEntry(e);
```

- [ ] **Step 3: Register the POST action in `doPost`**

Find the line added in Task 2 (`if (action === 'checkin_submit') ...`).
Add directly after it:

```javascript
  if (action === 'battle1_submit_wave')  return battle1SubmitWave(body);
```

- [ ] **Step 4: Manual verification (no automated test framework)**

- Confirm `battle1SubmitWave` never re-reads the whole sheet per athlete
  (it reads `data` once before the loop, mutates the in-memory copy on
  both the "existing row" and "new row" paths so a batch containing
  multiple brand-new athletes still finds each other correctly within the
  same call).
- Confirm the `skipped` list only includes athlete_ids missing from
  `checkedInIds` — the server does not trust the client's submitted roster
  blindly, matching this task's stated defensive intent.
- Confirm `_maybeCompleteWave`'s completeness check spans **all** checked-in
  athletes for the wave (`_checkinsForWave(wave)`, not filtered by zone) —
  a single zone finishing its own athletes must not prematurely mark the
  whole wave Complete while other zones still have work left.
- Confirm the weighted-total calculation in the recompute step is
  byte-for-byte the same formula as `handleScore`'s existing Battle 1 path
  (`(Number(vals[i]) || 0) * pts`, summed) — no scoring-math regression.

- [ ] **Step 5: Commit**

```bash
git add backend/Code.gs
git commit -m "$(cat <<'EOF'
feat: add Battle 1 wave-scoped roster + batch submit + auto-complete

battle1_roster/battle1_submit_wave give a station judge only their
zone's checked-in athletes for a wave, with one atomic batch write
per submission (same principle as gym_submit_rotation). Wave status
flips to Complete automatically once every checked-in athlete across
all 4 zones is fully scored — no manual action needed.
EOF
)"
```

---

### Task 5: Frontend — `judge/battle1.html` (new) + `judge/index.html` becomes a pure router

**Files:**
- Create: `judge/battle1.html`
- Modify: `judge/index.html` (remove the embedded Battle 1 queue UI
  entirely, replace with a redirect — completing the "pure router"
  cleanup Task 3 deferred)

**Interfaces:**
- Consumes: `judge_login`, `battle1_roster`, `battle1_submit_wave`,
  `waves_for_late_entry` (all from Task 4).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Create `judge/battle1.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>Battle 1 Judge — RANNBHOOMI 2026</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Cinzel:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="icon" type="image/png" href="../images/logo-crimson.png">
<style>
:root { --crimson:#4c0007; --gold:#dec189; --parchment:#d6b97a; --border:rgba(76,0,7,0.22); --ok:#1a6b00; }
* { margin:0; padding:0; box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
html, body { min-height:100%; background:#d6b97a; font-family:'Cinzel',serif; color:var(--crimson); }
body { padding: env(safe-area-inset-top,0) env(safe-area-inset-right,0) env(safe-area-inset-bottom,0) env(safe-area-inset-left,0); }

.screen { display:none; min-height:100vh; flex-direction:column; align-items:center; justify-content:center; padding:28px 18px 40px; }
.screen.active { display:flex; }
.card { width:100%; max-width:480px; background:rgba(214,185,122,0.55); border:1px solid var(--border); padding:32px 26px; }

.badge { font-size:9px; letter-spacing:4px; opacity:0.75; text-transform:uppercase; margin-bottom:10px; }
.title { font-family:'Bebas Neue',sans-serif; font-size:28px; letter-spacing:2px; color:var(--crimson); line-height:1.1; margin-bottom:4px; }
.sub { font-size:11px; letter-spacing:1px; opacity:0.7; margin-bottom:16px; }
.rule { width:44px; height:2px; background:var(--crimson); opacity:0.3; margin-bottom:20px; }

.roster-table { width:100%; border-collapse:collapse; margin-bottom:18px; }
.roster-table th { font-size:9px; letter-spacing:2px; text-align:left; padding:8px 6px; opacity:0.65; border-bottom:1px solid var(--border); }
.roster-table td { padding:8px 6px; border-bottom:1px solid rgba(76,0,7,0.08); font-size:12px; vertical-align:middle; }
.roster-table .rt-name { }
.roster-table .rt-id { opacity:0.6; font-size:10px; }
.rt-input {
  width:70px; padding:8px; text-align:center; border:2px solid var(--border);
  background:rgba(214,185,122,0.5); font-family:'Bebas Neue',sans-serif; font-size:16px; color:var(--crimson);
  outline:none; -webkit-appearance:none; border-radius:0;
}

.empty-roster { padding:20px 0; text-align:center; font-size:12px; opacity:0.7; letter-spacing:1px; }

.btn-primary {
  width:100%; margin-top:6px; padding:16px;
  background:var(--crimson); color:var(--gold);
  font-family:'Bebas Neue',sans-serif; font-size:18px; letter-spacing:4px;
  border:none; cursor:pointer; transition:opacity .15s;
}
.btn-primary:hover { opacity:.85; }
.btn-primary:disabled { opacity:.35; cursor:not-allowed; }
.btn-secondary {
  width:100%; margin-top:12px; padding:12px;
  background:transparent; color:var(--crimson); border:1px solid var(--border);
  font-family:'Cinzel',serif; font-size:11px; letter-spacing:2px; cursor:pointer;
}
.msg { margin-top:14px; font-size:11px; letter-spacing:2px; min-height:16px; text-align:center; }
.msg.err { color:var(--crimson); }
.msg.ok  { color:var(--ok); }

.late-panel { display:none; margin-top:14px; padding:16px; border:1px dashed var(--border); background:rgba(76,0,7,0.04); }
.late-panel.open { display:block; }

.btn-logout { margin-top:24px; padding:10px 18px; background:transparent; color:var(--crimson); border:1px solid var(--border); font-family:'Cinzel',serif; font-size:9px; letter-spacing:3px; cursor:pointer; opacity:0.65; }
.btn-logout:hover { opacity:1; }
</style>
</head>
<body>

<div class="screen active" id="loadingScreen">
  <div class="card"><div class="title">LOADING…</div></div>
</div>

<div class="screen" id="rosterScreen">
  <div class="card">
    <div class="badge" id="stationBadge">Battle 1 Judge — Rannbhoomi 2026</div>
    <div class="title" id="waveTitle">—</div>
    <div class="sub" id="waveSub">—</div>
    <div class="rule"></div>

    <table class="roster-table" id="rosterTable" style="display:none;">
      <thead><tr><th>Athlete</th><th style="text-align:right;">Score</th></tr></thead>
      <tbody id="rosterBody"></tbody>
    </table>
    <div class="empty-roster" id="emptyRoster" style="display:none;">No one checked in yet for this wave/zone.</div>

    <button class="btn-primary" id="submitBtn" onclick="submitAll()" style="display:none;">SUBMIT ALL</button>
    <div class="msg" id="rosterMsg"></div>

    <button class="btn-secondary" onclick="toggleLateEntry()">LATE ENTRY — SCORE A DIFFERENT WAVE</button>
    <div class="late-panel" id="latePanel">
      <label style="font-size:9px; letter-spacing:3px; opacity:0.75; display:block; margin-bottom:8px;">Select wave</label>
      <select id="lateWaveSelect" onchange="onLateWaveChange()" style="width:100%; padding:12px; border:1px solid var(--border); background:rgba(214,185,122,0.4); font-family:'Cinzel',serif; font-size:13px; color:var(--crimson);">
        <option value="">-- select --</option>
      </select>
    </div>

    <button class="btn-logout" onclick="logout()">LOG OUT</button>
  </div>
</div>

<script>
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxELQsXchGNJXNDyETPXuFOLNKXNNL48OZcG0IRtS-eohXx9gOSP-ZFC1J0PHl-QjNG/exec';

const STATION_LABELS = {
  s1_burpees:   { label: 'Static Burpees',    unit: 'reps' },
  s2_bike:      { label: 'Erg Bike',          unit: 'metres' },
  s3_lunges:    { label: 'Deadlift',          unit: 'reps' },
  s4_pushups:   { label: 'Hand Release Push Ups', unit: 'reps' },
  s5_sprint:    { label: 'Sprint with Weights', unit: 'laps' },
  s6_inchworms: { label: 'Inch Worms',        unit: 'reps' },
  s7_squats:    { label: 'DB Front Squats',   unit: 'reps' },
};

let judge = null;
let pin = null;
let currentWave = null;

function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

(async function init() {
  const params = new URLSearchParams(location.search);
  pin = params.get('pin') || sessionStorage.getItem('judge_pin') || '';
  if (!pin) { location.href = 'index.html'; return; }

  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=judge_login&pin=${encodeURIComponent(pin)}`);
    const data = await res.json();
    if (!data.found || String(data.judge.battle) !== '1' || data.judge.station === 'checkin') {
      location.href = 'index.html?pin=' + encodeURIComponent(pin);
      return;
    }
    judge = data.judge;
    sessionStorage.setItem('judge_pin', pin);

    const stInfo = STATION_LABELS[judge.station] || { label: judge.station, unit: '' };
    document.getElementById('stationBadge').textContent = `Zone ${judge.assignment} — ${stInfo.label}`;

    await loadRoster();
    show('rosterScreen');
  } catch (err) {
    document.getElementById('loadingScreen').querySelector('.title').textContent = 'CONNECTION FAILED';
  }
})();

async function loadRoster(waveOverride) {
  const url = waveOverride
    ? `${APPS_SCRIPT_URL}?action=battle1_roster&pin=${encodeURIComponent(pin)}&wave=${encodeURIComponent(waveOverride)}`
    : `${APPS_SCRIPT_URL}?action=battle1_roster&pin=${encodeURIComponent(pin)}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    currentWave = data.wave;
    renderRoster(data.wave, data.roster || []);
  } catch {
    document.getElementById('rosterMsg').textContent = 'Failed to load roster';
    document.getElementById('rosterMsg').className = 'msg err';
  }
}

function renderRoster(wave, roster) {
  const stInfo = STATION_LABELS[judge.station] || { label: judge.station, unit: '' };
  document.getElementById('waveTitle').textContent = wave ? `WAVE ${wave}` : 'NO ACTIVE WAVE';
  document.getElementById('waveSub').textContent = wave
    ? `${roster.length} checked in — enter ${stInfo.label} (${stInfo.unit})`
    : 'Use Late Entry below to score a specific wave, or wait for Front Desk to activate one.';

  const table = document.getElementById('rosterTable');
  const empty = document.getElementById('emptyRoster');
  const submitBtn = document.getElementById('submitBtn');

  if (!roster.length) {
    table.style.display = 'none';
    empty.style.display = 'block';
    submitBtn.style.display = 'none';
    return;
  }

  table.style.display = 'table';
  empty.style.display = 'none';
  submitBtn.style.display = 'block';

  const tbody = document.getElementById('rosterBody');
  tbody.innerHTML = roster.map(a => `
    <tr>
      <td>
        <div class="rt-name">${escHtml(a.name)}</div>
        <div class="rt-id">${a.athlete_id}</div>
      </td>
      <td style="text-align:right;">
        <input class="rt-input" type="number" min="0" step="1" inputmode="numeric"
               id="score_${a.athlete_id}" value="${a.existingValue !== null ? a.existingValue : ''}">
      </td>
    </tr>
  `).join('');
}

async function submitAll() {
  const btn = document.getElementById('submitBtn');
  const msg = document.getElementById('rosterMsg');
  if (!currentWave) return;

  const inputs = document.querySelectorAll('#rosterBody input');
  const scores = Array.from(inputs)
    .map(inp => ({ athlete_id: inp.id.replace('score_', ''), value: inp.value }))
    .filter(s => s.value !== '');

  if (!scores.length) { msg.textContent = 'Enter at least one score.'; msg.className = 'msg err'; return; }

  btn.disabled = true;
  msg.textContent = '';
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'battle1_submit_wave', pin, wave: currentWave, scores }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed');

    msg.textContent = `Submitted ${data.submitted} score${data.submitted === 1 ? '' : 's'}.` +
      (data.skipped && data.skipped.length ? ` (${data.skipped.length} skipped — not checked in.)` : '');
    msg.className = 'msg ok';
    await loadRoster(currentWave);
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg err';
  }
  btn.disabled = false;
}

function toggleLateEntry() {
  const panel = document.getElementById('latePanel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) loadLateWaves();
}

async function loadLateWaves() {
  const sel = document.getElementById('lateWaveSelect');
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=waves_for_late_entry`);
    const data = await res.json();
    const waves = data.waves || [];
    sel.innerHTML = '<option value="">-- select --</option>' +
      waves.map(w => `<option value="${w.wave_num}">Wave ${w.wave_num} (${w.status})</option>`).join('');
  } catch {
    sel.innerHTML = '<option value="">Failed to load</option>';
  }
}

function onLateWaveChange() {
  const wave = document.getElementById('lateWaveSelect').value;
  if (!wave) return;
  loadRoster(wave);
  document.getElementById('latePanel').classList.remove('open');
}

function logout() {
  sessionStorage.removeItem('judge_pin');
  location.href = 'index.html';
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
</script>
</body>
</html>
```

- [ ] **Step 2: Make `judge/index.html` a pure router — remove the embedded Battle 1 UI**

Find the block added in Task 3 Step 2:

```javascript
    if (String(judge.battle) === '1' && judge.station === 'checkin') {
      location.href = 'checkin.html?pin=' + encodeURIComponent(pin);
      return;
    }
    if (String(judge.battle) !== '1') {
      msg.textContent = 'Unknown assignment for this PIN';
      msg.className = 'msg err';
      btn.disabled = false;
      btn.textContent = 'ENTER';
      return;
    }

    showQueue();
```

Replace with:

```javascript
    if (String(judge.battle) === '1') {
      location.href = (judge.station === 'checkin' ? 'checkin.html' : 'battle1.html') + '?pin=' + encodeURIComponent(pin);
      return;
    }
    msg.textContent = 'Unknown assignment for this PIN';
    msg.className = 'msg err';
    btn.disabled = false;
    btn.textContent = 'ENTER';
```

Now remove everything the embedded Battle 1 UI needed, since nothing calls
`showQueue()` anymore.

Delete this exact CSS block (directly after `.assignment-sub`/`.rule`,
before `.field-label`'s later reuse is unaffected — these are all the
queue-screen-only rules):

```css
.queue-card { width: 100%; max-width: 480px; }
.queue-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px; }
.queue-title { font-family: 'Bebas Neue', sans-serif; font-size: 28px; letter-spacing: 2px; color: var(--crimson); line-height: 1; }
.queue-zone { font-size: 9px; letter-spacing: 3px; opacity: 0.8; margin-top: 4px; }
.wave-badge {
  background: var(--crimson); color: var(--gold);
  font-family: 'Bebas Neue', sans-serif; font-size: 14px; letter-spacing: 2px;
  padding: 6px 12px; white-space: nowrap;
}
.q-rule { width: 100%; height: 1px; background: var(--crimson); opacity: 0.15; margin-bottom: 28px; }
.athlete-lookup { margin-bottom: 24px; position: relative; }
.athlete-name-display {
  margin-top: 10px; padding: 12px 14px;
  background: rgba(76,0,7,0.06); border-left: 3px solid var(--crimson);
  font-size: 13px; letter-spacing: 1px; min-height: 44px;
}
.athlete-name-display.found { border-color: #1a6b00; }
.athlete-name-display.not-found { border-color: var(--crimson); opacity: 0.6; }
.value-input-wrap { margin-bottom: 28px; }
.big-input {
  width: 100%; padding: 22px 16px; text-align: center;
  border: 2px solid var(--border); background: rgba(214,185,122,0.4);
  font-family: 'Bebas Neue', sans-serif; font-size: 52px; color: var(--crimson);
  outline: none; -webkit-appearance: none; border-radius: 0;
  letter-spacing: 4px;
}
.big-input:focus { border-color: var(--crimson); background: rgba(214,185,122,0.65); }
.unit-label { text-align: center; font-size: 16px; letter-spacing: 2px; opacity: 0.85; font-weight: 700; margin-top: 8px; }
.submit-confirm {
  width: 100%; padding: 20px;
  background: var(--crimson); color: var(--gold);
  font-family: 'Bebas Neue', sans-serif; font-size: 22px; letter-spacing: 5px;
  border: none; cursor: pointer; transition: opacity .15s;
}
.submit-confirm:hover { opacity: .85; }
.submit-confirm:disabled { opacity: .35; cursor: not-allowed; }
.last-entry {
  margin-top: 20px; padding: 14px 16px;
  background: rgba(76,0,7,0.05); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: space-between;
  font-size: 11px; letter-spacing: 1px;
}
.last-entry .le-name { opacity: 0.7; flex: 1; }
.last-entry .le-val  { font-family: 'Bebas Neue', sans-serif; font-size: 20px; color: var(--crimson); margin-left: 12px; }
.last-entry .le-check { color: #1a6b00; margin-left: 10px; font-size: 16px; }
.score-count { margin-top: 12px; font-size: 9px; letter-spacing: 3px; opacity: 0.7; text-align: center; }
```

Delete this exact HTML block (the entire `queueScreen` screen):

```html
<!-- ── Queue Screen (Battle 1 only — Battle 2 / Gym Battle redirect to their own pages) ── -->
<div class="screen" id="queueScreen">
  <div class="queue-card">
    <div class="queue-header">
      <div>
        <div class="queue-title" id="qStationTitle">—</div>
        <div class="queue-zone" id="qZoneLabel">—</div>
      </div>
      <div class="wave-badge">BATTLE 1</div>
    </div>
    <div class="q-rule"></div>

    <div class="athlete-lookup">
      <label class="field-label field-label-lg" for="athleteId">Athlete ID (Bib Number)</label>
      <input class="field-input" type="text" id="athleteId" placeholder="e.g. RB001234"
             autocomplete="off" autocapitalize="characters"
             oninput="onAthleteIdInput()" onpaste="setTimeout(onAthleteIdInput,0)">
      <div class="athlete-name-display" id="athleteNameDisplay">Enter athlete ID above</div>
    </div>

    <div class="value-input-wrap">
      <input class="big-input" type="number" id="valueInput" placeholder="0"
             min="0" step="1" inputmode="numeric"
             onkeydown="if(event.key==='Enter') submitScore()">
      <div class="unit-label" id="unitLabel">—</div>
    </div>

    <button class="submit-confirm" id="submitBtn" onclick="submitScore()" disabled>SUBMIT SCORE</button>
    <div class="msg" id="submitMsg"></div>

    <div class="last-entry" id="lastEntry" style="display:none;">
      <span class="le-name" id="leName">—</span>
      <span class="le-val"  id="leVal">—</span>
      <span class="le-check">✓</span>
    </div>

    <div class="score-count" id="scoreCount">Scored this session: 0</div>
    <button class="btn-logout" onclick="logout()">LOG OUT</button>
  </div>
</div>
```

Delete this exact JS block (the queue-screen-only constant and state
variables — keep `let judge = null;`, drop the rest):

```javascript
const STATION_LABELS = {
  s1_burpees:   { label: 'Static Burpees',    unit: 'reps' },
  s2_bike:      { label: 'Erg Bike',          unit: 'metres' },
  s3_lunges:    { label: 'Deadlift',          unit: 'reps' },
  s4_pushups:   { label: 'Hand Release Push Ups', unit: 'reps' },
  s5_sprint:    { label: 'Sprint with Weights', unit: 'laps' },
  s6_inchworms: { label: 'Inch Worms',        unit: 'reps' },
  s7_squats:    { label: 'DB Front Squats',   unit: 'reps' },
};

let scoreCount = 0;
let currentAthleteId = '';
let currentAthleteName = '';
let athleteConfirmed = false;
let lookupTimer = null;
let judge = null;
```

Replace it with just:

```javascript
let judge = null;
```

Delete this exact `showQueue()` function:

```javascript
function showQueue() {
  document.getElementById('pinScreen').classList.remove('active');
  document.getElementById('queueScreen').classList.add('active');

  const stInfo = STATION_LABELS[judge.station] || null;
  document.getElementById('qStationTitle').textContent = (stInfo ? stInfo.label : judge.station).toUpperCase();
  document.getElementById('unitLabel').textContent     = (stInfo ? stInfo.unit : '—').toUpperCase();
  document.getElementById('qZoneLabel').textContent    = `Zone ${judge.assignment}`;

  document.getElementById('athleteId').focus();
}
```

Delete this exact block (`onAthleteIdInput`, `lookupAthlete`,
`updateSubmitBtn`):

```javascript
function onAthleteIdInput() {
  const id  = document.getElementById('athleteId').value.trim().toUpperCase();
  const box = document.getElementById('athleteNameDisplay');
  athleteConfirmed   = false;
  currentAthleteId   = '';
  currentAthleteName = '';
  updateSubmitBtn();

  if (!id || id.length < 4) {
    box.textContent  = 'Enter athlete ID above';
    box.className    = 'athlete-name-display';
    return;
  }

  box.textContent = 'Looking up...';
  box.className   = 'athlete-name-display';
  clearTimeout(lookupTimer);
  lookupTimer = setTimeout(() => lookupAthlete(id), 500);
}

async function lookupAthlete(id) {
  const box = document.getElementById('athleteNameDisplay');
  try {
    const res  = await fetch(`${APPS_SCRIPT_URL}?action=validate_athlete&athlete_id=${encodeURIComponent(id)}`);
    const data = await res.json();
    if (data.found && data.athlete) {
      const a = data.athlete;
      const name     = a.name || id;
      const category = a.category ? ` · ${String(a.category).charAt(0).toUpperCase() + String(a.category).slice(1)}` : '';
      box.textContent  = `${name}${category}`;
      box.className    = 'athlete-name-display found';
      currentAthleteId   = id;
      currentAthleteName = name;
      athleteConfirmed   = true;
    } else {
      box.textContent = 'Athlete not found — check ID';
      box.className   = 'athlete-name-display not-found';
    }
  } catch {
    box.textContent = 'Lookup failed — check connection';
    box.className   = 'athlete-name-display not-found';
  }
  updateSubmitBtn();
}

function updateSubmitBtn() {
  const val = parseFloat(document.getElementById('valueInput').value);
  document.getElementById('submitBtn').disabled = !(athleteConfirmed && !isNaN(val) && val >= 0);
}
```

Delete this exact `submitScore()` function:

```javascript
async function submitScore() {
  const btn = document.getElementById('submitBtn');
  const msg = document.getElementById('submitMsg');
  const val = parseFloat(document.getElementById('valueInput').value);

  if (!athleteConfirmed || isNaN(val)) return;

  btn.disabled   = true;
  btn.textContent = 'SUBMITTING...';
  msg.textContent = '';
  msg.className  = 'msg';

  try {
    const res  = await fetch(APPS_SCRIPT_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'text/plain' },
      body:    JSON.stringify({
        action:     'score',
        pin:        judge.pin,
        round:      '1',
        station:    judge.station,
        athlete_id: currentAthleteId,
        value:      val,
      }),
    });
    const data = await res.json();

    if (data.success) {
      document.getElementById('leName').textContent = currentAthleteName;
      const stInfo = STATION_LABELS[judge.station] || null;
      document.getElementById('leVal').textContent  = `${val} ${stInfo ? stInfo.unit : ''}`;
      document.getElementById('lastEntry').style.display = 'flex';

      scoreCount++;
      document.getElementById('scoreCount').textContent = `Scored this session: ${scoreCount}`;

      document.getElementById('athleteId').value    = '';
      document.getElementById('valueInput').value   = '';
      document.getElementById('athleteNameDisplay').textContent = 'Enter athlete ID above';
      document.getElementById('athleteNameDisplay').className   = 'athlete-name-display';
      athleteConfirmed   = false;
      currentAthleteId   = '';
      currentAthleteName = '';

      msg.textContent = '';
      document.getElementById('athleteId').focus();
    } else {
      throw new Error(data.error || 'Submission failed');
    }
  } catch (err) {
    msg.textContent = err.message;
    msg.className   = 'msg err';
    if (err.message.includes('PIN')) {
      sessionStorage.removeItem('judge_pin');
      judge = null;
      setTimeout(() => {
        document.getElementById('queueScreen').classList.remove('active');
        document.getElementById('pinScreen').classList.add('active');
        document.getElementById('pinMsg').textContent = 'PIN rejected — re-enter';
        document.getElementById('pinMsg').className   = 'msg err';
      }, 1200);
    }
  }

  btn.disabled    = false;
  btn.textContent = 'SUBMIT SCORE';
  updateSubmitBtn();
}
```

Delete this exact trailing line:

```javascript
document.getElementById('valueInput').addEventListener('input', updateSubmitBtn);
```

Keep everything else: `init()`, `submitPin()`, `verifyPin()` (already
updated in Step 1 above), `logout()`.

- [ ] **Step 3: Manual verification**

Run this to confirm no dead references survive in `judge/index.html`:

```bash
grep -n "queueScreen\|showQueue\|athleteId\|valueInput\|submitScore\|STATION_LABELS\|onAthleteIdInput\|lookupAthlete\|updateSubmitBtn" judge/index.html
```

Expected: no output (empty). Also confirm every element `id` referenced in
`judge/battle1.html`'s script (`stationBadge`, `waveTitle`, `waveSub`,
`rosterTable`, `rosterBody`, `emptyRoster`, `submitBtn`, `rosterMsg`,
`latePanel`, `lateWaveSelect`) has a matching HTML element.

- [ ] **Step 4: Commit**

```bash
git add judge/battle1.html judge/index.html
git commit -m "$(cat <<'EOF'
feat: add wave-scoped Battle 1 judge screen, index.html is now a pure router

judge/battle1.html replaces free-text bib entry with a table of the
judge's own zone's checked-in roster for the active wave, one SUBMIT
ALL batching the whole station in one atomic write, and a Late Entry
toggle to score a non-active wave. judge/index.html no longer embeds
Battle 1 logic directly — it redirects to battle1.html/checkin.html
the same way it already does for Battle 2/3/Gym Battle.
EOF
)"
```

---

### Task 6: Backend + Frontend — admin wave management

**Files:**
- Modify: `backend/Code.gs` (`doGet`/`doPost` dispatch tables, new
  functions near the existing admin functions)
- Modify: `admin/index.html` (new "Waves" section)

**Interfaces:**
- Consumes (backend): `WAVES_SHEET`, `CHECKINS_SHEET`, `getConfig(ss)`
  (existing admin-PIN check pattern already used by `clearAllScores`/
  `setReleaseAll`/`adminRebuild`).
- Produces (backend):
  - `adminWavesOverview(e)` (GET `admin_waves_overview`, no PIN — read-only
    status, same convention as other GET reads in this file) →
    `{ waves: [{ wave_num, status, zone_counts: { A, B, C, D } }] }`.
  - `adminActivateWave(body)` (POST `admin_activate_wave`, body `{ pin,
    wave }`) → `{ success: true }` or `{ error: '<message>' }`. Blocks
    activating a second wave while one is already Active.
  - `adminCompleteWave(body)` (POST `admin_complete_wave`, body `{ pin,
    wave }`) → `{ success: true }`. Manual override so a wave that can
    never naturally auto-complete (e.g. a withdrawn athlete) doesn't block
    activating the next one — **this wasn't explicitly requested but is
    necessary for the "one Active wave at a time" rule not to deadlock the
    event; flag it during review if it should be reconsidered.**
- Consumes (frontend): the three endpoints above, reusing `admin/index.html`'s
  existing `post()` helper and `showMsg()` pattern.

- [ ] **Step 1: Add the admin wave functions to `backend/Code.gs`**

Find `adminRebuild(body)` (the last function in the "Admin: manual
leaderboard rebuild" section). Add these new functions directly after its
closing `}`:

```javascript
// ─── Admin: Battle 1 wave management ─────────────────────────────────────

// GET: all waves + status + per-zone checked-in counts, for the admin
// panel's Waves section. No PIN required — read-only status info, same
// convention as this file's other GET reads.
function adminWavesOverview(e) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const wavesSheet = ss.getSheetByName(WAVES_SHEET);
  if (!wavesSheet || wavesSheet.getLastRow() <= 1) return jsonResponse({ waves: [] });
  const wavesData = wavesSheet.getDataRange().getValues();

  const checkinsSheet = ss.getSheetByName(CHECKINS_SHEET);
  const checkins = (checkinsSheet && checkinsSheet.getLastRow() > 1)
    ? checkinsSheet.getDataRange().getValues().slice(1)
    : [];

  const waves = wavesData.slice(1).filter(r => r[0]).map(r => {
    const waveNum = r[0];
    const zoneCounts = { A: 0, B: 0, C: 0, D: 0 };
    checkins.forEach(c => {
      if (String(c[0]) === String(waveNum) && zoneCounts[c[1]] !== undefined) zoneCounts[c[1]]++;
    });
    return { wave_num: waveNum, status: r[1], zone_counts: zoneCounts };
  }).sort((a, b) => Number(a.wave_num) - Number(b.wave_num));

  return jsonResponse({ waves });
}

// POST: activates a Draft wave. Blocks activating a second wave while one
// is already Active — same "one Active wave at a time" rule as
// Prehab121's fdActivateWave.
function adminActivateWave(body) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const cfg = getConfig(ss);
  if (String(body.pin) !== String(cfg['judge_pin'])) return jsonResponse({ error: 'Invalid PIN' });
  const { wave } = body;
  if (!wave) return jsonResponse({ error: 'wave required' });

  const sheet = ss.getSheetByName(WAVES_SHEET);
  const data = sheet.getDataRange().getValues();
  const activeRow = data.findIndex((r, i) => i > 0 && r[1] === 'Active');
  if (activeRow > -1 && String(data[activeRow][0]) !== String(wave)) {
    return jsonResponse({ error: `Wave ${data[activeRow][0]} is already Active — complete or force-complete it first.` });
  }
  const rowIdx = data.findIndex((r, i) => i > 0 && String(r[0]) === String(wave));
  if (rowIdx === -1) return jsonResponse({ error: 'Wave not found' });
  sheet.getRange(rowIdx + 1, 2).setValue('Active');
  return jsonResponse({ success: true });
}

// POST: manual override to mark a wave Complete even if not every
// checked-in athlete has a full score yet. Wave completion is normally
// automatic (see _maybeCompleteWave in the Battle 1 scoring section), but
// a withdrawn/injured athlete would otherwise block that wave from ever
// auto-completing — which would in turn block activating the next wave.
// This is the escape hatch for that.
function adminCompleteWave(body) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const cfg = getConfig(ss);
  if (String(body.pin) !== String(cfg['judge_pin'])) return jsonResponse({ error: 'Invalid PIN' });
  const { wave } = body;
  if (!wave) return jsonResponse({ error: 'wave required' });
  const sheet = ss.getSheetByName(WAVES_SHEET);
  const data = sheet.getDataRange().getValues();
  const rowIdx = data.findIndex((r, i) => i > 0 && String(r[0]) === String(wave));
  if (rowIdx === -1) return jsonResponse({ error: 'Wave not found' });
  sheet.getRange(rowIdx + 1, 2).setValue('Complete');
  return jsonResponse({ success: true });
}
```

- [ ] **Step 2: Register the GET action in `doGet`**

Find the line added in Task 4 (`if (action === 'waves_for_late_entry')
...`). Add directly after it:

```javascript
  if (action === 'admin_waves_overview') return adminWavesOverview(e);
```

- [ ] **Step 3: Register the POST actions in `doPost`**

Find this line in `doPost` (currently around line 47):

```javascript
  if (action === 'rebuild_leaderboard') return adminRebuild(body);
```

Add directly after it:

```javascript
  if (action === 'admin_activate_wave') return adminActivateWave(body);
  if (action === 'admin_complete_wave') return adminCompleteWave(body);
```

- [ ] **Step 4: Add a "Waves" section to `admin/index.html`**

Find this block in `admin/index.html`:

```html
    <div class="action-card">
      <h3>REBUILD LEADERBOARD NOW</h3>
      <p>Forces an immediate cache rebuild without waiting for the 1-minute trigger. Useful after manually editing scores in the Sheet.</p>
      <button class="btn-secondary" onclick="rebuildNow()">REBUILD NOW</button>
    </div>

  </div>
  <div class="msg" id="globalMsg"></div>
</div>
```

Replace with:

```html
    <div class="action-card">
      <h3>REBUILD LEADERBOARD NOW</h3>
      <p>Forces an immediate cache rebuild without waiting for the 1-minute trigger. Useful after manually editing scores in the Sheet.</p>
      <button class="btn-secondary" onclick="rebuildNow()">REBUILD NOW</button>
    </div>

  </div>
  <div class="msg" id="globalMsg"></div>

  <div style="margin-top:32px;">
    <h3 style="font-size:12px; letter-spacing:2px; margin-bottom:10px;">BATTLE 1 — WAVES</h3>
    <button class="btn-secondary" onclick="loadWavesOverview()" style="margin-bottom:12px;">REFRESH WAVES</button>
    <div id="wavesOverview"></div>
  </div>
</div>
```

Find the closing `</script>` tag at the end of the file's `<script>` block
(the very last content before `</body>`). Add this new code directly
**before** it:

```javascript
async function loadWavesOverview() {
  const el = document.getElementById('wavesOverview');
  el.textContent = 'Loading...';
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=admin_waves_overview`);
    const data = await res.json();
    const waves = data.waves || [];
    if (!waves.length) { el.textContent = 'No waves found — run setupWavesSheet() from the Apps Script editor.'; return; }
    el.innerHTML = waves.map(w => `
      <div class="action-card" style="margin-bottom:10px;">
        <h3>WAVE ${w.wave_num} — ${w.status.toUpperCase()}</h3>
        <p>Checked in — A: ${w.zone_counts.A}, B: ${w.zone_counts.B}, C: ${w.zone_counts.C}, D: ${w.zone_counts.D}</p>
        ${w.status === 'Draft' ? `<button class="btn-danger" onclick="activateWave(${w.wave_num})">ACTIVATE</button>` : ''}
        ${w.status === 'Active' ? `<button class="btn-secondary" onclick="completeWave(${w.wave_num})">FORCE COMPLETE</button>` : ''}
      </div>
    `).join('');
  } catch (err) {
    el.textContent = 'Error loading waves: ' + err.message;
  }
}

async function activateWave(wave) {
  if (!getPin()) { showMsg('globalMsg', 'Enter PIN first', 'err'); return; }
  if (!confirm(`Activate Wave ${wave}? Athletes should be checked in already.`)) return;
  try {
    const res = await post({ action: 'admin_activate_wave', pin: getPin(), wave });
    if (!res.success) throw new Error(res.error || 'Failed');
    showMsg('globalMsg', `Wave ${wave} is now Active.`, 'ok');
    loadWavesOverview();
  } catch (err) {
    showMsg('globalMsg', err.message, 'err');
  }
}

async function completeWave(wave) {
  if (!getPin()) { showMsg('globalMsg', 'Enter PIN first', 'err'); return; }
  if (!confirm(`Force Wave ${wave} to Complete even if not everyone's scored?`)) return;
  try {
    const res = await post({ action: 'admin_complete_wave', pin: getPin(), wave });
    if (!res.success) throw new Error(res.error || 'Failed');
    showMsg('globalMsg', `Wave ${wave} marked Complete.`, 'ok');
    loadWavesOverview();
  } catch (err) {
    showMsg('globalMsg', err.message, 'err');
  }
}

loadWavesOverview();
```

- [ ] **Step 5: Manual verification**

- Confirm `adminActivateWave`/`adminCompleteWave` both check `body.pin`
  against `cfg['judge_pin']`, matching `clearAllScores`/`setReleaseAll`'s
  existing admin-gate pattern exactly.
- Confirm `adminWavesOverview` requires no PIN (read-only, matches
  `getScores`/`getAnalytics`'s existing no-PIN convention for reads).
- Confirm every `id`/function referenced in the new `admin/index.html`
  script (`wavesOverview`, `loadWavesOverview`, `activateWave`,
  `completeWave`) has a matching element or is defined, and that the
  existing `getPin()`/`showMsg()`/`post()` helpers are reused rather than
  redefined.

- [ ] **Step 6: Commit**

```bash
git add backend/Code.gs admin/index.html
git commit -m "$(cat <<'EOF'
feat: add admin Waves section (activate wave, force-complete override)

Front Desk-style control: shows every wave's status and per-zone
checked-in counts, one ACTIVATE action per Draft wave (blocks two
waves being Active at once), and a FORCE COMPLETE override so a wave
that can't naturally auto-complete (e.g. a withdrawn athlete) doesn't
block activating the next one.
EOF
)"
```

---

### Task 7: Deploy and live verification

**Files:** none (one-off setup functions, deployment, and manual testing
only)

**Interfaces:** none — this task only exercises what Tasks 1-6 built.

- [ ] **Step 1: Ask the organizer to redeploy the backend**

Paste the updated `backend/Code.gs` into the Apps Script editor and
redeploy: **Deploy → Manage deployments → edit the existing deployment →
New version** (never "new deployment").

- [ ] **Step 2: Run the new one-off setup functions once**

From the Apps Script editor, run each of these once (in this order):
`setupCheckinsSheet()`, `setupWavesSheet()`, `addCheckinPins()`. Check the
execution log for each — confirm `Checkins` and `Waves` sheets now exist
with the right headers, `Waves` has one Draft row per distinct wave number
found in `Athletes.wave`, and 4 new check-in PINs were logged (one per
zone).

- [ ] **Step 3: Ask whether to push the frontend changes**

Per this project's standing rule, do not push without asking each time.
Ask: "Ready to push `judge/checkin.html`, `judge/battle1.html`,
`judge/index.html`, and `admin/index.html` to GitHub?" Only run `git push`
after an explicit yes.

- [ ] **Step 4: Live walkthrough — check-in**

1. Log in with one zone's check-in PIN (`judge/index.html?pin=<PIN>`).
2. Confirm the wave dropdown shows the Draft waves, search for a couple of
   TEST-prefixed athletes, and check them in.
3. Confirm the "checked in" list below updates immediately, and reloading
   the page still shows them (resync from the sheet, not lost on refresh).
4. Check the same athlete in again — confirm the duplicate-guard prompt
   appears with the correct existing wave/zone, and confirm both
   "cancel" and "check in anyway" behave as expected.

- [ ] **Step 5: Live walkthrough — activate a wave, score it**

1. From `admin/index.html`, confirm the Waves section shows the wave you
   just checked athletes into, with the correct per-zone counts.
2. Tap ACTIVATE on that wave. Confirm activating a second wave is blocked
   while this one is Active.
3. Log in as one of that zone's 7 station judges (`judge/index.html?pin=<PIN>`,
   not the check-in PIN) — confirm the roster table shows only the
   athletes checked into that zone for the active wave (not all 300).
4. Enter scores for each, tap SUBMIT ALL — confirm `Round1_Scores` updates
   correctly, and reloading the page shows the pre-filled values.
5. Repeat for enough of the other 6 stations (and, if only one zone was
   checked in, that's sufficient) until every checked-in athlete is fully
   scored — confirm `Waves.status` flips to Complete automatically, with
   no manual action, and the admin panel reflects this on refresh.

- [ ] **Step 6: Live walkthrough — Late Entry and a simulated late arrival**

1. On a station judge's screen, open "LATE ENTRY", pick the now-Complete
   wave, confirm the same roster loads and a missed score can still be
   submitted without disturbing the wave's Complete status.
2. Check a TEST athlete into a **later** wave than their `Athletes.wave`
   default (simulating a late arrival) — confirm they show up correctly in
   that later wave's roster and nowhere else.

- [ ] **Step 7: Report back**

Summarize what worked and what didn't, in the same terms used for the
Battle 2/Gym Battle fixes this session (exact screen state, sheet row
values) so any follow-up issue can be root-caused the same way.
