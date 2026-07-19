# Gym Battle — Single-Entry (Front Squats Judge) Design

**Date:** 2026-07-19 (event day)
**Event:** Rannbhoomi 2026, Rajaram Bhiku Pathare Stadium, Pune
**Supersedes:** the Gym Battle section (§6) of
`2026-07-17-judge-scoring-system-design.md`, specifically the "4 judges per
zone, each scoring their own station" interaction model. Everything else in
that spec (PIN scheme, rotation order, scoring formulas, team-final-score
calculation) is unchanged.

## Why

Live-testing Gym Battle on event day surfaced that having all 4 station
judges log in on separate devices and poll for zone status is too slow —
there's a visible lag between a judge entering a score and it reflecting
correctly across every other judge's screen (all 4 poll independently every
4 seconds). The organizer wants **one judge (Front Squats) to enter all 4
stations' scores each rotation**, with the other 3 station judges verbally
reporting their numbers to Front Squats instead of typing them in themselves.

This also fixes a reliability issue in the original design before it became a
live problem: 4 independent `gym_add_score` calls per rotation (today) is the
same "many small network calls, client assumes success" pattern that caused
Battle 2's stuck-round bug earlier today (see
`project-rannbhoomi-scoring-system.md` memory, "Architectural pattern learned
mid-session"). Consolidating to one call per rotation avoids that class of
bug from the start rather than hitting it later.

## What's staying as-is

- PIN scheme: still one PIN per (zone, station), 16 total, reused across all
  3 waves. Not collapsing to a single PIN per zone — the other 3 judges still
  log in with their own PINs, just to a different (read-only) screen.
- Rotation order, KB Hold gating, scoring formulas (10 pts/rep for Front
  Squats/Devil's Press/Burpee Box Jumps, 1 pt/metre for Rower), and the
  5-rotations-per-team / accumulate-across-rotations model.
- `gymStartTeam` (Front Squats starts a new team/wave) — unchanged.
- `_gymFindZoneRow`, `gym_zone_status` (`gymZoneStatus`) — unchanged, still
  the single source of zone truth both screens poll every 4 seconds.
- `Gym_Live` / `Gym_Results` sheet schemas — unchanged.

## 1. Frontend (`judge/gym.html`) — Front Squats judge's screen

Replace the single station-total display + one input/ADD pair with **4
input boxes shown together**, one per station (Front Squats, Devil's Press,
Rower, Burpee Box Jump — same order as `STATION_META`), each defaulting to
`0`. A single **SUBMIT ROTATION** button replaces the old separate ADD
buttons and the ROTATE button.

Tapping SUBMIT ROTATION:
1. Reads all 4 field values (defaulting empty/invalid to 0).
2. Sends one POST: `{ action: 'gym_submit_rotation', pin, deltas: { front_squats, devils_press, rower, box_jump } }`.
3. On success, clears all 4 fields back to 0, updates the rotation badge and
   running totals from the response, and shows "Team complete — score: X" if
   the response says the heat just finished (mirrors today's rotate-complete
   message).
4. On fetch failure, see §3 (resync before allowing retry).

## 2. Backend (`backend/Code.gs`) — `gym_submit_rotation`

New action, replacing `gymAddScore` + `gymRotate` for the Front Squats flow
(those two functions can stay in the file — no other caller needs them
removed, and removing them isn't necessary for this fix — but nothing in the
new UI calls them anymore).

```
function gymSubmitRotation(body) {
  const { pin, deltas } = body;
  // validate judge, must be front_squats, must have a lock, etc.
  // 1. read current zone row
  // 2. add each of the 4 deltas (defaulting missing/invalid to 0) to its column
  // 3. increment rotations
  // 4. if rotations >= 5: archive to Gym_Results, reset zone row to idle
  // 5. return full zone state: team_name, rotations, all 4 running totals,
  //    heat_complete (bool), team_score (if heat_complete)
}
```

Single `LockService` critical section for the whole read-modify-write, same
pattern as every other write endpoint in this file — no partial-station
writes possible, since it's one set of sheet writes guarded by one lock
acquisition, not 4 separate locked calls.

Validation: only the Front Squats judge for that zone may call this
(`judge.station !== 'front_squats'` → error), same guard `gymStartTeam` and
today's `gymRotate` already use.

## 3. Error handling — resync instead of blind retry

`gym_submit_rotation` **adds** deltas — it is not safe to blindly resubmit
on a failed fetch, since the write may have already landed server-side
(dropped connection after success, same failure mode documented for Battle 2
in memory). On fetch failure:

1. Client remembers the `rotations` count it expected *before* this submit.
2. Immediately calls the existing read-only `gym_zone_status`.
3. If the returned `rotations` is already higher than expected → the submit
   succeeded despite the dropped connection. Show "Already saved — rotation
   N", clear the input fields, do **not** resubmit.
4. If `rotations` is unchanged → it didn't land. Show an error and let the
   judge tap SUBMIT ROTATION again (safe to retry, since nothing was
   written).

This mirrors Battle 2's `battle2_status` / resync pattern exactly —
`gym_zone_status` already exists and needs no changes to serve this role.

## 4. Other 3 judges' screens — read-only status view

Devil's Press, Rower, and Box Jump judges keep their existing PINs and still
log in via `judge/index.html?pin=<PIN>` → `gym.html`, but their screen
becomes **read-only**: same 4-second poll against `gym_zone_status`,
displaying team name, rotation count, and all 4 running totals — no input
fields, no buttons except LOG OUT. This lets them sanity-check what Front
Squats entered against what they called out, without giving them a way to
submit scores themselves.

## 5. Testing / verification approach

- No automated tests exist for this GAS backend (consistent with the rest of
  the project). Verify manually:
  - Solo test (documented in this session): log in as Front Squats, submit a
    rotation with all 4 deltas filled in, confirm `Gym_Live` updates
    correctly and the rotation counter advances.
  - Log in as one of the other 3 PINs mid-rotation, confirm the read-only
    view matches what Front Squats just submitted (within one 4-second poll
    cycle).
  - Force a failure path: submit a rotation, then (if practical) simulate a
    dropped connection to confirm the "Already saved" resync message appears
    correctly rather than double-adding deltas on a retry.
  - Run a full 5-rotation team to confirm heat-complete archiving to
    `Gym_Results` and zone reset still work exactly as before.

## Confirmed assumptions

1. Front Squats judge is the single point of data entry for all 4 stations
   each rotation; the other 3 judges report their numbers verbally. ✅
2. The other 3 judges' PINs are kept (not removed/invalidated) but become
   read-only — no score-entry capability server-side needs to change for
   them beyond simply not being called from their UI anymore. ✅
3. One combined "SUBMIT ROTATION" call per rotation (all 4 stations +
   rotation advance in one atomic write), not 4 separate per-station calls —
   chosen specifically to avoid the partial-write/stuck-state failure mode
   already hit once today in Battle 2. ✅
4. PIN scheme, rotation order, KB Hold gating, and all scoring formulas are
   unchanged from the original design. ✅

No open items remain — spec is ready to implement.
