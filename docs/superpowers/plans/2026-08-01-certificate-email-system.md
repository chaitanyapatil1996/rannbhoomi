# Certificate Email System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local Node script that emails every Solo athlete and Gym Battle
team their real certificate (rendered from the live site) plus a short
personalized note, run once after the event.

**Architecture:** Two new files at the repo root — `send_certificates_lib.js`
(pure gap-analysis/copy functions, unit-tested) and `send_certificates.js`
(the CLI entrypoint: fetches the live public API, drives headless Chrome to
render each certificate via the site's own `renderCertificate`/
`renderGymCertificate` functions, emails the PDF via nodemailer). No
backend/Code.gs changes.

**Tech Stack:** Node.js (built-in `fetch` and `node:test`), Puppeteer
(already a project dependency), nodemailer (new dependency).

## Global Constraints

- **No backend changes.** This script only reads from the existing public
  API (`action=scores`, `action=athlete`, `action=gym_scores`) and never
  writes to the spreadsheet. Do not modify `backend/Code.gs`.
- **Never send real email during implementation/testing.** Every
  verification step in this plan uses `--dry-run` (generates PDFs, sends
  nothing) or is a pure unit test. Real sends only happen when the
  organizer runs the finished script themselves with `GMAIL_APP_PASSWORD`
  set and no `--dry-run` flag — that is explicitly **not** part of this
  plan's execution.
- **Sender address:** `frontline@rannbhoomi.com` (hardcoded constant,
  matches the organizer's confirmed choice).
- **Reuse the live certificate exactly** — render via Puppeteer calling the
  site's own `renderCertificate(data)` / `renderGymCertificate(team)`
  functions and the existing `@media print` CSS
  (`scores/index.html:278-283`). Never hand-build a second certificate
  template.
- **Station point multipliers** (Battle 1, used only for the gap-analysis
  "weakest station" callout — matches the FAQ and `Scoring Table` sheet
  exactly):
  `s1_burpees: 10, s2_bike: 1, s3_lunges: 10, s4_pushups: 5, s5_sprint: 20,
  s6_inchworms: 10, s7_squats: 5`.
- **Email lookup:** a Solo athlete's email comes from `getAthlete()`'s
  response — `record.athlete.email` — **not** from the Battle 1 leaderboard
  row (`Round1_Scores`/`Leaderboard_Cache_R1` has no `email` column; only
  the `Athletes` sheet does, and `getAthlete()` already surfaces it). A Gym
  team's email comes from `team.email` directly on the `action=gym_scores`
  row (flows through automatically once the organizer adds the column —
  `gymScores()` in `backend/Code.gs` maps every sheet column generically,
  no backend code change needed for this).
- **Live constants** (copy verbatim, do not re-derive):
  `APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxELQsXchGNJXNDyETPXuFOLNKXNNL48OZcG0IRtS-eohXx9gOSP-ZFC1J0PHl-QjNG/exec'`,
  `SITE_URL = 'https://rannbhoomi.com/scores/'`.

---

### Task 1: Dependencies and gitignore

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `nodemailer` available as `require('nodemailer')` for Task 3.

- [ ] **Step 1: Install nodemailer**

Run: `npm install nodemailer`

Expected: `package.json`'s `dependencies` gains `"nodemailer": "^..."` and
`node_modules/nodemailer` exists. `puppeteer` is already present — do not
reinstall it.

- [ ] **Step 2: Add gitignore entries for generated output**

Edit `.gitignore`, add a new section (anywhere after the existing
`# Auto-generated Puppeteer / debug screenshots` block):

```
# Certificate email system — generated PDFs and per-run logs
certificates/
certificate_log_*.txt
```

- [ ] **Step 3: Verify and commit**

Run: `git status --short`
Expected: `package.json`, `package-lock.json`, and `.gitignore` show as
modified. `node_modules/` does not appear (already gitignored).

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: add nodemailer dependency for certificate email system"
```

---

### Task 2: Gap-analysis and email-copy library (pure functions, unit-tested)

**Files:**
- Create: `send_certificates_lib.js`
- Test: `send_certificates_lib.test.js`

**Interfaces:**
- Produces (consumed by Task 3):
  - `STATION_POINTS: { [stationKey]: number }`
  - `STATION_LABELS: { [stationKey]: string }`
  - `computeGapAnalysis(athleteRow, board) → { rank, total, topTotal, cutoffTotal, pointGap, worstStationLabel, worstStationDeficit } | null`
    — `athleteRow` and every entry in `board` are Battle 1 leaderboard rows
    (shape: `{ athlete_id, name, category, gender_rank, total, s1_burpees, s2_bike, s3_lunges, s4_pushups, s5_sprint, s6_inchworms, s7_squats }`,
    all values from `action=scores&round=1`). `board` is every row sharing
    `athleteRow.category`. Returns `null` when the category has no rank-30
    entry (fewer than 30 finishers — no real cutoff to compare against).
  - `buildSoloEmail(athleteRow, athleteRecord, board) → { subject, text }`
    — `athleteRecord` is the full `action=athlete` response shape
    `{ athlete: {...}, rounds: { '1'?: {...}, '2'?: {...}, '3'?: {...} } }`.
  - `buildGymEmail(team) → { subject, text }` — `team` is one row from
    `action=gym_scores` (`{ rank, zone, team_name, front_squats,
    devils_press, rower, box_jump, team_score, email }`).

- [ ] **Step 1: Write the failing tests**

Create `send_certificates_lib.test.js`:

```js
const test   = require('node:test');
const assert = require('node:assert/strict');
const {
  computeGapAnalysis, buildSoloEmail, buildGymEmail,
} = require('./send_certificates_lib');

function makeRow(overrides) {
  return {
    athlete_id: 'RB000', name: 'Test Athlete', category: 'male',
    s1_burpees: 20, s2_bike: 200, s3_lunges: 20, s4_pushups: 20,
    s5_sprint: 5, s6_inchworms: 20, s7_squats: 20,
    total: 500, gender_rank: 50,
    ...overrides,
  };
}

test('computeGapAnalysis returns null when the category has no 30th place', () => {
  const board = [
    makeRow({ gender_rank: 1, total: 900 }),
    makeRow({ gender_rank: 2, total: 800 }),
  ];
  assert.equal(computeGapAnalysis(board[1], board), null);
});

test('computeGapAnalysis computes point gap and worst station vs. the cutoff', () => {
  const top     = makeRow({ gender_rank: 1,  total: 900, s2_bike: 300 });
  const cutoff  = makeRow({ gender_rank: 30, total: 500, s2_bike: 220, s1_burpees: 25 });
  const athlete = makeRow({ gender_rank: 45, total: 460, s2_bike: 150, s1_burpees: 25 });
  const board   = [top, cutoff, athlete];

  const result = computeGapAnalysis(athlete, board);
  assert.equal(result.pointGap, 40);        // 500 - 460
  assert.equal(result.cutoffTotal, 500);
  assert.equal(result.topTotal, 900);
  // s2_bike deficit: (220-150)*1 = 70; s1_burpees deficit: (25-25)*10 = 0 — bike wins
  assert.equal(result.worstStationLabel, 'Erg Bike');
  assert.equal(result.worstStationDeficit, 70);
});

test('buildSoloEmail congratulates a finalist distinctly from a semi-finalist', () => {
  const athleteRow = makeRow({ name: 'Finalist Fox', gender_rank: 3 });
  const record = { athlete: { name: 'Finalist Fox' }, rounds: { '1': {}, '2': {}, '3': {} } };
  const { subject, text } = buildSoloEmail(athleteRow, record, [athleteRow]);
  assert.match(subject, /Finalist Fox/);
  assert.match(text, /Battle 3 — The Finals/);
});

test('buildSoloEmail includes gap analysis for non-qualifiers past rank 30', () => {
  const cutoff  = makeRow({ gender_rank: 30, total: 500 });
  const athlete = makeRow({ name: 'Eliminated Eve', gender_rank: 45, total: 460 });
  const board   = [makeRow({ gender_rank: 1, total: 900 }), cutoff, athlete];
  const record  = { athlete: { name: 'Eliminated Eve' }, rounds: { '1': {} } };
  const { text } = buildSoloEmail(athlete, record, board);
  assert.match(text, /rank 45/);
  assert.match(text, /40 points from the qualifying line/);
});

test('buildSoloEmail skips gap analysis for a rank <=30 athlete with no Battle 2 record', () => {
  // e.g. a DNS/withdrawal — qualified by rank but never started Battle 2.
  const cutoff  = makeRow({ gender_rank: 30, total: 500 });
  const athlete = makeRow({ name: 'Withdrew Wendy', gender_rank: 12, total: 650 });
  const board   = [makeRow({ gender_rank: 1, total: 900 }), cutoff, athlete];
  const record  = { athlete: { name: 'Withdrew Wendy' }, rounds: { '1': {} } };
  const { text } = buildSoloEmail(athlete, record, board);
  assert.doesNotMatch(text, /qualifying line/);
  assert.match(text, /Thank you for battling/);
});

test('buildGymEmail names the team and its score', () => {
  const team = { team_name: 'Iron Pit CrossFit', rank: 2, team_score: 812 };
  const { subject, text } = buildGymEmail(team);
  assert.match(subject, /Iron Pit CrossFit/);
  assert.match(text, /rank 2/);
  assert.match(text, /812/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test send_certificates_lib.test.js`
Expected: FAIL with `Cannot find module './send_certificates_lib'` (file
doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `send_certificates_lib.js`:

```js
// send_certificates_lib.js
// Pure functions for the certificate-email gap analysis and copy — no
// network, filesystem, or Puppeteer here, so these are unit-testable
// directly (see send_certificates_lib.test.js). send_certificates.js is
// the only consumer.

const STATION_POINTS = {
  s1_burpees:   10,
  s2_bike:      1,
  s3_lunges:    10,
  s4_pushups:   5,
  s5_sprint:    20,
  s6_inchworms: 10,
  s7_squats:    5,
};

const STATION_LABELS = {
  s1_burpees:   'Static Burpees',
  s2_bike:      'Erg Bike',
  s3_lunges:    'Deadlift',
  s4_pushups:   'Hand Release Push Ups',
  s5_sprint:    'Sprint with Weights',
  s6_inchworms: 'Inch Worms',
  s7_squats:    'DB Front Squats',
};

// athlete: one Battle 1 leaderboard row. board: every row sharing that
// athlete's category. Returns null when the category has no real 30th
// place to compare against (fewer than 30 finishers).
function computeGapAnalysis(athlete, board) {
  const top    = board.find(r => Number(r.gender_rank) === 1);
  const cutoff = board.find(r => Number(r.gender_rank) === 30);
  if (!top || !cutoff) return null;

  const pointGap = Number(cutoff.total) - Number(athlete.total);

  let worstStation = null;
  let worstDeficit  = -Infinity;
  for (const key of Object.keys(STATION_POINTS)) {
    const athleteVal = Number(athlete[key]) || 0;
    const cutoffVal  = Number(cutoff[key]) || 0;
    const deficit    = (cutoffVal - athleteVal) * STATION_POINTS[key];
    if (deficit > worstDeficit) {
      worstDeficit = deficit;
      worstStation = key;
    }
  }

  return {
    rank:                Number(athlete.gender_rank),
    total:                Number(athlete.total),
    topTotal:             Number(top.total),
    cutoffTotal:          Number(cutoff.total),
    pointGap,
    worstStationLabel:    STATION_LABELS[worstStation],
    worstStationDeficit:  Math.round(worstDeficit),
  };
}

// athleteRow: the athlete's Battle 1 leaderboard row (name, gender_rank, total, category, stations).
// athleteRecord: the full `action=athlete` response — { athlete, rounds }.
// board: every Battle 1 row sharing athleteRow.category (for gap analysis).
function buildSoloEmail(athleteRow, athleteRecord, board) {
  const name    = athleteRow.name;
  const rounds  = (athleteRecord && athleteRecord.rounds) || {};
  const advanced      = !!rounds['2'];
  const reachedFinals = !!rounds['3'];
  const subject = `Your Rannbhoomi 2026 Certificate — ${name}`;

  let body;
  if (reachedFinals) {
    body = `Hi ${name},\n\n`
      + `You made it all the way to Battle 3 — The Finals at Rannbhoomi 2026, one of only 20 athletes (10 male, 10 female) to get there. That's a serious achievement.\n\n`
      + `Your full performance certificate is attached, station by station across every Battle you fought through.\n\n`;
  } else if (advanced) {
    body = `Hi ${name},\n\n`
      + `You battled through Battle 1 — Qualifiers and advanced to Battle 2 — Semi-Finals at Rannbhoomi 2026 — the top tier of everyone who competed.\n\n`
      + `Your full performance certificate is attached.\n\n`;
  } else {
    const gap = Number(athleteRow.gender_rank) > 30 ? computeGapAnalysis(athleteRow, board) : null;
    if (gap) {
      body = `Hi ${name},\n\n`
        + `Thank you for battling at Rannbhoomi 2026. You finished rank ${gap.rank} in Battle 1 — Qualifiers with ${gap.total} points.\n\n`
        + `You were ${gap.pointGap} points from the qualifying line for Battle 2 (30th place finished on ${gap.cutoffTotal} points — the top qualifier in your category finished on ${gap.topTotal}). `
        + `Your biggest opportunity next time: ${gap.worstStationLabel}, where you gave up roughly ${gap.worstStationDeficit} points versus the qualifying line.\n\n`
        + `Your certificate is attached — come back stronger for Season 2.\n\n`;
    } else {
      body = `Hi ${name},\n\n`
        + `Thank you for battling at Rannbhoomi 2026. Your certificate is attached.\n\n`;
    }
  }

  body += `Built by Athletes. For Athletes.\nTeam Rannbhoomi`;
  return { subject, text: body };
}

function buildGymEmail(team) {
  const subject = `Your Rannbhoomi 2026 Gym Battle Certificate — ${team.team_name}`;
  const text = `Hi ${team.team_name},\n\n`
    + `Your Gym Battle result at Rannbhoomi 2026: rank ${team.rank}, team score ${team.team_score}.\n\n`
    + `Your full certificate is attached.\n\n`
    + `Built by Athletes. For Athletes.\nTeam Rannbhoomi`;
  return { subject, text };
}

module.exports = {
  STATION_POINTS, STATION_LABELS,
  computeGapAnalysis, buildSoloEmail, buildGymEmail,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test send_certificates_lib.test.js`
Expected: PASS, 6/6 tests.

- [ ] **Step 5: Commit**

```bash
git add send_certificates_lib.js send_certificates_lib.test.js
git commit -m "feat: gap-analysis and email-copy library for certificate emails"
```

---

### Task 3: CLI script — fetch, render, send, log

**Files:**
- Create: `send_certificates.js`

**Interfaces:**
- Consumes: everything exported by `send_certificates_lib.js` (Task 2).
- Produces: nothing consumed elsewhere — this is the top-level entrypoint
  the organizer runs directly.

- [ ] **Step 1: Write the script**

Create `send_certificates.js`:

```js
// send_certificates.js
// Emails every Solo athlete and Gym Battle team their real Rannbhoomi
// certificate (rendered from the live site, not a duplicate template) plus
// a short personalized note. Run once, after the event, when all Battles
// are scored and released.
//
// Usage:
//   GMAIL_APP_PASSWORD=xxxx node send_certificates.js --dry-run
//   GMAIL_APP_PASSWORD=xxxx node send_certificates.js --test-to=you@example.com
//   GMAIL_APP_PASSWORD=xxxx node send_certificates.js
//
// Setup:
//   1. Add an `email` column (last column) to the Gym_Results sheet — one
//      email per team row. Teams without one are skipped, not an error.
//   2. Generate a Gmail App Password for frontline@rannbhoomi.com
//      (Google Account → Security → App Passwords) and set it as
//      GMAIL_APP_PASSWORD before running for real.

const puppeteer  = require('puppeteer');
const nodemailer = require('nodemailer');
const fs         = require('fs');
const path       = require('path');
const { buildSoloEmail, buildGymEmail } = require('./send_certificates_lib');

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxELQsXchGNJXNDyETPXuFOLNKXNNL48OZcG0IRtS-eohXx9gOSP-ZFC1J0PHl-QjNG/exec';
const SITE_URL        = 'https://rannbhoomi.com/scores/';
const FROM_EMAIL       = 'frontline@rannbhoomi.com';
const GMAIL_PASS       = process.env.GMAIL_APP_PASSWORD;
const OUTPUT_DIR       = path.join(__dirname, 'certificates');
const DRY_RUN          = process.argv.includes('--dry-run');
const TEST_TO          = (process.argv.find(a => a.startsWith('--test-to=')) || '').split('=')[1];
const SEND_DELAY_MS    = 600;

function safeFileName(name) {
  return String(name).replace(/[^a-zA-Z0-9 ]/g, '').trim();
}

async function fetchJSON(url) {
  const res = await fetch(url);
  return res.json();
}

// ─── Certificate rendering (reuses the live page's own render functions,
// so the PDF can never drift from what athletes see on the site) ────────────

async function renderSoloCertificatePDF(browser, athleteRecord, outPath) {
  const page = await browser.newPage();
  try {
    await page.goto(SITE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate((data) => {
      renderCertificate(data);
      document.getElementById('certOverlay').classList.add('open');
    }, athleteRecord);
    await page.emulateMediaType('print');
    await page.pdf({ path: outPath, format: 'A4', printBackground: true });
  } finally {
    await page.close();
  }
}

async function renderGymCertificatePDF(browser, team, outPath) {
  const page = await browser.newPage();
  try {
    await page.goto(SITE_URL, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate((teamData) => {
      renderGymCertificate(teamData);
      document.getElementById('certOverlay').classList.add('open');
    }, team);
    await page.emulateMediaType('print');
    await page.pdf({ path: outPath, format: 'A4', printBackground: true });
  } finally {
    await page.close();
  }
}

// ─── Email ───────────────────────────────────────────────────────────────────

function makeTransporter() {
  if (DRY_RUN) return null;
  if (!GMAIL_PASS) {
    console.error('Set GMAIL_APP_PASSWORD environment variable, or use --dry-run to skip email.');
    process.exit(1);
  }
  return nodemailer.createTransport({ service: 'gmail', auth: { user: FROM_EMAIL, pass: GMAIL_PASS } });
}

async function sendCertificateEmail(transporter, { to, subject, text, pdfPath, fileName }) {
  await transporter.sendMail({
    from: `"Rannbhoomi" <${FROM_EMAIL}>`,
    to,
    subject,
    text,
    attachments: [{ filename: fileName, path: pdfPath }],
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('Fetching Battle 1 leaderboard...');
  const board1Data = await fetchJSON(`${APPS_SCRIPT_URL}?action=scores&round=1`);
  const board1 = board1Data.scores || [];
  console.log(`Found ${board1.length} Solo athletes in Battle 1.`);

  console.log('Fetching Gym Battle results...');
  const gymData  = await fetchJSON(`${APPS_SCRIPT_URL}?action=gym_scores`);
  const gymTeams = gymData.scores || [];
  console.log(`Found ${gymTeams.length} Gym Battle teams.`);

  const browser      = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const transporter  = makeTransporter();

  const logLines = [`Certificate Send Log — ${new Date().toLocaleString()}`, '─'.repeat(80)];
  let sent = 0, skipped = 0;

  // ── Solo athletes ──
  for (const row of board1) {
    const boardForCategory = board1.filter(r => r.category === row.category);
    process.stdout.write(`${row.name} (${row.category}, rank ${row.gender_rank}) ... `);

    const record = await fetchJSON(`${APPS_SCRIPT_URL}?action=athlete&athlete_id=${encodeURIComponent(row.athlete_id)}`);
    if (record.error || !record.athlete) {
      console.log('SKIP — could not load athlete record');
      logLines.push(`SKIPPED  | ${row.name.padEnd(30)} | Solo | no athlete record`);
      skipped++;
      continue;
    }

    const fileName = `${safeFileName(row.name)} - Certificate.pdf`;
    const pdfPath  = path.join(OUTPUT_DIR, fileName);
    await renderSoloCertificatePDF(browser, record, pdfPath);

    const { subject, text } = buildSoloEmail(row, record, boardForCategory);

    if (DRY_RUN) {
      console.log('PDF saved (dry run)');
      logLines.push(`DRY RUN  | ${row.name.padEnd(30)} | Solo | ${fileName}`);
      continue;
    }

    const sendTo = TEST_TO || record.athlete.email;
    if (!sendTo) {
      console.log('PDF saved — no email on record');
      logLines.push(`NO EMAIL | ${row.name.padEnd(30)} | Solo | ${fileName}`);
      skipped++;
      continue;
    }

    await sendCertificateEmail(transporter, { to: sendTo, subject, text, pdfPath, fileName });
    console.log(`sent to ${sendTo}`);
    logLines.push(`SENT     | ${row.name.padEnd(30)} | Solo | ${fileName} | -> ${sendTo}`);
    sent++;
    if (TEST_TO) break;
    await new Promise(r => setTimeout(r, SEND_DELAY_MS));
  }

  // ── Gym Battle teams (skipped entirely if --test-to already sent one above) ──
  if (!(TEST_TO && sent > 0)) {
    for (const team of gymTeams) {
      process.stdout.write(`${team.team_name} (Gym, rank ${team.rank}) ... `);

      const fileName = `${safeFileName(team.team_name)} - Certificate.pdf`;
      const pdfPath  = path.join(OUTPUT_DIR, fileName);
      await renderGymCertificatePDF(browser, team, pdfPath);

      const { subject, text } = buildGymEmail(team);

      if (DRY_RUN) {
        console.log('PDF saved (dry run)');
        logLines.push(`DRY RUN  | ${team.team_name.padEnd(30)} | Gym  | ${fileName}`);
        continue;
      }

      const sendTo = TEST_TO || team.email;
      if (!sendTo) {
        console.log('PDF saved — no email on record');
        logLines.push(`NO EMAIL | ${team.team_name.padEnd(30)} | Gym  | ${fileName}`);
        skipped++;
        continue;
      }

      await sendCertificateEmail(transporter, { to: sendTo, subject, text, pdfPath, fileName });
      console.log(`sent to ${sendTo}`);
      logLines.push(`SENT     | ${team.team_name.padEnd(30)} | Gym  | ${fileName} | -> ${sendTo}`);
      sent++;
      if (TEST_TO) break;
      await new Promise(r => setTimeout(r, SEND_DELAY_MS));
    }
  }

  await browser.close();

  logLines.push('─'.repeat(80));
  logLines.push(`Total: ${sent} sent, ${skipped} skipped`);
  const logPath = path.join(__dirname, `certificate_log_${Date.now()}.txt`);
  fs.writeFileSync(logPath, logLines.join('\n'));

  console.log(`\nDone. ${sent} sent, ${skipped} skipped.`);
  console.log(`PDFs saved to: ${OUTPUT_DIR}`);
  console.log(`Log saved to:  ${logPath}`);
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Dry-run against the live site**

This project has no automated end-to-end test harness for Puppeteer/email
flows (verified manually throughout this codebase's history) — verify this
step by actually running it with `--dry-run`, which is always safe (no
email is ever sent, regardless of how much real data exists on the live
sheet).

Run: `node send_certificates.js --dry-run`

Expected:
- Prints `Found N Solo athletes in Battle 1.` and `Found M Gym Battle
  teams.` (N/M may be 0 if the sheets are empty — that's fine, it should
  still exit cleanly).
- If N or M > 0: a `certificates/` directory appears containing one PDF per
  athlete/team named `<Name> - Certificate.pdf`.
- A `certificate_log_<timestamp>.txt` file appears at the repo root, ending
  in `Total: 0 sent, 0 skipped` (dry run never increments `sent`, and only
  increments `skipped` for a record it couldn't load at all — not for the
  dry-run path itself).
- If any PDFs were generated: open one and confirm it visually matches the
  certificate a real athlete would see clicking "PRINT / SAVE PDF" on
  `rannbhoomi.com/scores` — golden shield, station breakdown, rank line.

- [ ] **Step 3: Commit**

```bash
git add send_certificates.js
git commit -m "feat: certificate-email CLI — fetch, render, send, log"
```

---

## Self-Review Notes (for whoever executes this plan)

- Task 2's tests are genuine assertions on real branching logic (gap-exists
  vs. no-cutoff vs. rank<=30-but-DNS), not placeholder checks.
- Task 3 has no unit test because it's pure I/O orchestration (network,
  headless Chrome, email) — the codebase's own convention for scripts like
  this (`take_screenshots_*.js`, `build_scoring_table_xlsx.js`) is manual
  verification, which Step 2's `--dry-run` run provides safely.
- Real email sending (no `--dry-run`, `GMAIL_APP_PASSWORD` set, no
  `--test-to`) is intentionally **not** a step in this plan — that's the
  organizer's manual go-ahead after they've reviewed the dry-run PDFs and
  ideally sent themselves one via `--test-to`.
