# Rannbhoomi Scoring System — Reference

**Read this first** if you're picking up scoring-system work in a new
session and need the full picture before making changes. This is a
**living document** — update it whenever a design decision changes,
unlike the dated files in `docs/superpowers/specs/` (those are immutable
historical records of *why* a specific redesign happened; this doc is
*current state*, kept in sync).

Multiple sessions across several days have worked on this codebase.
**Always run `git log --oneline -20 -- backend/Code.gs judge/ admin/
scores/` before trusting anything below** — this decays the moment
someone redesigns something and forgets to update it.

## How to use this doc

1. Skim the battle you're touching, below.
2. Check "Known issues / open items" for anything that might bite you.
3. If you're about to change a data model or a cross-battle pattern, read
   the relevant dated spec in `docs/superpowers/specs/` for the full
   reasoning — this doc summarizes, the specs justify.
4. **After any design change, update this file** — that's the whole point
   of it existing.

## Data model — every sheet, what it's for

| Sheet | Columns | Purpose |
|---|---|---|
| `Athletes` | `athlete_id, name, email, category, wave` | Master roster. `wave` is a **non-binding default/plan** — the real wave/zone assignment for Battle 1 comes from `Checkins`, not this column. No `zone` column exists here at all. |
| `Judges` | `pin, battle, assignment, station, label` | Every judge/check-in PIN. `battle` ∈ `'1','2','3','gym'`. `assignment` = zone letter (A-D) for Battle 1/Gym, lane (M1/M2/F1/F2) for Battle 2. `station` distinguishes role within a battle (station key, `'checkin'` for Battle 1 check-in PINs, station key for Gym, blank for Battle 2/3). |
| `Scoring Table` | `Battle, Station Key, Station Name, Target, Unit, Points/Unit, M Weight, F Weight, Notes` | Single source of truth for weights/targets/point-per-unit across all 4 battles. Edit here, not in code. `build_scoring_table_xlsx.js` regenerates a human-editable `.xlsx` copy from hardcoded arrays — **run manually after any Scoring Table change**, it doesn't auto-sync. |
| `Config` | key/value rows | `judge_pin` (admin PIN), `active_round` (legacy, Battle 1 single-score gate — largely superseded by wave-based flow), `release_all`, `released_waves`. **Known bug: can end up with duplicate keys** — see Known Issues. |
| `Round1_Scores` | `athlete_id, name, category, wave, zone, s1_burpees, s2_bike, s3_lunges, s4_pushups, s5_sprint, s6_inchworms, s7_squats, complete, submitted_at, total` | One row per athlete. `s3_lunges` displays as "Deadlift" everywhere (legacy naming, left as-is — see Known Issues). `wave`/`zone` are filled from whichever judge/wave actually scored them (via check-in), not a plan. |
| `Round2_Scores` | `athlete_id, name, category, round, rowing, devils_press, kb_walk, box_jump, round_complete, heat_finished, updated_at` | **One row per (athlete, round)** — append-only grid, not one row per athlete. No `complete`/`total` columns (this is the source of the Leaderboard_Cache_R2 bug, see below). |
| `Round3_Scores` | `athlete_id, name, category, snatch_weight, snatch_reps, sled_weight, sled_laps, ski_metres, box_step_reps, sandbag_reps, complete, total, submitted_at` | One row per athlete, staff-entered post-round. |
| `Checkins` | `wave, zone, athlete_id, checked_in_at` | Append-only. **The real roster source of truth for Battle 1** — `Athletes.wave` is just a default. |
| `Waves` | `wave_num, zone, status` | One row per **(wave, zone)** pair — status (`Draft`/`Active`/`Complete`) is per-zone, not shared. |
| `Gym_Live` | `zone, team_name, front_squats, devils_press, rower, box_jump, rotations, status` | One row per zone (4 total), current team's running totals. |
| `Gym_Results` | `zone, team_name, front_squats, devils_press, rower, box_jump, team_score, finished_at` | Archived on the 5th rotation. |
| `Leaderboard_Cache_R1/R2/R3` | mirrors the corresponding `Round*_Scores` plus `rank`, `gender_rank` | Rebuilt by `rebuildLeaderboard()`. **R2 is always empty** — see Known Issues, it's not actually used for Battle 2's public display. |

## Battle 1 — check-in + per-zone wave lifecycle + batch scoring

**Current flow:** 4 check-in PINs (one per zone) own their zone's entire
lifecycle end to end:
1. Search the full ~300-athlete roster (only place a full search is
   needed — one-time action per arriving athlete, done by 4 people, not
   28), check them into whichever wave is currently open for that zone.
2. Tap **ACTIVATE** on a wave once enough people are checked in — blocks
   only if a *different* wave is already Active **for this same zone**
   (other zones are completely independent, since they run staggered
   10-15 min apart in practice, not in lockstep).
3. Once active, that zone's 7 station judges (`judge/battle1.html`) each
   see a table of just their zone's checked-in roster for that wave —
   one input per athlete, **one SUBMIT ALL** batches the whole station in
   one atomic locked write (`battle1_submit_wave`).
4. Wave auto-completes **for that zone only** once every checked-in
   athlete there has all 7 stations filled — no manual action. If it can
   never naturally complete (withdrawn athlete), the same check-in PIN has
   a **FORCE COMPLETE** override.

**Why this shape (not the more obvious alternatives):**
- *Why check-in owns activation instead of a central admin panel*: tried
  the central-panel version first, organizer found "how do I activate
  Zone B after Zone A" confusing — one PIN per zone owning its whole
  lifecycle removes all cross-role coordination. Matches Gym Battle's
  "Front Squats owns rotation" pattern.
- *Why per-zone, not one shared wave switch*: the first version shared
  one Active wave across all 4 zones, discovered wrong via live testing —
  zones run 10-15 min apart, not synchronized. A shared switch meant one
  zone could look prematurely "complete" while another hadn't even
  started that wave.
- *Why check-in, not the pre-loaded `Athletes.wave` column, is the roster
  truth*: needed a clean way to handle no-shows and late arrivals without
  a separate "floating pool" concept — a no-show simply never gets a
  `Checkins` row, a late arrival gets checked into whichever wave is
  currently open. The pre-loaded wave is just what athletes were told in
  advance, not binding.
- *Why one atomic batch submit per station, not one call per athlete*:
  avoids the exact partial-write/stuck-state class of bug Battle 2 hit
  (see below) — a dropped connection mid-batch can't leave 3 of 7
  athletes scored and 4 not.
- Adapted from `~/test/Prehab121`'s ("Mini Hyrox") Front Desk/Judge
  pattern, generalized for 4 parallel zones and bib-number keys (that
  project is single-track and name-keyed).

Full history: `2026-07-20-battle1-checkin-wave-scoring-design.md` (initial
redesign) → `2026-07-21-battle1-per-zone-waves-design.md` (per-zone
revision, supersedes the wave-lifecycle parts of the first).

**Walk-in / spot registration (added 2026-07-27):** the check-in screen
only ever supported athletes already present in the `Athletes` sheet — no
path existed for a race-day walk-in. `judge/checkin.html` now has a
collapsible "+ ADD WALK-IN ATHLETE" form (bib, name, category, wave); the
new `checkin_add_walkin` backend action creates the `Athletes` row and the
`Checkins` row in the same locked write. Design decisions, all made by the
organizer directly rather than defaulted:
- **Bib number is typed by check-in staff**, not auto-generated — walk-ins
  are handed a physical bib from a reserved spare batch, so the digital
  record has to match what's pinned to their shirt.
- **Wave is a free choice** among that zone's currently-open waves (its own
  selector, independent of whatever wave the check-in screen happens to
  have selected for browsing/searching) — a walk-in doesn't have to land in
  whatever wave staff was last looking at.
- **Duplicate bibs are hard-blocked**, not just warned — reuses the same
  "look up by `athlete_id`" check the rest of the system relies on, so a
  collision would otherwise silently merge two people's scores.
- Reuses the same 7-per-zone-per-wave capacity cap as a normal check-in
  (`STATION_ROUNDS['1'].length`) — a walk-in still needs a free station.

## Battle 2 — round/station grid, no stopwatch

Judge taps through 4 fixed-target stations per round (Rowing 500m, Devil's
Press 12 reps, KB Walk 100m, Burpee Box Jump 10 reps); whistle blows mid-
station, judge types the partial value reached. **Ranking is NOT a point
total** — it's `rounds completed → station reached in the final round →
value at that station`, a deliberate choice (no elapsed-time splits were
ever wanted). Display shows *cumulative* per-station totals (summed across
every round row), not just the current round's values.

**Public leaderboard quirk:** `battle2_scores` is the correct, dedicated
endpoint (computes the real tiebreak ranking, reads `Round2_Scores`
directly, no caching) — but `scores/index.html` originally called the
generic `scores&round=2` endpoint instead, which reads
`Leaderboard_Cache_R2`. That cache can **never** be populated, because
`rebuildLeaderboard()` assumes every round has `complete`/`total` columns,
and `Round2_Scores` has neither. **Fixed 2026-07-23** — the frontend now
calls `battle2_scores` for Battle 2 specifically, and that endpoint was
enriched with cumulative per-station totals + a `partial_last_station`
field so the public page can show a readable tiebreak detail (e.g. "KB
Walk: 45m") instead of just a bare rounds count. The podium/table/modal/
certificate all relabel "TOTAL" → "ROUNDS" for Battle 2, since there's no
real point total to show.

**Architectural lesson learned here** (applies everywhere else now): the
judge UI used to mutate its own local memory of "what just happened"
instead of asking the server, and mobile `fetch()` can fail *after* the
server already succeeded — client state would drift from the sheet (stuck
buttons). Fix: every write endpoint returns full current state, client
fully replaces local state from each response, plus a dedicated read-only
resync endpoint (`battle2_status`) called on any fetch failure.

## Battle 3 — pen-and-paper + post-round staff entry

No live judge UI. Judges tally on paper; staff key results in afterward
via `battle3Submit` (re-submitting the same athlete_id overwrites, doesn't
duplicate — single-entry, not append-only, since one staff member enters
each athlete's final tally once). **Not yet live-tested** as of this
writing.

## Gym Battle — single-entry rotation

Front Squats judge enters all 4 stations' deltas each rotation and taps
one **SUBMIT ROTATION** (`gym_submit_rotation`, one atomic locked write
that also advances the rotation counter and archives+resets on the 5th).
The other 3 station judges' screens are read-only — they verbally report
numbers to Front Squats instead of entering them (organizer deprioritized
building them a submit path at all, since it's not operationally needed).
Old `gymAddScore`/`gymRotate` (the original "4 independent judges" design)
are **neutered, not removed** — they return an error instead of writing,
so a stale device running the old UI can't silently double-count a score
alongside the new flow.

**Why single-entry, not 4 independent judges** (the original design): 4
judges polling/writing independently had visible cross-device lag and the
same partial-write/stuck-state risk Battle 2 hit. One combined submit per
rotation avoids it structurally, same reasoning as Battle 1's batch
submit.

Full history: `2026-07-19-gym-battle-single-entry-design.md`.

## Cross-cutting patterns (apply these by default to any new judge-facing write flow)

1. **Server-truth resync** — never trust client-assumed state; every write
   returns full current state, client replaces (not patches) local state,
   a dedicated read-only endpoint exists for resyncing after a failure.
2. **One atomic batch write, not N small ones** — a judge scoring multiple
   athletes/stations submits everything in one locked call.
3. **One clear owner per lifecycle** — don't split a workflow's control
   across multiple roles/PINs when one owner can hold it end to end.
4. **Schema-drift risk** — if code starts assuming a column exists via
   `headers.indexOf(...)` but a live sheet predates that schema,
   `setup*Sheet()`'s "already has data, leave it alone" guard silently
   prevents the column from ever being created, and the write throws
   (invalid column index) at the worst moment. Always verify live sheet
   headers actually match code expectations after a schema change — don't
   just trust a fresh-sheet setup function. Bit Battle 2 once
   (`round_complete`/`heat_finished` missing on the live sheet).

## Known issues / open items

- **Duplicate `release_all` row in Config** — **RESOLVED**, organizer
  confirmed the duplicate row was deleted (2026-07-27). No longer a
  concern for leaderboard release-state trust.
- **`s3_lunges` displays as "Deadlift"** everywhere — legacy exercise
  rename where only the label changed, not the internal key/column name.
  This was NOT actually consistent everywhere: `scores/index.html`'s own
  `STATION_LABELS` map (used by the public leaderboard table, athlete
  modal, and both certificates) independently said `'Lunges'`, a real
  display bug caught by the organizer reviewing the certificate
  ("I can see lunges, but it's not part of battle 1"). Fixed 2026-07-29 —
  now genuinely consistent everywhere.
- **`Round1` public leaderboard table is wide** (11 columns) — fixed to
  not need horizontal scroll on desktop (`.table-wrap` max-width relaxed
  above 900px), but mobile still scrolls horizontally by design (accepted
  tradeoff, organizer's call 2026-07-23).
- **Battle 1 timeline estimate** — organizer explicitly said (2026-07-27)
  this does not need to be recalculated; live scoring is working fine as
  designed. Drop this from future open-items tracking.
- **Test-data contamination**: reused bib numbers across sessions can
  carry forward historical `complete`/scored data from earlier testing —
  a "bug" where one station's submit appears to complete all 7 is often
  just that the other 6 were already filled from an earlier pass. Verify
  actual sheet values before assuming a write-scoping bug. Use
  `admin_clear` for a genuinely clean slate.
- **Battle 3 and Gym Battle's other-3-judges read-only screens**: Battle 3
  has now been live-tested end-to-end with no issues reported
  (2026-07-27/28). Gym Battle's 3 read-only judge screens remain
  deliberately untested — deprioritized by the organizer, not needed
  operationally.
- **Gym Battle had no public leaderboard/analytics support until
  2026-07-28** — `scores/index.html`'s Gym Battle tab called
  `action=scores&division=gym`, but the backend never read a `division`
  parameter at all, so it silently fell through to the generic Battle 1
  cache and showed Solo Battle 1 data mislabeled as Gym Battle. Fixed:
  frontend now calls the dedicated `gym_scores` action; `getAnalytics()`
  gained a `round==='gym'` branch reading `Gym_Results` directly for real
  Station Champions (top 3 teams per station). Podium/table rendering
  branches on `currentDivision==='gym'` for the different data shape
  (`team_name`/`team_score`/`zone` vs `name`/`total`/`category`).
- **Battle 1 gender-rank now exposed on `getAthlete()`** — new
  `battle1_gender_rank` field, read from `Leaderboard_Cache_R1`'s
  `gender_rank` column (not recomputed). Used by the certificate's
  athlete-meta line (`MALE · RANK - 3`). Blank if Battle 1 isn't
  released/rebuilt for that athlete yet. The public leaderboard table
  also switched its rank column from combined overall `rank` to
  `gender_rank` for the same reason (was interleaving M/F rankings under
  one number, which didn't match "top 3 male" style displays).

## Testing / deployment conventions

- No automated test framework anywhere in this stack (GAS backend, static
  HTML/CSS/JS frontends) — everything is verified by manual code
  read-through plus live testing on the organizer's phone.
- Every `backend/Code.gs` change needs a manual redeploy: paste into the
  Apps Script editor → **Deploy → Manage deployments → edit existing →
  New version** (never "new deployment," that changes the URL). **Always
  confirm the redeploy actually happened with the latest paste** — a stale
  editor tab or a skipped "New version" click has caused real confusion
  more than once this project (e.g. the `partial_last_station` "undefined"
  symptom on 2026-07-23 traced to exactly this).
- Frontend (`judge/*.html`, `admin/index.html`, `scores/index.html`)
  changes need `git push` — **never push without the user's explicit
  go-ahead each time**, even though local commits are fine freely.
- New one-off setup/migration functions (`setup*Sheet()`,
  `migrate*Schema()`, `addCheckinPins()`, etc.) are run manually once from
  the Apps Script editor by the organizer — never wired into a live
  request path.
