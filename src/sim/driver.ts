// MatchDriver: double-buffered Simulation_States, per-Tick player commands, restart
// (design §2.1, §3.2, §10.3; Req 1 c5, Req 2 c2, c4, Req 12 c12, Req 13 c4-c6; task 9.2).
//
// The driver owns two preallocated state buffers. Each Tick it swaps them so `prev` holds the
// last state and the new Tick is written into the other one; after a frame's Ticks `prev` and
// `curr` are exactly the two most recent states the Renderer interpolates between, even after
// five catch-up Ticks. The AI decides inside stepInto (D40), so the driver feeds only the
// Player_Fighter's commands. It knows nothing about frames or time.
import type { CompiledConfig } from './config/compile';
import { cloneState, copyStateInto, createInitialState } from './state';
import { stepInto } from './step';
import { COMMAND_BITS, type CommandMask, type CommandType, type DeepReadonly, type FighterCommand, type GameEvent, type SimulationState, type TickInput } from './types';

const COMMAND_ORDER = Object.keys(COMMAND_BITS) as CommandType[];

/** Frozen list-form player inputs for all 256 masks, built once (no per-Tick allocation). */
const PLAYER_INPUTS: readonly TickInput[] = Array.from({ length: 256 }, (_, mask) =>
  Object.freeze(
    COMMAND_ORDER.filter((t) => (mask & COMMAND_BITS[t]) !== 0).map((type): FighterCommand => Object.freeze({ fighter: 'player', type })),
  ),
);

export interface DriverView {
  prev: DeepReadonly<SimulationState>;
  curr: DeepReadonly<SimulationState>;
  /** Interpolation fraction in [0, 1) (Req 1 c5). */
  alpha: number;
}

export class MatchDriver {
  readonly cfg: CompiledConfig;
  private a: SimulationState;
  private b: SimulationState;
  private alpha = 0;
  private readonly events: GameEvent[] = [];

  constructor(cfg: CompiledConfig) {
    this.cfg = cfg;
    const s0 = createInitialState(cfg);
    this.a = s0;
    this.b = cloneState(s0);
  }

  /** State at the end of the previous Tick. */
  get prev(): DeepReadonly<SimulationState> {
    return this.a;
  }

  /** State at the end of the latest Tick. */
  get curr(): DeepReadonly<SimulationState> {
    return this.b;
  }

  /** Advances one Tick with the Player_Fighter's command mask; returns that Tick's events (D10 order). */
  tick(playerMask: CommandMask): readonly GameEvent[] {
    const input = PLAYER_INPUTS[playerMask & 0xff]!;
    const older = this.a;
    this.a = this.b; // the latest state becomes prev
    this.b = older; // the older buffer receives the new Tick
    const tickEvents = stepInto(this.a, this.b, input, this.cfg);
    for (const e of tickEvents) this.events.push(e);
    return tickEvents;
  }

  /** Clears the frame's event list (reused array). Call before a frame's Ticks. */
  beginFrame(): void {
    this.events.length = 0;
  }

  /** Every Game_Event emitted since the last beginFrame(), in emission order. */
  get frameEvents(): readonly GameEvent[] {
    return this.events;
  }

  setAlpha(alpha: number): void {
    this.alpha = alpha;
  }

  view(): DriverView {
    return { prev: this.a, curr: this.b, alpha: this.alpha };
  }

  /**
   * Restart (Req 13 c4-c6, D8, Req 12 c12): a fresh initial state from the same config and
   * seed is copied into both buffers, so nothing interpolates from the old fight and the next
   * Tick already processes commands.
   */
  restart(): void {
    const s0 = createInitialState(this.cfg);
    copyStateInto(this.a, s0);
    copyStateInto(this.b, s0);
    this.events.length = 0;
  }
}
