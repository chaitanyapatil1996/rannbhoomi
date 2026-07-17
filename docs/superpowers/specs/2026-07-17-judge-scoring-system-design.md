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
| 2 | 1 | Rowing | 500 | metres | — (progress-based, see §3) | — | — | |
| 2 | 2 | Devil's Press | 12 | reps | — | 10kg×2 | 5kg×2 | |
| 2 | 3 | KB Walk | 100 | metres | — | 12kg×2 | 8kg×2 | |
| 2 | 4 | Burpee Box Jump | 10 | reps | — | 30in | 24in | |
| Gym | 1 | Front Squats | Max | reps | — (accumulated, see §4) | 15kg×2 | 10kg×2 | |
| Gym | 2 | Devil's Press | Max | reps | — | 15kg×2 | 7.5kg×2 | |
| Gym | 3 | Rower | Max | distance | — | — | — | |
| Gym | 4 | Burpee Box Jumps | Max | reps | — | bodyweight | bodyweight | |
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
| ... | `gym` | `zone=<n>, station=<name>` | one station | "Gym Battle — Zone 2 — Devil's Press" *(see §4, still TBD)* |

Every judge link becomes `judge/index.html?pin=<PIN>` — no other URL params.
The backend looks up battle/assignment/station from the PIN server-side, so a
leaked link is useless without its PIN and PINs can't be reassigned by editing
a URL.

`generateJudgePins()` (new Setup-style function, modeled on Mini Hyrox's
`generateKeys()`) creates and logs all PINs in one run:
- Battle 1: 4 zones × 7 stations = **28 PINs**
- Battle 2: 2 male lanes + 2 female lanes = **4 PINs**
- Gym Battle: 4 judges × number of zones = **PIN count TBD** (see §4)

## 3. Battle 1 — unchanged interaction, two fixes

- Interaction stays exactly as today: judge enters web number → athlete name
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

## 5. Gym Battle — rotation tracker (judge structure changed, needs follow-up)

- Fixed station rotation order: Front Squats → Devil's Press → Rower →
  Burpee Box Jumps → KB Hold → (back to Front Squats).
- **Changed from the original plan:** instead of one judge per team overseeing
  the whole rotation, there are **4 judges per zone, one per non-KB station**
  (KB Hold has no dedicated judge). Each team still rotates through all 5
  stations, only performing each once (per the workout rules).
- **Scoring:** 4 running totals, one per non-KB station, accumulated across
  the whole heat regardless of which athlete currently occupies that station.
  KB Hold time is not scored — it only gates rotation (when dropped, everyone
  advances one station).
- **Open / deferred — to design in a follow-up pass:**
  - Exact PIN/assignment scheme now that judges are per-station rather than
    per-team (e.g., does a station judge serve one team or all teams passing
    through that station in a zone?).
  - Who triggers "KB dropped → rotate everyone" if no judge is stationed at
    KB Hold — one of the 4 station judges, a zone coordinator, or the
    athlete's own team signaling it?
  - How 4 independent judges' inputs reconcile into one team score without
    double-counting or gaps during rotation.
- Weights (context, not enforced by the app — judges self-referee): Front
  Squats M-15kg×2/F-10kg×2, Devil's Press M-15kg×2/F-7.5kg×2, KB Hold
  M-24kg/F-16kg (Rower = max distance, Burpee Box Jumps = bodyweight).

## 6. Testing / verification approach

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

## Still open

- Gym Battle judge/PIN structure and rotation-trigger ownership (§5) —
  explicitly deferred to a follow-up discussion, not blocking the rest of
  this spec.
