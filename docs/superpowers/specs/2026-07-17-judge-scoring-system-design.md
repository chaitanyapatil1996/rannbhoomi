# Rannbhoomi 2026 — Judge Scoring System Design

**Date:** 2026-07-17
**Event:** Rannbhoomi 2026, 2 August 2026, Rajaram Bhiku Pathare Stadium, Pune
**Source of requirements:** Voice memo `App functionality.mp3` (transcribed to
`App_functionality_transcript.txt`, both in repo root) + follow-up Q&A with the
organizer.

## Why

The Rannbhoomi backend (`backend/Code.gs`), judge portal (`judge/index.html`),
public leaderboard (`scores/index.html`), and admin panel (`admin/index.html`)
already exist and are live. But they were built before Battle 2 and Gym Battle
scoring formats were finalized, and only really fit Battle 1's shape (one
judge per station, one score per athlete per station). This spec covers what
needs to change to support all three competitive formats on event day.

Battle 3 is explicitly **out of scope** — it will be scored on paper.

## What's staying as-is

- Registration (`register/index.html`) → Peakst8 is now primary; internal
  form kept for athlete ID lookup only.
- Certificate generation embedded in `scores/index.html`.
- Public leaderboard rendering, analytics (station champions, category
  averages, combined ranking).
- Admin panel actions (clear scores, release leaderboard, rebuild cache).
- Battle 1's fundamental judge interaction: web number → name confirm →
  score submit.

## 1. Access model — per-assignment PINs

Replace the single shared `judge_pin` Config value with a `Judges` sheet:

| pin | battle | assignment | station(s) | label |
|---|---|---|---|---|
| e.g. `X7K2M9` | `1` | `zone=A` | `s1_burpees` | "Battle 1 — Zone A — Station 1: Static Burpees" |
| ... | `2` | `lane=M1` | (all 4, sequential) | "Battle 2 — Male Lane 1" |
| ... | `gym` | `team=<team_id>` | (all 4 scoring stations) | "Gym Battle — Team <n>" |

Every judge link becomes `judge/index.html?pin=<PIN>` — no other URL params.
The backend looks up battle/assignment/station from the PIN server-side, so a
leaked link is useless without its PIN and PINs can't be reassigned by editing
a URL.

`generateJudgePins()` (new Setup-style function, modeled on Mini Hyrox's
`generateKeys()`) creates and logs all PINs in one run:
- Battle 1: 4 zones × 7 stations = **28 PINs**
- Battle 2: 2 male lanes + 2 female lanes = **4 PINs**
- Gym Battle: 1 per team = **N PINs** (N = number of registered gym teams)

## 2. Battle 1 — unchanged interaction, two fixes

- Interaction stays exactly as today: judge enters web number → athlete name
  confirms → judge enters the raw value → submit.
- **Fix (scoring bug):** apply the published per-station point multiplier
  before summing to `total`. Add a `STATION_POINTS` map to `Code.gs`:

  | Station | Points per unit |
  |---|---|
  | Static Burpees | 10 / rep |
  | Erg Bike | 1 / metre |
  | Deadlift | 10 / rep |
  | Hand Release Push Ups | 5 / rep |
  | Sprint with Weights | 20 / lap |
  | Inch Worms | 10 / rep |
  | DB Front Squats | 5 / rep |

  `total = Σ(raw_value_i × STATION_POINTS[station_i])`, replacing the current
  unweighted sum. This changes ranking correctness, not the judge UI.
- **Change:** zone now comes from the judge's PIN lookup instead of a `zone`
  URL param.

## 3. Battle 2 — lane-based stopwatch + splits

- 4 PINs total, each reused across all heats for that lane (15 heats per
  gender, 2 lanes per gender running concurrently — "2 male + 2 female,
  face-to-face").
- **Heat start:** judge's screen shows a dropdown of the top-30
  male/female qualifiers (scoped to the PIN's gender). Judge selects the
  athlete for this heat, confirms, taps **START**.
- **During the heat:** circuit order is fixed — Rowing (500m) → Devil's Press
  (12 reps) → KB Walk (100m) → Burpee Box Jump (10 reps) → loop. Screen shows
  only the current station with one large **STATION DONE** button. Tapping it
  logs the elapsed time as that station's split and auto-advances to the next
  station. Every 4 taps = 1 completed round.
- **Heat end:** judge taps **TIME CAP** at the 20-minute buzzer (or the
  athlete finishes early, if that's possible under these rules — assumed no
  early finish since it's AMRAP-style; confirm if wrong).
- **Scoring/rank:** standard AMRAP tiebreak — full rounds completed, then
  which station reached in the final incomplete round, then elapsed time at
  that point. Lower time / more progress ranks higher.
- **Data model:** new append-only `Round2_Splits` sheet (never overwritten,
  same pattern as Mini Hyrox's Raw Submissions):

  | Timestamp | Athlete ID | Round # | Station | Split (s, elapsed since heat start) |
  |---|---|---|---|---|

  A derive step (new `rebuildRound2Leaderboard()`, following the existing
  `rebuildLeaderboard()` pattern) computes rounds completed + partial-round
  progress per athlete into `Leaderboard_Cache_R2`.

## 4. Gym Battle — rotation tracker

- 1 PIN per team; multiple teams run **simultaneously**, each on its own set
  of 5 stations.
- Fixed station rotation order: Front Squats → Devil's Press → Rower →
  Burpee Box Jumps → KB Hold → (back to Front Squats).
- Judge screen shows 5 athlete slots, each tagged with its current station.
  Four slots (Front Squats, Devil's Press, Rower, Burpee Box Jumps) have a
  reps/distance input; the KB Hold slot shows a running timer only (not
  editable — hold time is not scored).
- **Scoring:** 4 running totals, one per non-KB station, that accumulate
  across the whole heat regardless of which athlete is currently occupying
  that station. **KB Hold time is not part of the score** — it exists only to
  gate rotation.
- A single **"KB DROPPED — ROTATE"** button, tapped when the current KB
  holder drops it, shifts every athlete forward one station in the rotation
  (KB Hold → Front Squats; everyone else moves up one).
- Per `Workout Plan.xlsx`, each athlete performs each station exactly once —
  so the heat ends after 5 rotations (every athlete has cycled through all 5
  stations once). The judge screen should track/display rotation count and
  flag when the heat is complete.
- **Team final score** = sum of the 4 non-KB station totals at heat end.
- Weights (context, not enforced by the app — judges self-referee):
  Front Squats M-60kg/F-40kg, Devil's Press M-15kg/F-7.5kg, KB Hold
  M-24kg/F-16kg (Rower = max distance, Burpee Box Jumps = bodyweight).

## 5. Testing / verification approach

- No automated test suite exists for this GAS backend today (matches Mini
  Hyrox's approach — manual dry-run before race day).
- Plan: dry-run each battle's judge flow end-to-end against a copy/test rows
  in the live sheet, then use the existing `admin_clear` action to wipe test
  data before the event (same pattern already used for Battle 1).
- Verify Battle 1's corrected scoring against a few hand-calculated examples
  before trusting the leaderboard.

## Open assumptions to confirm

1. Battle 2: assumed no early finish (athlete always runs until time cap,
   never "finishes" the AMRAP before 20 minutes) — confirm.
2. Gym Battle: assumed the heat simply ends once 5 rotations complete (every
   athlete has done every station) — confirm there's no additional time cap
   layered on top.
3. Battle 1 point multipliers taken from the live site's stations section —
   confirm these are still the final, correct values before they're hardcoded.
