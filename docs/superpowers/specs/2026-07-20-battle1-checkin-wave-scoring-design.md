# Battle 1 — Wave Check-In & Batch Scoring Design

**Date:** 2026-07-20
**Event:** Rannbhoomi 2026, Rajaram Bhiku Pathare Stadium, Pune
**Supersedes:** Battle 1's judge interaction described in
`2026-07-17-judge-scoring-system-design.md` §3 ("interaction stays exactly
as today: judge enters bib number → athlete name confirms → judge enters
raw value → submit"). Scoring math (weighted points-per-station from the
Scoring Table), the PIN model, and everything about Battle 2/3/Gym Battle
are unchanged.

## Why

Battle 1 currently has no dropdown/search for bib numbers — a station judge
free-types a bib number for whichever athlete walks up, one at a time, with
no concept of "who's supposed to be here right now." With 300 athletes this
makes typos costly and gives no structure to the day.

The organizer is pre-planning **wave** assignments externally (which bibs
run when) and sharing wave times with athletes in advance, which raises a
real scheduling problem: a wave's roster isn't reliable until people
actually show up (no-shows, late arrivals). Rather than build a
free-text-search workaround, the fix is to make **who's actually present**
the thing the judge UI is scoped to — solving the search/dropdown problem
and the late-comer problem with the same mechanism.

This reuses a pattern already built and used for a real event: Prehab121's
"Mini Hyrox" Front Desk/Judge system (`~/test/Prehab121/src/FrontDesk.gs`,
`Judge.gs`, `Judgehtml.html`) — wave status (Draft/Active/Complete), a
judge screen that renders the active wave's roster as an editable table
with one batch submit, and a Late Entry mode to catch missed scores.
Adapted here for Rannbhoomi's 4-parallel-zone structure and its existing
bib-number/PIN schema (Mini Hyrox is single-track and name-keyed).

## What's staying as-is

- Battle 1's scoring math: per-station weighted points from the Scoring
  Table, `total` computed once all 7 stations are filled for an athlete.
- `Round1_Scores` schema and `_getScoringRow('1', station)` lookups.
- The `Athletes` sheet's actual current columns: `athlete_id, name, email,
  category, wave` — **no `zone` column exists here and none is added**; zone
  is decided at check-in, not pre-loaded (see §1).
- Judge PIN model (`Judges` sheet, `_lookupJudge`), Battle 2/3/Gym Battle
  entirely.
- Public leaderboard / analytics reads (`getScores`, `getAnalytics`).

## 1. Data model — two new sheets

**`Checkins`** (append-only) — the real source of truth for "who's
actually part of wave N, zone Z," independent of the pre-loaded `Athletes.wave`
column (which is just a plan/default):

| wave | zone | athlete_id | checked_in_at |
|---|---|---|---|

**`Waves`**:

| wave_num | status |
|---|---|

Status is one of `Draft` / `Active` / `Complete`. `setupWavesSheet()` (new
one-time setup function, same pattern as `setupBattle2Sheet` etc.) populates
one Draft row per distinct non-blank value found in `Athletes.wave`, sorted
ascending, only if the sheet is currently empty.

## 2. PIN scheme addition — 4 check-in PINs

One new PIN per zone: `{ battle: '1', assignment: <zone>, station: 'checkin' }`.
Added via a new `addCheckinPins()` function (mirrors `addBattle3Pins()` —
appends only, safe to run without disturbing already-issued PINs). Reuses
the existing `_lookupJudge`/`Judges` sheet infrastructure — no new auth
model.

## 3. Check-in (`judge/checkin.html`, new page)

One check-in PIN per zone, run by a staff member stationed at that zone's
queue. On load:
- Shows a dropdown of all non-Complete waves (Draft or Active), defaulting
  to the lowest-numbered one — so check-in for the *next* wave can start
  while the *current* wave is still being scored, no dead air between
  waves. Staff can explicitly pick a later wave for a known-late arrival.
- A full-roster bib search (autocomplete over all ~300 athletes) — this
  full-search UI is fine here specifically because it's a one-time action
  per arriving athlete, done by 4 check-in staff, not repeated by the 28
  station judges.
- Shows the zone's already-checked-in list for the selected wave (so a page
  reload doesn't lose state — pulled fresh from the `Checkins` sheet, same
  server-truth-resync principle used for Battle 2/Gym Battle, not
  client-side caching).
- Tapping CHECK IN appends a `Checkins` row. **Duplicate guard:** if that
  athlete_id already has any `Checkins` row (any wave/zone), show "already
  checked into Wave X, Zone Y" and require an explicit confirm before
  adding a second entry — covers a genuine correction (they were moved
  zones) without silently double-checking someone in by accident.
- No-show handling: if a bib is never checked in, it simply never appears
  in any zone's judge roster. A late arrival gets checked into whichever
  wave is currently accepting check-ins when they show up — this check-in
  action **is** the late-accommodation mechanism, no separate floating-pool
  bookkeeping needed.

## 4. Battle 1 station judge screen (`judge/battle1.html`, new page)

Splits Battle 1's judge interaction out of `judge/index.html` into its own
page, matching Battle 2/3/Gym Battle's pattern (see §6). On load:
- Fetches the currently Active wave, then that zone's checked-in roster for
  it (`Checkins` filtered by wave + judge's own zone) — typically ≤7 people.
- Renders as a table: bib, name, one score input per row (mirrors
  Prehab121's `Judgehtml.html` table, adapted to bib-keyed rows) — no
  dropdown/search needed at all, since the list is naturally small.
- Pre-fills any input whose athlete already has a value for this station in
  `Round1_Scores` (returned by the roster-fetch endpoint), so a page reload
  doesn't lose already-submitted values — same server-truth principle as
  Battle 2/Gym Battle, not `localStorage` (Prehab121's approach, which this
  project's established pattern already improved on this session).
- **One SUBMIT ALL button** batches every filled-in row into a single
  atomic locked write: for each entry, find-or-create the athlete's
  `Round1_Scores` row, set this station's column, and — same as today's
  per-athlete logic — recompute `total`/`complete` if all 7 stations are
  now filled. This is the same one-call-per-batch principle established
  for `gym_submit_rotation` (no partial-write window, no repeated
  small network calls).
- **Late Entry mode:** a toggle to pick any wave (not just the Active one)
  and submit missing scores for that zone's checked-in roster for it —
  covers a judge who missed someone, or a late arrival checked into a
  different wave than their original neighbors.

## 5. Wave lifecycle

- **Draft → Active:** manual, via a new "Waves" section added to the
  existing `admin/index.html` (not a new page — this is already the
  organizer-facing control surface). Shows every wave's status and each
  zone's checked-in count; one **ACTIVATE** action per Draft wave, blocked
  if another wave is already Active (same "only one Active at a time" rule
  as Prehab121's `fdActivateWave`).
- **Active → Complete:** **automatic, no button.** Recomputed right after
  every `battle1_submit_wave` call: for the wave just scored, check whether
  every checked-in athlete across **all 4 zones** now has `complete: true`
  in `Round1_Scores`; if so, flip `Waves.status` to `Complete` immediately.
  The admin panel just displays the current sheet value — no polling logic
  needed there, consistent with this codebase's existing "compute at
  write-time, read plainly elsewhere" pattern (e.g. the leaderboard cache).

## 6. File structure change

`judge/index.html` becomes a pure PIN router for **all four** battles, with
no exception — it currently embeds Battle 1's scoring UI directly instead of
redirecting like it does for Battle 2/3/Gym Battle. Splitting Battle 1 out
into `judge/battle1.html` removes that inconsistency (a `station: 'checkin'`
PIN redirects to `judge/checkin.html` the same way).

## 7. Testing / verification approach

No automated test framework exists for this stack (consistent with the
rest of the project). Manual verification plan:
- Check in a handful of TEST-prefixed athletes across 2+ waves/zones via
  `checkin.html`, confirm the `Checkins` sheet rows land correctly and the
  duplicate-guard warning fires on a repeat check-in.
- Activate a wave from `admin/index.html`, confirm a second wave can't be
  activated simultaneously.
- Log in as a Battle 1 station judge, confirm the roster table only shows
  that zone's checked-in athletes for the active wave, submit a batch, and
  confirm `Round1_Scores` updates correctly (including a station where all
  7 are now filled, so `total`/`complete` compute).
- Fully score every checked-in athlete for a test wave across all 4 zones
  and confirm `Waves.status` flips to Complete automatically, with no
  manual action.
- Test Late Entry: pick a Complete wave, submit a previously-missed score,
  confirm it lands and doesn't disturb the wave's Complete status.
- Test a simulated late arrival: check an athlete into a later wave than
  their `Athletes.wave` default, confirm they appear correctly in that
  later wave's roster and nowhere else.

## Confirmed assumptions

1. `zone` is decided at check-in, not pre-loaded — the `Checkins` sheet is
   the real roster source of truth, `Athletes.wave` is just a plan/default. ✅
2. Check-in is 4 independent, zone-specific stations (not one central
   check-in point) — matches "check-in for each zone." ✅
3. Front Desk (the admin panel) only controls wave activation and displays
   status/counts — it never touches scores. Judges submit scores directly,
   same as today, just batched per wave. ✅
4. Wave completion is fully automatic (derived from scoring data), not a
   manual action — removes an operational step the organizer would
   otherwise have to remember. ✅
5. Late-comers are handled entirely through check-in timing (check them
   into whichever wave is currently open) — no separate floating-pool
   schema or admin action needed. ✅
6. `judge/battle1.html` and `judge/checkin.html` are new pages;
   `judge/index.html` becomes a pure router with no embedded battle logic
   of its own, for consistency with Battle 2/3/Gym Battle. ✅

No open items remain — spec is ready to implement.
