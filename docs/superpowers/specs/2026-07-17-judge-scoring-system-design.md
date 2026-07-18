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

Battle 3 is scored on paper live (judges tally by hand, no live judge UI), but
the finalized numbers are entered into the system afterward via a staff entry
screen so totals/leaderboard/certificates stay consistent across all battles
(see §6).

## What's staying as-is

- Registration (`register/index.html`) → Peakst8 is now primary; internal
  form kept for athlete ID lookup only.
- Certificate generation embedded in `scores/index.html`.
- Public leaderboard rendering, analytics (station champions, category
  averages, combined ranking).
- Admin panel actions (clear scores, release leaderboard, rebuild cache).
- Battle 1's fundamental judge interaction: bib number → name confirm →
  score submit.

## 1. Canonical Scoring Table (replaces `Workout Plan.xlsx` as source of truth)

A new `Scoring Table` sheet becomes the single source of truth for every
station across all battles — no more scattering values across code, the spec,
and the old xlsx. Same role as Mini Hyrox's `Scoring Table` tab.

| Battle | Station # | Station Name | Target | Unit | Points/Unit | M Weight | F Weight | Notes |
|---|---|---|---|---|---|---|---|---|
| 1 | 1 | Static Burpees | Max | reps | 10 | bodyweight | bodyweight | |
| 1 | 2 | Erg Bike | Max (2 min) | metres | 1 | — | — | |
| 1 | 3 | Deadlift | Max | reps | 10 | 50kg | 30kg | |
| 1 | 4 | Hand Release Push Ups | Max | reps | 5 | bodyweight | bodyweight | |
| 1 | 5 | Sprint with Weights | Max | laps | 20 | 15kg×2 | 10kg×2 | |
| 1 | 6 | Inch Worms | Max | reps | 10 | bodyweight | bodyweight | |
| 1 | 7 | DB Front Squats | Max | reps | 5 | 12.5kg×2 | 5kg×2 | |
| 2 | 1 | Rowing | 500 | metres | — (progress-based, see §4) | — | — | |
| 2 | 2 | Devil's Press | 12 | reps | — | 10kg×2 | 5kg×2 | |
| 2 | 3 | KB Walk | 100 | metres | — | 12kg×2 | 8kg×2 | |
| 2 | 4 | Burpee Box Jump | 10 | reps | — | 30in | 24in | |
| 3 | 1 | Single Arm Snatch | 40 | reps | reps × weight used (kg) | athlete-selected, logged on paper | athlete-selected, logged on paper | e.g. 30kg × 40 reps = 1200 pts |
| 3 | 2 | Sled Push | 4 | laps | weight used (kg) × laps | athlete-selected, logged on paper | athlete-selected, logged on paper | e.g. 200kg × 4 laps = 800 pts |
| 3 | 3 | Ski | Max (4 min cap) | metres | 1 / metre | — | — | Fixed 4-min cap; score = distance covered |
| 3 | 4 | Box Step Up with Weights | 40 | reps | 10 (fixed) | logged for reference, not scored | logged for reference, not scored | Weight doesn't affect score; 40 × 10 = 400 pts fixed if completed |
| 3 | 5 | Sandbag Back Throw | Max | reps | 10 | 50kg (fixed) | 30kg (fixed) | Max reps at fixed gender weight |
| Gym | 1 | Front Squats | Max | reps | 10 (accumulated, see §6) | 15kg×2 | 10kg×2 | |
| Gym | 2 | Devil's Press | Max | reps | 10 | 15kg×2 | 7.5kg×2 | |
| Gym | 3 | Rower | Max | metres | 1 | — | — | |
| Gym | 4 | Burpee Box Jumps | Max | reps | 10 | bodyweight | bodyweight | |
| Gym | 5 | KB Hold | Max time | seconds | not scored | 24kg | 16kg | gates rotation only |

Populate this via a `setupScoringTable()` function (mirrors Mini Hyrox's
`setupSheet()`), so it's editable in the Sheet without a redeploy if a weight
or point value changes before race day.

## 2. Access model — per-assignment PINs

Replace the single shared `judge_pin` Config value with a `Judges` sheet:

| pin | battle | assignment | station(s) | label |
|---|---|---|---|---|
| e.g. `X7K2M9` | `1` | `zone=A` | `s1_burpees` | "Battle 1 — Zone A — Station 1: Static Burpees" |
| ... | `2` | `lane=M1` | (all 4, sequential) | "Battle 2 — Male Lane 1" |
| ... | `gym` | `zone=<n>, station=<name>` | one station | "Gym Battle — Zone 2 — Devil's Press" |

Every judge link becomes `judge/index.html?pin=<PIN>` — no other URL params.
The backend looks up battle/assignment/station from the PIN server-side, so a
leaked link is useless without its PIN and PINs can't be reassigned by editing
a URL.

`generateJudgePins()` (new Setup-style function, modeled on Mini Hyrox's
`generateKeys()`) creates and logs all PINs in one run:
- Battle 1: 4 zones × 7 stations = **28 PINs**
- Battle 2: 2 male lanes + 2 female lanes = **4 PINs**
- Gym Battle: 4 zones × 4 non-KB stations = **16 PINs**, each reused across
  all 3 waves as different teams rotate through that zone (see §6)
- Battle 3: no judge PINs — staff entry screen only (see §5), likely reuses
  the admin PIN rather than a new judge PIN

## 3. Battle 1 — unchanged interaction, two fixes

- Interaction stays exactly as today: judge enters bib number → athlete name
  confirms → judge enters the raw value → submit.
- **Fix (scoring bug):** apply the per-station point multiplier from the new
  `Scoring Table` sheet before summing to `total`, replacing the current
  unweighted sum (`total = Σ(raw_value_i × points_per_unit_i)`). This changes
  ranking correctness, not the judge UI. Multiplier is read from the sheet at
  score-submit time, not hardcoded, so it can be corrected without a redeploy.
- **Change:** zone now comes from the judge's PIN lookup instead of a `zone`
  URL param.

## 4. Battle 2 — round-based reps/distance tracking (no stopwatch)

- 4 PINs total, each reused across all heats for that lane (15 heats per
  gender, 2 lanes per gender running concurrently — "2 male + 2 female,
  face-to-face").
- **Heat timing:** fixed 20-minute window for the whole wave; a whistle
  (external, not app-driven) signals stop for everyone at once. The judge UI
  doesn't need to run its own countdown/stopwatch — it just needs a manual
  **STOP / WHISTLE** action to close out the heat when it's called.
- **Heat start:** judge's screen shows a dropdown of the top-30
  male/female qualifiers (scoped to the PIN's gender). Judge selects the
  athlete for this heat, confirms, taps **START**.
- **During the heat — round/station grid, not a stopwatch.** Circuit order is
  fixed: Rowing (500m) → Devil's Press (12 reps) → KB Walk (100m) → Burpee Box
  Jump (10 reps) → loop. Each of the 4 stations has a fixed target (from the
  Scoring Table). The screen shows the current round's 4 station slots:
  - Tapping **STATION DONE** logs that station's value as its fixed target
    (they only advance once they've hit it) and moves to the next station.
  - Completing all 4 stations in a round auto-advances to the next round.
  - When the whistle blows mid-station, the judge doesn't tap "done" — they
    type the actual partial count/distance reached into that station's field
    instead, then hits final **SUBMIT**.
  - This builds exactly the structure you described:
    `{ round_1: [500, 12, 100, 10], round_2: [500, 12, 100, 9] }` — every
    cell is the fixed target except the one live cell being run when time
    is called.
  - No elapsed-time tracking at all — dropped per your confirmation, since
    ranking never needed wall-clock splits, only rounds + progress.
- **Data model:** new append-only `Round2_Scores` sheet:

  | Athlete ID | Round # | Rowing (m) | Devil's Press (reps) | KB Walk (m) | Box Jump (reps) | Round Complete? |
  |---|---|---|---|---|---|---|

  A derive step (new `rebuildRound2Leaderboard()`, following the existing
  `rebuildLeaderboard()` pattern) computes rank per athlete from this table.
- **Ranking / tiebreak:** most fully-completed rounds → most stations reached
  in the final (incomplete) round → highest value in the last touched station.

## 5. Battle 3 — paper scoring, post-round staff entry

- No live judge UI for Battle 3. Judges tally scores on paper during the
  round, same as originally planned.
- **After the round finishes**, staff key the paper results into a simple
  entry form (one screen, one row per athlete — top 10 male + top 10 female
  finalists), reading straight off the paper sheet:
  - Single Arm Snatch: weight used (kg) + reps → points = reps × weight
  - Sled Push: weight used (kg) + laps → points = weight × laps
  - Ski: distance covered in the 4-minute cap (metres) → points = metres × 1
  - Box Step Up with Weights: reps completed → points = reps × 10 (weight is
    logged for reference but doesn't affect score)
  - Sandbag Back Throw: reps completed → points = reps × 10 (fixed gender
    weight, not entered per-athlete)
  - Total Battle 3 score = sum of all 5 station points.
- **Data model:** new `Round3_Scores` sheet, one row per athlete with a column
  per station (weight-used columns only where relevant) plus a computed
  total — same shape as the existing `Round1`/`Round2` score sheets, just
  populated by a staff form instead of live judge submissions.
- This is a single-entry form, not append-only like the live battles — there's
  no risk of duplicate/concurrent submissions since one staff member enters
  each athlete's final tally once, from paper.

## 6. Gym Battle — rotation tracker

- Fixed station rotation order: Front Squats → Devil's Press → Rower →
  Burpee Box Jumps → KB Hold → (back to Front Squats).
- **Judge structure:** 4 judges per zone, one per non-KB station (KB Hold has
  no dedicated judge). One team occupies a zone per wave (10 teams ÷ 4 zones
  = 3 waves), so each station judge only ever tracks one team at a time.
- **PIN scheme:** one PIN per (zone, station) pair — 4 zones × 4 stations =
  16 PINs, matching Battle 2's lane-reuse pattern. The same PIN/link is used
  across all 3 waves as different teams pass through that zone.
- **Rotation trigger:** the **Front Squats judge** taps "KB dropped → rotate
  everyone" — they're first in the rotation order and best positioned to see
  the incoming athlete. Single clear owner, no multi-judge coordination
  needed.
- **Scoring:** points = reps × 10 for Front Squats, Devil's Press, and Burpee
  Box Jumps; points = metres × 1 for Rower. Each station judge keeps one
  running point total for their station, accumulated across whichever
  athlete currently occupies it — since only one athlete is ever at a given
  station at a time within a zone, there's no double-counting risk. KB Hold
  time is not scored at all — it only gates rotation.
- **Team final score** = sum of the 4 station totals at heat end (once all 5
  rotations complete, i.e. every athlete has done every station once).
- Weights (context, not enforced by the app — judges self-referee): Front
  Squats M-15kg×2/F-10kg×2, Devil's Press M-15kg×2/F-7.5kg×2, KB Hold
  M-24kg/F-16kg (Rower = max distance, Burpee Box Jumps = bodyweight).

## 7. Testing / verification approach

- No automated test suite exists for this GAS backend today (matches Mini
  Hyrox's approach — manual dry-run before race day).
- Plan: dry-run each battle's judge flow end-to-end against test rows in the
  live sheet, then use the existing `admin_clear` action to wipe test data
  before the event.
- Verify Battle 1's corrected scoring and Battle 2's round/tiebreak logic
  against hand-calculated examples before trusting the leaderboard.

## Confirmed assumptions

1. Battle 2: athletes never finish early — always run until the whistle. ✅
2. Gym Battle: heat ends once all 5 rotations complete (every athlete has done
   every station once). ✅
3. Battle 1 point multipliers (now in the Scoring Table, §1) are final. ✅
4. Battle 3 stays pen-and-paper live, but results get entered into the system
   post-round via a staff form (§5) rather than staying fully manual. ✅
5. Ski's Battle 3 target is a fixed 4-minute time cap, scored by distance
   (metres), matching the Erg Bike pattern from Battle 1. ✅
6. Gym Battle: Front Squats judge owns the rotation trigger; PIN scheme is
   one per (zone, station) — 16 total, reused across waves. ✅
7. Gym Battle scoring: 10 pts/rep for Front Squats, Devil's Press, and Burpee
   Box Jumps; 1 pt/metre for Rower. KB Hold remains unscored. ✅

No open items remain — spec is ready to implement.
