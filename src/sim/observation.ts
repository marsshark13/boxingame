// Player_Observation_History ring buffer (design §9.3, §10; D32; Req 12 c9-c12; task 5.1).
import type { AttackId, AttackPhase, DeepReadonly, FighterState, GTick, ObservationHistory, PlayerObservation } from './types';

/** Reaction delays 0..120 need the observations of the last 121 Gameplay_Ticks (D32). */
export const HISTORY_SIZE = 121;

/** The Player_Fighter's observation at the end of Gameplay_Tick `g`. */
export function observe(player: DeepReadonly<FighterState>, g: GTick): PlayerObservation {
  const f = player.fsm;
  const attacking = f.kind === 'Attacking';
  return {
    at: g,
    x: player.x,
    facing: player.facing,
    fsm: f.kind,
    attackId: attacking ? (f.attackId as AttackId) : null,
    phase: attacking ? (f.phase as AttackPhase) : null,
  };
}

/**
 * A history holding only `obs0`. Unused slots hold copies of it, so the JSON form never
 * contains null and has a fixed shape for strict parsing (design §10.1).
 */
export function initHistory(obs0: PlayerObservation): ObservationHistory {
  return { entries: Array.from({ length: HISTORY_SIZE }, () => ({ ...obs0 })), head: 0, count: 1 };
}

/** Appends an observation, reusing the oldest slot once 121 are held (Req 12 c9). */
export function pushObservation(h: ObservationHistory, obs: PlayerObservation): void {
  h.head = (h.head + 1) % HISTORY_SIZE;
  Object.assign(h.entries[h.head]!, obs);
  h.count = Math.min(h.count + 1, HISTORY_SIZE);
}

/** Records the Player_Fighter's end-of-Tick observation directly into the next slot (no allocation). */
export function recordObservation(h: ObservationHistory, player: DeepReadonly<FighterState>, g: GTick): void {
  h.head = (h.head + 1) % HISTORY_SIZE;
  const slot = h.entries[h.head]!;
  const f = player.fsm;
  slot.at = g;
  slot.x = player.x;
  slot.facing = player.facing;
  slot.fsm = f.kind;
  if (f.kind === 'Attacking') {
    slot.attackId = f.attackId;
    slot.phase = f.phase;
  } else {
    slot.attackId = null;
    slot.phase = null;
  }
  h.count = Math.min(h.count + 1, HISTORY_SIZE);
}

/**
 * The observation recorded at the end of Gameplay_Tick `k`, or the Match-start observation
 * when `k` is earlier than `startAt` (Req 12 c10). Section 10.2 shows the lookup never misses
 * for reaction delays 0..120.
 */
export function observationFor(h: DeepReadonly<ObservationHistory>, k: GTick, startAt: GTick): DeepReadonly<PlayerObservation> {
  const target = k < startAt ? startAt : k;
  const newest = h.entries[h.head]!;
  const offset = newest.at - target; // 0 = newest
  if (offset < 0 || offset >= h.count) {
    throw new Error(`observationFor: Gameplay_Tick ${target} is not in the history (newest ${newest.at}, count ${h.count})`);
  }
  return h.entries[(h.head - offset + HISTORY_SIZE) % HISTORY_SIZE]!;
}
