// Core simulation types (design §2.2-2.6; task 3.1).
// Plain data only: every SimulationState is JSON-serializable and holds no UI fields (Req 2 c6).

// --- Commands (design §2.2) -------------------------------------------------------------

export type FighterId = 'player' | 'ai';

export type CommandType =
  | 'move-left'
  | 'move-right'
  | 'jab'
  | 'cross' // P2
  | 'hook' // P2
  | 'uppercut' // P2
  | 'block' // P2
  | 'slip'; // P2

export interface FighterCommand {
  fighter: FighterId;
  type: CommandType;
}

/**
 * The external gameplay input for one Tick (Req 2 c2). Carries the Player_Fighter's commands;
 * entries for 'ai' are accepted only when cfg.ai.enabled === false (tests), otherwise dropped (D40).
 * An empty list means no command.
 */
export type TickInput = readonly FighterCommand[];

/** Internal per-Fighter command bits. */
export const CMD = {
  MoveLeft: 1 << 0,
  MoveRight: 1 << 1,
  Jab: 1 << 2,
  Cross: 1 << 3,
  Hook: 1 << 4,
  Uppercut: 1 << 5,
  Block: 1 << 6,
  Slip: 1 << 7,
} as const;

export type CommandMask = number;

/** Commands that exist in M1; all other bits are dropped at intake. */
export const M1_ENABLED_MASK: CommandMask = CMD.MoveLeft | CMD.MoveRight | CMD.Jab;

/** Command type -> bit. Only own keys are valid; anything else is an undefined type (Req 2 c7). */
export const COMMAND_BITS: Readonly<Record<CommandType, number>> = {
  'move-left': CMD.MoveLeft,
  'move-right': CMD.MoveRight,
  jab: CMD.Jab,
  cross: CMD.Cross,
  hook: CMD.Hook,
  uppercut: CMD.Uppercut,
  block: CMD.Block,
  slip: CMD.Slip,
};

// --- Ticks and FSM (design §2.3, §4, §6) ------------------------------------------------

/** Integer fixed-point position: 1 world unit = 1000 Fx (design §2.1). */
export type Fx = number;

/** Gameplay_Tick index (design §4). Every timer in src/sim is measured in GTicks. */
export type GTick = number;

export type AttackId = string;

export type AttackPhase = 'startup' | 'active' | 'recovery';

export type FsmState =
  | { kind: 'Idle'; enteredAt: GTick }
  | { kind: 'Walking'; enteredAt: GTick; dir: -1 | 1 }
  | { kind: 'Attacking'; enteredAt: GTick; attackId: AttackId; phase: AttackPhase; contactUsed: boolean }
  | { kind: 'HitStun'; enteredAt: GTick; until: GTick } // leaves HitStun on Gameplay_Tick `until`
  | { kind: 'Defeated'; enteredAt: GTick };

export type FsmKind = FsmState['kind'];

export const M1_FSM_KINDS: readonly FsmKind[] = ['Idle', 'Walking', 'Attacking', 'HitStun', 'Defeated'];

/** Transition triggers of the M1 table (design §6.1). */
export type Trigger =
  | 'move' // exactly one movement command while Able_To_Act
  | 'stop' // Walking with no (or both) movement commands
  | 'attack' // attack command accepted while Able_To_Act
  | 'attack-end' // g - enteredAt reached startup + active + recovery
  | 'hit' // landed hit with hitStun > 0
  | 'hit-no-stun' // landed hit with hitStun == 0 on an Attacking target (D41)
  | 'stun-end' // g >= HitStun.until
  | 'health-zero'; // Health reached 0

/** Tick-processing steps in which FSM transitions may happen (Req 35 c1). */
export type TransitionStep = 3 | 4 | 7 | 8;

/** Opt-in, test-only record of an FSM transition attempt (design §6.2). Not a Game_Event. */
export interface FsmTransitionRecord {
  fighter: FighterId;
  from: FsmKind;
  to: FsmKind;
  trigger: Trigger;
  step: TransitionStep;
  at: GTick;
  /** false: no matching rule (or a second transition in the same step); the state was left unchanged. */
  ok: boolean;
}

// --- Fighters and Simulation_State (design §2.4) ----------------------------------------

export interface FighterState {
  id: FighterId;
  /** Horizontal center, integer Fx. */
  x: Fx;
  /** +1 if the opponent's x is greater, otherwise -1 (Req 7 c8). */
  facing: 1 | -1;
  /** Integer 0..maxHealth. */
  health: number;
  fsm: FsmState;
  /** Gameplay_Tick of this Fighter's last jab start; AI attack interval reference (Req 12 c4). */
  lastJabStartAt: GTick | null;
}

/** sfc32 state words, each an unsigned 32-bit integer. */
export type RngState = [number, number, number, number];

export interface PlayerObservation {
  /** Gameplay_Tick at whose end it was recorded. */
  at: GTick;
  x: Fx;
  facing: 1 | -1;
  fsm: FsmKind;
  attackId: AttackId | null;
  phase: AttackPhase | null;
}

export interface ObservationHistory {
  /** Always exactly HISTORY_SIZE (121) entries (design §10.1). */
  entries: PlayerObservation[];
  /** Index of the newest entry, 0..120. */
  head: number;
  /** Number of valid entries, 1..121. */
  count: number;
}

export type MatchResult = { kind: 'win'; winner: FighterId; at: GTick } | { kind: 'draw'; at: GTick };

export interface SimulationState {
  version: 1;
  /** Selects M1 vs P3 end rules; only 'm1' exists in M1. */
  ruleset: 'm1';
  /** Ticks processed since Match start. */
  tick: number;
  /** Non-frozen Ticks; equals tick in M1 (design §4). */
  gameplayTick: GTick;
  /** P4 Hit_Stop counter; always 0 in M1. */
  hitStopRemaining: number;
  /** Gameplay_Tick of Match start (0). */
  matchStartAt: GTick;
  /** uint32 seed (Req 3 c2). */
  seed: number;
  /** uint32 FNV-1a fingerprint of the validated config (D42, Req 3 c8). */
  configFingerprint: number;
  rng: RngState;
  /** [0] = player, [1] = ai. */
  fighters: [FighterState, FighterState];
  history: ObservationHistory;
  /** M1 winner or draw (Req 11 c7-c8). */
  result: MatchResult | null;
}

// --- Game events (design §2.6) ----------------------------------------------------------

export type GameEvent =
  | {
      type: 'hit-landed';
      at: GTick;
      attacker: FighterId;
      target: FighterId;
      attackId: AttackId;
      damage: number;
      /** World units: center of the Hitbox-Hurtbox intersection (Req 10 c5). */
      hitPos: { x: number; y: number };
    }
  | { type: 'fighter-defeated'; at: GTick; fighter: FighterId }
  | { type: 'match-result'; at: GTick; result: MatchResult };

export interface StepResult {
  state: SimulationState;
  /** Exactly this Tick's events, in D10 order (Req 2 c4). */
  events: GameEvent[];
  /** Test-only, opt-in FSM trace (design §6.2). */
  trace?: FsmTransitionRecord[];
}

// --- Attack definitions (design §2.5) ---------------------------------------------------

/** Authored attack data, in world units and integer Ticks (Req 5 c1). */
export interface AttackDefinition {
  id: AttackId;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  staminaCost: number;
  guardDamage: number;
  hitStun: number;
  blockStun: number;
  /** offset: from the attacker's position to the box center (x mirrored by facing); size: full width/height. */
  hitbox: { offset: { x: number; y: number }; size: { w: number; h: number } };
}

export interface CompiledAttack extends Readonly<AttackDefinition> {
  hitboxFx: { readonly ox: Fx; readonly oy: Fx; readonly w: Fx; readonly h: Fx };
  /** startup + active + recovery. */
  total: number;
  /** Hitbox_Reach = ox + w/2, rounded down. */
  reachFx: Fx;
  /** 2*ox + w + hurt.w, doubled Fx: Connect_Range (design §8.2). */
  connectRange2: number;
  /** 2*ox - w - hurt.w, doubled Fx (design §8.4). */
  nearEdge2: number;
  /** Integer connect interval within [minSeparation, ring width]; null if empty. */
  reach: { dLo: Fx; dHi: Fx } | null;
}

// --- Utilities --------------------------------------------------------------------------

/** Recursively readonly view; used for states handed to the AI and the Renderer. */
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends ReadonlyMap<infer K, infer V>
    ? ReadonlyMap<DeepReadonly<K>, DeepReadonly<V>>
    : T extends readonly unknown[]
      ? { readonly [I in keyof T]: DeepReadonly<T[I]> }
      : T extends object
        ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
        : T;
