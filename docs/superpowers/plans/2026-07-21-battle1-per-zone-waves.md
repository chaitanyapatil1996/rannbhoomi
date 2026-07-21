# Battle 1 Per-Zone Wave Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Battle 1 wave activation per-zone instead of a single shared
switch across all 4 zones — check-in PINs own their own zone's whole
lifecycle (check-in, activate, force-complete); the admin panel's Waves
section is removed entirely.

**Architecture:** `Waves` sheet gains a `zone` column, becoming one row per
(wave, zone) pair instead of one row per wave. Every function that reads
"the active wave" or checks completion becomes zone-scoped. Two new
check-in actions (`checkin_activate_wave`, `checkin_complete_wave`) replace
the three admin wave actions being removed.

**Tech Stack:** Google Apps Script (`backend/Code.gs`), vanilla HTML/CSS/JS,
Google Sheets.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-21-battle1-per-zone-waves-design.md`
  — read it before starting.
- No automated test framework — "test"/"verify" steps mean manual
  code read-through, plus live verification in Task 3 requiring the
  organizer.
- The live `Waves` sheet already exists with the OLD 2-column schema
  (`wave_num, status`) and test data in it from prior live testing — this
  plan includes a **destructive** one-off migration function
  (`migrateWavesToPerZone()`) that clears and rebuilds it. This is safe
  because `Waves` only tracks status, not actual check-ins — `Checkins`
  (the real roster data) is a separate sheet, untouched by this migration.
  Running the migration resets every zone back to Draft; anything
  currently Active/Complete will need to be re-activated after.
- Do not touch `Checkins`, Battle 2, Battle 3, or Gym Battle code/sheets.
- `backend/Code.gs` changes require a manual redeploy; this plan's changes
  also require running `migrateWavesToPerZone()` once from the Apps
  Script editor (Task 3) — not automatic.
- Never `git push` without explicit go-ahead each time.

---

### Task 1: Backend — per-zone Waves schema, migration, and zone-scoped logic

**Files:**
- Modify: `backend/Code.gs`

**Interfaces:**
- Consumes: `WAVES_SHEET`, `CHECKINS_SHEET`, `_checkinsForWave`,
  `_lookupJudge`, `SCORE_SHEETS['1']` — all pre-existing.
- Produces:
  - `migrateWavesToPerZone()` — new one-off, destructive migration.
  - `setupWavesSheet()` — updated to populate `(wave_num, zone, status)`
    rows (4× per distinct wave number) instead of one row per wave.
  - `_activeWaveForZone(zone)` — replaces `_activeWave()`.
  - `_maybeCompleteWave(wave, zone)` — now takes a `zone` argument (was
    `_maybeCompleteWave(wave)`).
  - `wavesOpenForCheckin(e)` / `wavesForLateEntry(e)` — both now read an
    optional `zone` query param and filter to it.
  - `checkinActivateWave(body)` (POST `checkin_activate_wave`) → `{
    success: true }` or `{ error }`.
  - `checkinCompleteWave(body)` (POST `checkin_complete_wave`) → `{
    success: true }` or `{ error }`.
  - `adminWavesOverview`, `adminActivateWave`, `adminCompleteWave` and
    their `doGet`/`doPost` registrations are **removed**.

- [ ] **Step 1: Add `migrateWavesToPerZone()` and update `setupWavesSheet()`**

Find `setupWavesSheet()` in `backend/Code.gs`. Replace the entire function
with:

```javascript
// Populates one Draft row per (distinct wave number in Athletes.wave) x
// (each of the 4 zones) — only run against a brand-new, empty sheet.
function setupWavesSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(WAVES_SHEET);
  if (!sheet) sheet = ss.insertSheet(WAVES_SHEET);
  if (sheet.getLastRow() > 0) { Logger.log('Waves already has data — leaving it alone.'); return; }
  const headers = ['wave_num', 'zone', 'status'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');

  const athleteSheet = ss.getSheetByName('Athletes');
  if (athleteSheet && athleteSheet.getLastRow() > 1) {
    const data = athleteSheet.getDataRange().getValues();
    const waveIdx = data[0].indexOf('wave');
    if (waveIdx > -1) {
      const waveNums = [...new Set(data.slice(1).map(r => String(r[waveIdx]).trim()).filter(Boolean))]
        .map(Number).sort((a, b) => a - b);
      const ZONES = ['A', 'B', 'C', 'D'];
      const rows = [];
      waveNums.forEach(n => ZONES.forEach(z => rows.push([n, z, 'Draft'])));
      if (rows.length) sheet.getRange(2, 1, rows.length, 3).setValues(rows);
    }
  }
  Logger.log('setupWavesSheet complete.');
}

// One-off migration: the live Waves sheet was created with the OLD
// (wave_num, status) schema — one shared status across all 4 zones. This
// clears and rebuilds it as (wave_num, zone, status), one row per (wave,
// zone) pair. DESTRUCTIVE — only run this once. Safe because Waves only
// tracks status, not who's checked in (that's the separate Checkins
// sheet, untouched here) — resets every zone back to Draft.
function migrateWavesToPerZone() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(WAVES_SHEET);
  if (!sheet) { Logger.log('Waves sheet not found — nothing to migrate, run setupWavesSheet() instead.'); return; }
  sheet.clear();
  const headers = ['wave_num', 'zone', 'status'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');

  const athleteSheet = ss.getSheetByName('Athletes');
  if (athleteSheet && athleteSheet.getLastRow() > 1) {
    const data = athleteSheet.getDataRange().getValues();
    const waveIdx = data[0].indexOf('wave');
    if (waveIdx > -1) {
      const waveNums = [...new Set(data.slice(1).map(r => String(r[waveIdx]).trim()).filter(Boolean))]
        .map(Number).sort((a, b) => a - b);
      const ZONES = ['A', 'B', 'C', 'D'];
      const rows = [];
      waveNums.forEach(n => ZONES.forEach(z => rows.push([n, z, 'Draft'])));
      if (rows.length) sheet.getRange(2, 1, rows.length, 3).setValues(rows);
    }
  }
  Logger.log('migrateWavesToPerZone complete — Waves sheet rebuilt with per-zone rows, all Draft.');
}
```

- [ ] **Step 2: Replace `_activeWave()` with `_activeWaveForZone(zone)`**

Find `_activeWave()`:

```javascript
function _activeWave() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(WAVES_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return null;
  const data = sheet.getDataRange().getValues();
  const row = data.find((r, i) => i > 0 && r[1] === 'Active');
  return row ? { wave_num: row[0], status: row[1] } : null;
}
```

Replace with:

```javascript
function _activeWaveForZone(zone) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(WAVES_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return null;
  const data = sheet.getDataRange().getValues();
  const row = data.find((r, i) => i > 0 && String(r[1]) === String(zone) && r[2] === 'Active');
  return row ? { wave_num: row[0], zone: row[1], status: row[2] } : null;
}
```

- [ ] **Step 3: Update `battle1Roster` to use the zone-scoped active wave**

Find this line inside `battle1Roster`:

```javascript
    const active = _activeWave();
```

Replace with:

```javascript
    const active = _activeWaveForZone(judge.assignment);
```

- [ ] **Step 4: Make `wavesOpenForCheckin` and `wavesForLateEntry` zone-scoped**

Find `wavesOpenForCheckin(e)`:

```javascript
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
```

Replace with:

```javascript
function wavesOpenForCheckin(e) {
  const zone = e.parameter.zone;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(WAVES_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return jsonResponse({ waves: [] });
  const data = sheet.getDataRange().getValues();
  const waves = data.slice(1)
    .filter(r => r[0] && (!zone || String(r[1]) === String(zone)) && (r[2] === 'Draft' || r[2] === 'Active'))
    .map(r => ({ wave_num: r[0], zone: r[1], status: r[2] }))
    .sort((a, b) => Number(a.wave_num) - Number(b.wave_num));
  return jsonResponse({ waves });
}
```

Find `wavesForLateEntry(e)`:

```javascript
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

Replace with:

```javascript
function wavesForLateEntry(e) {
  const zone = e.parameter.zone;
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(WAVES_SHEET);
  if (!sheet || sheet.getLastRow() <= 1) return jsonResponse({ waves: [] });
  const data = sheet.getDataRange().getValues();
  const waves = data.slice(1)
    .filter(r => r[0] && (!zone || String(r[1]) === String(zone)) && (r[2] === 'Active' || r[2] === 'Complete'))
    .map(r => ({ wave_num: r[0], zone: r[1], status: r[2] }))
    .sort((a, b) => Number(a.wave_num) - Number(b.wave_num));
  return jsonResponse({ waves });
}
```

- [ ] **Step 5: Make `_maybeCompleteWave` zone-scoped**

Find `_maybeCompleteWave(wave)`:

```javascript
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
```

Replace with:

```javascript
function _maybeCompleteWave(wave, zone) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const checkedIn = _checkinsForWave(wave).filter(c => String(c.zone) === String(zone));
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
  const rowIdx = wavesData.findIndex((r, i) => i > 0 && String(r[0]) === String(wave) && String(r[1]) === String(zone));
  if (rowIdx > -1) wavesSheet.getRange(rowIdx + 1, 3).setValue('Complete');
}
```

Find the call site inside `battle1SubmitWave`:

```javascript
    _maybeCompleteWave(wave);
```

Replace with:

```javascript
    _maybeCompleteWave(wave, judge.assignment);
```

- [ ] **Step 6: Add `checkinActivateWave` and `checkinCompleteWave`**

Find `checkinSubmit`'s closing `}` (the function modified earlier this
session with the 7-athlete capacity cap). Add these two new functions
directly after it:

```javascript
// POST: activates a wave for the check-in judge's own zone only. Blocks
// only if a DIFFERENT wave is already Active for this SAME zone — other
// zones are completely unaffected, since wave lifecycle is per-zone.
function checkinActivateWave(body) {
  const { pin, wave } = body;
  const judge = _lookupJudge(pin);
  if (!judge || String(judge.battle) !== '1' || judge.station !== 'checkin') return jsonResponse({ error: 'Invalid PIN' });
  if (!wave) return jsonResponse({ error: 'wave required' });

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return jsonResponse({ error: 'Server busy — please retry' }); }
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(WAVES_SHEET);
    const data = sheet.getDataRange().getValues();
    const activeRow = data.findIndex((r, i) => i > 0 && String(r[1]) === String(judge.assignment) && r[2] === 'Active');
    if (activeRow > -1 && String(data[activeRow][0]) !== String(wave)) {
      return jsonResponse({ error: `Wave ${data[activeRow][0]} is already Active for Zone ${judge.assignment} — complete or force-complete it first.` });
    }
    const rowIdx = data.findIndex((r, i) => i > 0 && String(r[0]) === String(wave) && String(r[1]) === String(judge.assignment));
    if (rowIdx === -1) return jsonResponse({ error: 'Wave not found for this zone' });
    sheet.getRange(rowIdx + 1, 3).setValue('Active');
    return jsonResponse({ success: true });
  } finally {
    lock.releaseLock();
  }
}

// POST: force-completes a wave for the check-in judge's own zone — escape
// hatch for a wave that can never naturally auto-complete (e.g. a
// withdrawn athlete).
function checkinCompleteWave(body) {
  const { pin, wave } = body;
  const judge = _lookupJudge(pin);
  if (!judge || String(judge.battle) !== '1' || judge.station !== 'checkin') return jsonResponse({ error: 'Invalid PIN' });
  if (!wave) return jsonResponse({ error: 'wave required' });

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return jsonResponse({ error: 'Server busy — please retry' }); }
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(WAVES_SHEET);
    const data = sheet.getDataRange().getValues();
    const rowIdx = data.findIndex((r, i) => i > 0 && String(r[0]) === String(wave) && String(r[1]) === String(judge.assignment));
    if (rowIdx === -1) return jsonResponse({ error: 'Wave not found for this zone' });
    sheet.getRange(rowIdx + 1, 3).setValue('Complete');
    return jsonResponse({ success: true });
  } finally {
    lock.releaseLock();
  }
}
```

- [ ] **Step 7: Register the new check-in actions, remove the admin wave actions**

Find this line in `doPost` (added for check-in earlier this session):

```javascript
  if (action === 'checkin_submit')       return checkinSubmit(body);
```

Add directly after it:

```javascript
  if (action === 'checkin_activate_wave') return checkinActivateWave(body);
  if (action === 'checkin_complete_wave') return checkinCompleteWave(body);
```

Find and delete these three lines from `doGet`/`doPost` (the admin wave
routes added earlier this session):

```javascript
  if (action === 'admin_waves_overview') return adminWavesOverview(e);
```

```javascript
  if (action === 'admin_activate_wave') return adminActivateWave(body);
  if (action === 'admin_complete_wave') return adminCompleteWave(body);
```

- [ ] **Step 8: Remove the admin wave functions entirely**

Delete these three entire functions from `backend/Code.gs` (added earlier
this session, in the "Admin: Battle 1 wave management" section):
`adminWavesOverview`, `adminActivateWave`, `adminCompleteWave`. Delete the
`// ─── Admin: Battle 1 wave management ───` section-header comment above
them too.

- [ ] **Step 9: Manual verification**

- Confirm no remaining reference to `_activeWave(` (old name, no
  underscore-suffix zone arg) survives anywhere in the file:
  ```bash
  grep -n "_activeWave(" backend/Code.gs
  ```
  Expected: only `_activeWaveForZone(` matches, zero bare `_activeWave(`
  calls.
- Confirm no remaining reference to `adminWavesOverview`,
  `adminActivateWave`, or `adminCompleteWave` anywhere (functions or
  dispatch lines):
  ```bash
  grep -n "adminWavesOverview\|adminActivateWave\|adminCompleteWave\|admin_waves_overview\|admin_activate_wave\|admin_complete_wave" backend/Code.gs
  ```
  Expected: no output.
- Confirm `_maybeCompleteWave`'s single call site (`battle1SubmitWave`)
  passes both `wave` and `judge.assignment`.
- Confirm `checkinActivateWave`/`checkinCompleteWave` both require
  `judge.station === 'checkin'` (not usable by a station judge PIN).

- [ ] **Step 10: Commit**

```bash
git add backend/Code.gs
git commit -m "$(cat <<'EOF'
feat: make Battle 1 wave lifecycle per-zone, remove admin wave UI

Waves sheet gains a zone column — activation, completion, and the
open-waves lists are now all scoped per zone instead of one shared
switch across all 4. Check-in PINs gain activate/force-complete
actions for their own zone; the three admin wave endpoints are
removed entirely, per
docs/superpowers/specs/2026-07-21-battle1-per-zone-waves-design.md.
EOF
)"
```

---

### Task 2: Frontend — check-in gets activate/force-complete, admin panel reverts

**Files:**
- Modify: `judge/checkin.html` (wave status display, ACTIVATE/FORCE
  COMPLETE buttons, zone param on the waves-open fetch)
- Modify: `admin/index.html` (remove the Waves section added earlier this
  session)

**Interfaces:**
- Consumes: `checkin_activate_wave`, `checkin_complete_wave`,
  `waves_open` (now zone-scoped) — all from Task 1.

- [ ] **Step 1: Add wave-status display and action buttons to `judge/checkin.html`**

Find this block:

```html
    <label class="field-label" for="waveSelect">Wave</label>
    <select class="field-input" id="waveSelect" onchange="onWaveChange()">
      <option value="">Loading waves…</option>
    </select>
```

Replace with:

```html
    <label class="field-label" for="waveSelect">Wave</label>
    <select class="field-input" id="waveSelect" onchange="onWaveChange()">
      <option value="">Loading waves…</option>
    </select>
    <div style="display:flex; align-items:center; justify-content:space-between; margin-top:10px;">
      <span class="field-label" id="waveStatusLabel" style="margin:0;">—</span>
      <div>
        <button class="btn-primary" id="activateBtn" onclick="activateWave()" style="display:none; width:auto; margin:0; padding:10px 16px; font-size:12px;">ACTIVATE</button>
        <button class="btn-primary" id="forceCompleteBtn" onclick="forceCompleteWave()" style="display:none; width:auto; margin:0; padding:10px 16px; font-size:12px; background:#7a1a00;">FORCE COMPLETE</button>
      </div>
    </div>
```

- [ ] **Step 2: Pass `zone` to the waves-open fetch and track wave status**

Find `loadWaves()`:

```javascript
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
```

Replace with:

```javascript
let openWaves = [];

async function loadWaves() {
  const sel = document.getElementById('waveSelect');
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=waves_open&zone=${encodeURIComponent(judge.assignment)}`);
    const data = await res.json();
    openWaves = data.waves || [];
    if (!openWaves.length) {
      sel.innerHTML = '<option value="">No open waves for this zone — check Waves sheet</option>';
      updateWaveStatusUI();
      return;
    }
    sel.innerHTML = openWaves.map(w => `<option value="${w.wave_num}">Wave ${w.wave_num} (${w.status})</option>`).join('');
    updateWaveStatusUI();
    await loadCheckedInList();
  } catch {
    sel.innerHTML = '<option value="">Failed to load waves</option>';
  }
}

function updateWaveStatusUI() {
  const wave = document.getElementById('waveSelect').value;
  const label = document.getElementById('waveStatusLabel');
  const activateBtn = document.getElementById('activateBtn');
  const forceBtn = document.getElementById('forceCompleteBtn');
  const w = openWaves.find(x => String(x.wave_num) === String(wave));

  if (!w) {
    label.textContent = '—';
    activateBtn.style.display = 'none';
    forceBtn.style.display = 'none';
    return;
  }
  label.textContent = `STATUS: ${w.status.toUpperCase()}`;
  activateBtn.style.display = w.status === 'Draft' ? 'inline-block' : 'none';
  forceBtn.style.display = w.status === 'Active' ? 'inline-block' : 'none';
}
```

- [ ] **Step 3: Update `onWaveChange()` and add `activateWave()`/`forceCompleteWave()`**

Find:

```javascript
function onWaveChange() {
  loadCheckedInList();
}
```

Replace with:

```javascript
function onWaveChange() {
  updateWaveStatusUI();
  loadCheckedInList();
}

async function activateWave() {
  const wave = document.getElementById('waveSelect').value;
  const msg = document.getElementById('checkinMsg');
  if (!wave) return;
  document.getElementById('activateBtn').disabled = true;
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'checkin_activate_wave', pin, wave }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed');
    msg.textContent = `Wave ${wave} is now Active for Zone ${judge.assignment}.`;
    msg.className = 'msg ok';
    await loadWaves();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg err';
  }
  document.getElementById('activateBtn').disabled = false;
}

async function forceCompleteWave() {
  const wave = document.getElementById('waveSelect').value;
  const msg = document.getElementById('checkinMsg');
  if (!wave) return;
  if (!confirm(`Force Wave ${wave} to Complete for Zone ${judge.assignment}, even if not everyone's scored?`)) return;
  document.getElementById('forceCompleteBtn').disabled = true;
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'checkin_complete_wave', pin, wave }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed');
    msg.textContent = `Wave ${wave} marked Complete for Zone ${judge.assignment}.`;
    msg.className = 'msg ok';
    await loadWaves();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg err';
  }
  document.getElementById('forceCompleteBtn').disabled = false;
}
```

- [ ] **Step 4: Remove the Waves section from `admin/index.html`**

Find this block:

```html
  <div style="margin-top:32px;">
    <h3 style="font-size:12px; letter-spacing:2px; margin-bottom:10px;">BATTLE 1 — WAVES</h3>
    <button class="btn-secondary" onclick="loadWavesOverview()" style="margin-bottom:12px;">REFRESH WAVES</button>
    <div id="wavesOverview"></div>
  </div>
</div>
```

Replace with just:

```html
</div>
```

Find and delete this entire block from the `<script>` section:

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

```bash
grep -n "wavesOverview\|loadWavesOverview\|admin_waves_overview\|admin_activate_wave\|admin_complete_wave" admin/index.html
```

Expected: no output. Confirm `admin/index.html` still has exactly its
original three action cards (Clear Scores, Release Waves, Rebuild
Leaderboard) and nothing else. Confirm every new element id referenced in
`judge/checkin.html`'s script (`waveStatusLabel`, `activateBtn`,
`forceCompleteBtn`) has a matching HTML element.

- [ ] **Step 6: Commit**

```bash
git add judge/checkin.html admin/index.html
git commit -m "$(cat <<'EOF'
feat: check-in owns wave activate/force-complete, revert admin Waves UI

judge/checkin.html now shows the selected wave's status for this zone
and lets check-in staff Activate it or Force Complete it — the same
PIN that owns attendance now owns the whole zone's wave lifecycle.
admin/index.html reverts to its original three actions (Clear Scores,
Release Waves, Rebuild Leaderboard).
EOF
)"
```

---

### Task 3: Deploy and live re-verification

**Files:** none (migration function, deployment, and manual testing only)

**Interfaces:** none — exercises what Tasks 1-2 built.

- [ ] **Step 1: Ask the organizer to redeploy the backend**

Paste the updated `backend/Code.gs` into the Apps Script editor and
redeploy: **Deploy → Manage deployments → edit the existing deployment →
New version**.

- [ ] **Step 2: Run the migration once**

From the Apps Script editor, run `migrateWavesToPerZone()` once. **This is
destructive** — it clears the current `Waves` sheet (which only has test
Draft/Active rows from earlier testing, not real event data) and rebuilds
it with one Draft row per (wave, zone). Confirm in the execution log that
it completed, and open the `Waves` sheet to confirm it now has a `zone`
column with 4× as many rows as before, all Draft.

- [ ] **Step 3: Ask whether to push the frontend changes**

Ask: "Ready to push `judge/checkin.html` and `admin/index.html`?" Only
push after an explicit yes.

- [ ] **Step 4: Live walkthrough**

1. Log in with one zone's check-in PIN. Confirm the wave dropdown now
   only shows waves for THIS zone, and selecting a Draft wave shows an
   ACTIVATE button.
2. Tap ACTIVATE. Confirm the status label updates to Active and an
   ACTIVATE button no longer shows (FORCE COMPLETE shows instead).
3. Confirm `admin/index.html` no longer has any Waves section at all —
   just the original three actions.
4. Log in as a station judge in that SAME zone — confirm the roster shows
   the checked-in athletes (this directly re-tests the earlier "Erg Bike
   showed no names" report under the corrected per-zone model).
5. Log in as a check-in PIN for a DIFFERENT zone and confirm its wave
   list/status is completely independent — activating a wave in Zone A
   must have no effect on Zone B's wave state at all.
6. Score that zone's full roster across all 7 stations, confirm the wave
   auto-completes for THAT ZONE ONLY (check the Waves sheet — other
   zones' rows for the same wave number should be unaffected).
7. Test FORCE COMPLETE on an Active wave with someone still unscored,
   confirm it flips to Complete immediately regardless.

- [ ] **Step 5: Report back**

Summarize what worked and what didn't (exact screen state, sheet row
values) so any follow-up issue can be root-caused the same way as before.
