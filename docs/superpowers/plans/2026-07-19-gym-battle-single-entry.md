# Gym Battle Single-Entry (Front Squats) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the Front Squats judge enter all 4 Gym Battle stations' scores
for a rotation in one combined submit, instead of each of the 4 station
judges entering their own — one atomic backend write per rotation, and a
read-only view for the other 3 judges.

**Architecture:** One new backend action (`gym_submit_rotation`) replaces the
per-rotation use of `gym_add_score` + `gym_rotate` with a single locked
read-modify-write that updates all 4 station totals and advances the
rotation counter together. `judge/gym.html`'s scoring screen renders 4
station rows either as editable inputs (Front Squats judge) or read-only
totals (the other 3 judges), driven by the judge's `station` from PIN
lookup.

**Tech Stack:** Google Apps Script (`backend/Code.gs`), vanilla HTML/CSS/JS
(`judge/gym.html`), Google Sheets as the data store.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-19-gym-battle-single-entry-design.md`
  — read it before starting; this plan implements it section by section.
- **No automated test framework exists for this GAS backend or its judge
  UIs** (confirmed in the spec's own §5 and in `CLAUDE.md`). "Test" steps in
  this plan mean **manual verification** — via the Apps Script editor's
  execution log, and via exercising the live judge UI in a browser — not
  `pytest`/`jest`-style commands. This matches how every other fix in this
  project has been verified this session (e.g. the Battle 2 schema-migration
  fix).
- Do not touch `gymAddScore`, `gymRotate`, `gymStartTeam`, `_gymFindZoneRow`,
  or `gymZoneStatus` — they stay exactly as they are (spec: "What's staying
  as-is").
- `backend/Code.gs` changes require a manual redeploy by the organizer
  (paste into Apps Script editor → Deploy → Manage deployments → edit
  existing → **New version**, never "new deployment") before they take
  effect live. This plan does not perform that redeploy — it's a manual
  step for the organizer after each backend task.
- **Never `git push` without the user's explicit go-ahead each time** — this
  project's established rule (local commits are fine after each task, but
  ask before pushing so `judge/gym.html` doesn't go live on GitHub Pages
  before the organizer is ready to test it).

---

### Task 1: Backend — `gym_submit_rotation` action

**Files:**
- Modify: `backend/Code.gs:39-57` (the `doPost` dispatch table)
- Modify: `backend/Code.gs` (new function, placed directly after `gymRotate`,
  which currently ends around line 977)

**Interfaces:**
- Consumes: `_lookupJudge(pin)` (returns `{pin, battle, assignment, station,
  label}` or `null`), `_gymFindZoneRow(sheet, zone)` (returns 1-indexed row
  number or `null`), `GYM_STATIONS` (array of `[key, label]` pairs),
  `GYM_LIVE_SHEET`, `GYM_RESULTS_SHEET` constants — all defined earlier in
  `Code.gs`, unchanged.
- Produces: `gymSubmitRotation(body)` where `body = { pin, deltas: {
  front_squats, devils_press, rower, box_jump } }` (any key may be missing —
  treated as 0). Returns JSON:
  - Success, heat continues: `{ success: true, heat_complete: false,
    rotations: <int>, zone: { zone, team_name, front_squats, devils_press,
    rower, box_jump, rotations, status } }`
  - Success, 5th rotation (team done): `{ success: true, heat_complete:
    true, team_name, team_score: <int>, zone: <same shape, reset to idle> }`
  - Error: `{ error: '<message>' }`
  - This `zone` object shape is **identical** to what `gymZoneStatus`
    already returns as its `zone` field — Task 2's frontend reuses one
    render function for both.

- [ ] **Step 1: Add the `gymSubmitRotation` function**

Open `backend/Code.gs`. Find `gymRotate` (currently lines 945-977) and add
this new function immediately after its closing `}`:

```javascript
// Front Squats judge submits all 4 stations' deltas for one rotation in a
// single atomic write, then advances the rotation counter — replaces 4
// separate gym_add_score calls + a separate gym_rotate call with one locked
// read-modify-write, so a dropped connection can never leave some stations
// updated and others not (same failure mode Battle 2 hit earlier today).
function gymSubmitRotation(body) {
  const { pin, deltas } = body;
  const judge = _lookupJudge(pin);
  if (!judge || String(judge.battle) !== 'gym') return jsonResponse({ error: 'Invalid PIN' });
  if (judge.station !== 'front_squats') return jsonResponse({ error: 'Only the Front Squats judge can submit a rotation' });

  const lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch (e) { return jsonResponse({ error: 'Server busy — please retry' }); }
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(GYM_LIVE_SHEET);
    const rowIdx = _gymFindZoneRow(sheet, judge.assignment);
    if (!rowIdx) return jsonResponse({ error: 'Zone not found: ' + judge.assignment });

    const headers = sheet.getRange(1, 1, 1, 8).getValues()[0];
    const row = sheet.getRange(rowIdx, 1, 1, 8).getValues()[0];

    GYM_STATIONS.forEach(([key]) => {
      const col = headers.indexOf(key);
      if (col === -1) return;
      const delta = Number(deltas && deltas[key]) || 0;
      row[col] = (Number(row[col]) || 0) + delta;
    });

    const rotCol = headers.indexOf('rotations');
    const rotations = (Number(row[rotCol]) || 0) + 1;
    row[rotCol] = rotations;

    const toZoneState = (r) => { const z = {}; headers.forEach((h, i) => { z[h] = r[i]; }); return z; };

    if (rotations >= 5) {
      const [zoneId, team_name, fs, dp, rw, bj] = row;
      const teamScore = Number(fs) + Number(dp) + Number(rw) + Number(bj);
      const results = ss.getSheetByName(GYM_RESULTS_SHEET);
      results.appendRow([zoneId, team_name, fs, dp, rw, bj, teamScore, new Date().toISOString()]);
      const resetRow = [zoneId, '', 0, 0, 0, 0, 0, 'idle'];
      sheet.getRange(rowIdx, 1, 1, 8).setValues([resetRow]);
      return jsonResponse({ success: true, heat_complete: true, team_name, team_score: teamScore, zone: toZoneState(resetRow) });
    }

    sheet.getRange(rowIdx, 1, 1, 8).setValues([row]);
    return jsonResponse({ success: true, heat_complete: false, rotations, zone: toZoneState(row) });
  } finally {
    lock.releaseLock();
  }
}
```

- [ ] **Step 2: Register the action in `doPost`**

Find this line in `doPost` (around line 54):

```javascript
  if (action === 'gym_rotate')           return gymRotate(body);
```

Add directly after it:

```javascript
  if (action === 'gym_submit_rotation')  return gymSubmitRotation(body);
```

- [ ] **Step 3: Manual verification (no automated test framework — see Global Constraints)**

Read through `gymSubmitRotation` once more against this checklist (this is
the "test" for this task — a careful code review, since GAS can't be
executed from this local environment):

- Confirm `GYM_STATIONS` keys (`front_squats`, `devils_press`, `rower`,
  `box_jump`) match the column names used in `headers.indexOf(key)` — they
  do, both come from the same `Gym_Live` schema set up by `setupGymSheets()`.
- Confirm the lock is released in every path (it is — single `try/finally`
  wraps both the early-return-on-rotation-5 branch and the normal branch).
- Confirm a missing/garbage `deltas` value can't throw — `Number(deltas &&
  deltas[key]) || 0` degrades to `0` for `undefined`, `null`, `''`, or
  non-numeric input.
- This task's real verification happens live at the end of Task 3, once the
  frontend can actually call this endpoint.

- [ ] **Step 4: Commit**

```bash
git add backend/Code.gs
git commit -m "$(cat <<'EOF'
feat: add gym_submit_rotation for single-entry Gym Battle scoring

Front Squats judge will submit all 4 stations' deltas for a rotation
in one atomic locked write instead of 4 separate gym_add_score calls
plus a separate gym_rotate call, per
docs/superpowers/specs/2026-07-19-gym-battle-single-entry-design.md.
EOF
)"
```

---

### Task 2: Frontend — `judge/gym.html` scoring screen redesign

**Files:**
- Modify: `judge/gym.html` (CSS block, the `#scoreScreen` HTML, and the
  `<script>` block)

**Interfaces:**
- Consumes: `gym_submit_rotation` and `gym_zone_status` (Task 1's contract
  above — the `zone` object shape).
- Produces: nothing consumed by other tasks — this is the last code task.

- [ ] **Step 1: Replace the score-screen CSS**

In the `<style>` block, find these rules (used only by the old single-station
layout):

```css
.station-name { font-size:13px; letter-spacing:3px; opacity:0.85; font-weight:700; margin-bottom:2px; }
.station-total { font-family:'Bebas Neue',sans-serif; font-size:56px; color:var(--crimson); text-align:center; margin:14px 0 4px; }
.station-total-label { text-align:center; font-size:9px; letter-spacing:3px; opacity:0.7; margin-bottom:20px; }

.add-row { display:flex; gap:10px; }
.add-input {
  flex:1; padding:18px; text-align:center; border:2px solid var(--border);
  background:rgba(214,185,122,0.4); font-family:'Bebas Neue',sans-serif; font-size:32px; color:var(--crimson);
  outline:none; -webkit-appearance:none; border-radius:0;
}
.add-btn {
  padding:0 26px; background:var(--crimson); color:var(--gold);
  font-family:'Bebas Neue',sans-serif; font-size:16px; letter-spacing:3px; border:none; cursor:pointer;
}
.add-btn:disabled { opacity:.35; cursor:not-allowed; }
```

Delete them, and add this in their place (a 4-row station grid, each row
optionally holding an input — same visual language as `judge/battle2.html`'s
`.station-row`):

```css
.stations { display:flex; flex-direction:column; gap:8px; margin:20px 0; }
.station-row { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border:1px solid var(--border); background:rgba(214,185,122,0.3); gap:10px; }
.station-row .st-name { font-size:12px; letter-spacing:1px; flex:1; }
.station-row .st-name .st-unit { display:block; font-size:9px; opacity:0.65; margin-top:2px; letter-spacing:0.5px; }
.station-row .st-total { font-family:'Bebas Neue',sans-serif; font-size:20px; color:var(--crimson); min-width:56px; text-align:right; }
.station-row .st-input {
  width:64px; padding:10px; text-align:center; border:2px solid var(--border);
  background:rgba(214,185,122,0.5); font-family:'Bebas Neue',sans-serif; font-size:18px; color:var(--crimson);
  outline:none; -webkit-appearance:none; border-radius:0;
}
```

- [ ] **Step 2: Replace the score-screen HTML**

Find this block:

```html
    <div class="station-name" id="scoreStationName" style="text-align:center;">—</div>
    <div class="station-total" id="scoreStationTotal">0</div>
    <div class="station-total-label" id="scoreStationUnit">POINTS SO FAR</div>

    <div class="add-row">
      <input class="add-input" type="number" id="addValue" placeholder="0" min="0" step="1" inputmode="numeric">
      <button class="add-btn" onclick="addScore()" id="addBtn">ADD</button>
    </div>
    <div class="msg" id="scoreMsg"></div>

    <button class="rotate-btn" id="rotateBtn" onclick="rotate()" style="display:none;">KB DROPPED — ROTATE</button>
```

Replace it with:

```html
    <div class="stations" id="stationsList"></div>

    <div class="msg" id="scoreMsg"></div>

    <button class="rotate-btn" id="submitRotationBtn" onclick="submitRotation()" style="display:none;">SUBMIT ROTATION</button>
```

(The `scoreZoneLabel`/`scoreTeamName`/`rotationBadge` header above this
block, and the `LOG OUT` button below it, are unchanged — only the middle
section between the `<div class="rule">` and `LOG OUT` changes.)

- [ ] **Step 3: Replace the script block's state, rendering, and actions**

Find this section (the `STATION_META` constant through the end of
`init()`'s try block, and the whole `renderZone`/`addScore`/`rotate`
functions):

```javascript
const STATION_META = {
  front_squats: { label: 'Front Squats',    unit: 'reps × 10 pts' },
  devils_press: { label: "Devil's Press",   unit: 'reps × 10 pts' },
  rower:        { label: 'Rower',           unit: 'metres × 1 pt' },
  box_jump:     { label: 'Burpee Box Jump', unit: 'reps × 10 pts' },
};

let judge = null;
let pin = null;
let pollTimer = null;
```

Replace with:

```javascript
const STATION_ORDER = ['front_squats', 'devils_press', 'rower', 'box_jump'];
const STATION_META = {
  front_squats: { label: 'Front Squats',    unit: 'reps × 10 pts' },
  devils_press: { label: "Devil's Press",   unit: 'reps × 10 pts' },
  rower:        { label: 'Rower',           unit: 'metres × 1 pt' },
  box_jump:     { label: 'Burpee Box Jump', unit: 'reps × 10 pts' },
};

let judge = null;
let pin = null;
let pollTimer = null;
let lastKnownRotations = 0;
```

Next, find this block inside `init()`:

```javascript
    const meta = STATION_META[judge.station] || { label: judge.station, unit: '' };
    document.getElementById('startTitle').textContent = `ZONE ${judge.assignment} — ${meta.label.toUpperCase()}`;
    document.getElementById('waitTitle').textContent   = `ZONE ${judge.assignment} — ${meta.label.toUpperCase()}`;
    document.getElementById('scoreZoneLabel').textContent = `Zone ${judge.assignment} — ${meta.label}`;
    document.getElementById('scoreStationName').textContent = meta.label.toUpperCase();
    document.getElementById('scoreStationUnit').textContent = meta.unit.toUpperCase();
    document.getElementById('rotateBtn').style.display = judge.station === 'front_squats' ? 'block' : 'none';
```

Replace with:

```javascript
    const meta = STATION_META[judge.station] || { label: judge.station, unit: '' };
    document.getElementById('startTitle').textContent = `ZONE ${judge.assignment} — ${meta.label.toUpperCase()}`;
    document.getElementById('waitTitle').textContent   = `ZONE ${judge.assignment} — ${meta.label.toUpperCase()}`;
    document.getElementById('scoreZoneLabel').textContent = `Zone ${judge.assignment} — ${meta.label}`;
    document.getElementById('submitRotationBtn').style.display = judge.station === 'front_squats' ? 'block' : 'none';
```

Now find `renderZone`, `addScore`, and `rotate` in full:

```javascript
function renderZone(zone) {
  const active = zone.status === 'active';

  if (!active) {
    if (judge.station === 'front_squats') {
      show('startTeamScreen');
    } else {
      show('waitingScreen');
    }
    return;
  }

  document.getElementById('scoreTeamName').textContent = zone.team_name || '—';
  document.getElementById('rotationBadge').textContent = `ROTATION ${zone.rotations} / 5`;
  document.getElementById('scoreStationTotal').textContent = zone[judge.station] !== undefined ? zone[judge.station] : 0;
  show('scoreScreen');
}
```

```javascript
async function addScore() {
  const val = document.getElementById('addValue').value;
  const btn = document.getElementById('addBtn');
  const msg = document.getElementById('scoreMsg');
  if (val === '' || isNaN(Number(val))) return;
  btn.disabled = true;
  msg.textContent = '';
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'gym_add_score', pin, delta: val }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed');
    document.getElementById('scoreStationTotal').textContent = data.total;
    document.getElementById('addValue').value = '';
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg err';
  }
  btn.disabled = false;
}

async function rotate() {
  const btn = document.getElementById('rotateBtn');
  const msg = document.getElementById('scoreMsg');
  btn.disabled = true;
  msg.textContent = '';
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'gym_rotate', pin }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed');
    if (data.heat_complete) {
      msg.textContent = `Team complete — score: ${data.team_score}`;
      msg.className = 'msg ok';
    }
    await pollZone();
  } catch (err) {
    msg.textContent = err.message;
    msg.className = 'msg err';
  }
  btn.disabled = false;
}
```

Replace all three functions above with:

```javascript
function renderZone(zone) {
  const active = zone.status === 'active';
  lastKnownRotations = Number(zone.rotations) || 0;

  if (!active) {
    if (judge.station === 'front_squats') {
      show('startTeamScreen');
    } else {
      show('waitingScreen');
    }
    return;
  }

  document.getElementById('scoreTeamName').textContent = zone.team_name || '—';
  document.getElementById('rotationBadge').textContent = `ROTATION ${zone.rotations} / 5`;

  const isFrontSquats = judge.station === 'front_squats';
  const list = document.getElementById('stationsList');
  list.innerHTML = STATION_ORDER.map(key => {
    const meta = STATION_META[key];
    const total = zone[key] !== undefined ? zone[key] : 0;
    return `<div class="station-row">
      <div class="st-name">${meta.label}<span class="st-unit">${meta.unit}</span></div>
      <div class="st-total">${total}</div>
      ${isFrontSquats ? `<input class="st-input" type="number" id="rot_${key}" placeholder="0" min="0" step="1" inputmode="numeric">` : ''}
    </div>`;
  }).join('');

  show('scoreScreen');
}

// Front Squats judge submits all 4 stations' values for this rotation in
// one call. gym_submit_rotation adds deltas (not idempotent), so a dropped
// connection after a successful write must NOT be resolved by blindly
// retrying — that would double-add scores that already saved. Instead,
// re-check the true rotation count/status before deciding whether to show
// an error or an "already saved" message.
async function submitRotation() {
  const btn = document.getElementById('submitRotationBtn');
  const msg = document.getElementById('scoreMsg');
  const expectedRotations = lastKnownRotations;

  const deltas = {};
  STATION_ORDER.forEach(key => {
    const el = document.getElementById('rot_' + key);
    deltas[key] = (el && el.value !== '') ? Number(el.value) || 0 : 0;
  });

  btn.disabled = true;
  msg.textContent = '';
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'gym_submit_rotation', pin, deltas }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed');

    if (data.heat_complete) {
      msg.textContent = `Team complete — score: ${data.team_score}`;
      msg.className = 'msg ok';
    }
    renderZone(data.zone);
  } catch (err) {
    let advanced = false;
    let zoneNow = null;
    try {
      const statusRes = await fetch(`${APPS_SCRIPT_URL}?action=gym_zone_status&zone=${encodeURIComponent(judge.assignment)}`);
      const statusData = await statusRes.json();
      zoneNow = statusData.zone || null;
      advanced = !zoneNow || zoneNow.status !== 'active' || Number(zoneNow.rotations) > expectedRotations;
    } catch {}

    if (advanced) {
      msg.textContent = 'Connection dropped, but this rotation already saved — re-synced below.';
      msg.className = 'msg ok';
      if (zoneNow) renderZone(zoneNow);
    } else {
      msg.textContent = err.message + ' — tap SUBMIT ROTATION again to retry';
      msg.className = 'msg err';
    }
  }
  btn.disabled = false;
}
```

- [ ] **Step 4: Manual verification (read-through — see Global Constraints)**

- Confirm `stationsList` is populated for **every** judge role (front squats
  gets inputs, the other 3 get the same rows without inputs) — the ternary
  in `renderZone` is the only branch point.
- Confirm `submitRotationBtn`'s `display` is set once in `init()` from
  `judge.station`, so non-front-squats judges never see it regardless of
  zone state.
- Confirm no remaining reference to `addScore`, `rotate`, `addValue`,
  `addBtn`, `rotateBtn`, `scoreStationTotal`, `scoreStationName`, or
  `scoreStationUnit` exists anywhere in the file:

```bash
grep -n "addScore\|rotate()\|addValue\|addBtn\|rotateBtn\|scoreStationTotal\|scoreStationName\|scoreStationUnit" judge/gym.html
```

Expected: no output (empty). If anything matches, it's dead code left over
from the old layout — remove it.

- [ ] **Step 5: Commit**

```bash
git add judge/gym.html
git commit -m "$(cat <<'EOF'
feat: Gym Battle single-entry scoring UI for Front Squats judge

Scoring screen now shows all 4 stations at once. Front Squats judge
enters all 4 deltas and taps SUBMIT ROTATION (one gym_submit_rotation
call); the other 3 judges see the same 4 rows read-only. Includes
resync-before-retry handling for dropped connections, matching the
pattern already used in judge/battle2.html.
EOF
)"
```

---

### Task 3: Deploy and live verification

**Files:** none (deployment + manual testing only)

**Interfaces:** none — this task only exercises what Tasks 1-2 built.

- [ ] **Step 1: Ask the organizer to redeploy the backend**

Tell the organizer to paste the updated `backend/Code.gs` into the Apps
Script editor and redeploy: **Deploy → Manage deployments → edit the
existing deployment → New version** (never "new deployment" — that changes
the URL).

- [ ] **Step 2: Ask the organizer whether to push `judge/gym.html`**

Per this project's standing rule, do not push without asking each time.
Ask: "Ready to push `judge/gym.html` to GitHub so it's live for testing?"
Only run `git push` after an explicit yes.

- [ ] **Step 3: Live walkthrough — happy path**

Have the organizer (or you, walking them through it):
1. Log in as the Front Squats judge for one zone (`judge/index.html?pin=<PIN>`).
2. Start a team via START WAVE.
3. Confirm the scoring screen shows all 4 station rows with input boxes and
   a SUBMIT ROTATION button.
4. Fill in 4 values, tap SUBMIT ROTATION.
5. Confirm: rotation badge advances to `ROTATION 1 / 5`, all 4 totals update
   to the entered values, and all 4 input boxes clear back to empty/0.
6. Log in as one of the other 3 PINs. Confirm: same 4 rows with the same
   totals, no input boxes, no SUBMIT ROTATION button.

- [ ] **Step 4: Live walkthrough — 5th rotation (heat complete)**

Repeat Step 3's submit 4 more times (5 total). On the 5th:
1. Confirm the message reads "Team complete — score: X" with the correct
   sum of all 4 station totals.
2. Confirm the Front Squats judge is returned to the START WAVE screen
   (zone reset to idle).
3. Open the `Gym_Results` sheet and confirm a new row was appended with the
   correct zone, team name, 4 station totals, and team score.
4. Open `Gym_Live` and confirm that zone's row reset to `team_name=''`,
   all 4 stations `0`, `rotations=0`, `status='idle'`.

- [ ] **Step 5: Live walkthrough — dropped-connection resync**

This is hard to force deliberately on a real network, so approximate it:
1. Start a new team, submit one rotation successfully.
2. Turn on airplane mode (or otherwise kill connectivity) right as you tap
   SUBMIT ROTATION on the *next* rotation with values filled in, then
   restore connectivity within a few seconds.
3. Confirm one of two outcomes, both correct: either the submit visibly
   fails and you can retry (values weren't saved), or you see "Connection
   dropped, but this rotation already saved" and the rotation count/totals
   already reflect the submit (values were saved, no need to retry). What
   must **not** happen: silently double-adding the same deltas if you tap
   SUBMIT ROTATION again after this message.

- [ ] **Step 6: Report back**

Summarize what worked and what didn't, in the same terms used earlier this
session when diagnosing the Battle 2 bug (exact button/screen state, sheet
row values) so any follow-up issue can be root-caused the same way.
