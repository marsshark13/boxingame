// Pure core of the Input_System (design §3.3; Req 8 c5-c10; D43; task 12.1).
//
// Keyboard events arrive between frames and are fed in here; sampleTick() is called once per
// Tick and returns that Tick's command mask.
// - Edge keys (the jab): a press is latched and delivered exactly once, on the next sample,
//   even if the key is released first. Auto-repeat is ignored, and a key gives no new press
//   until it is released. Only the first-arriving edge press per sample counts (Req 8 c5, c9).
// - Level keys (movement): delivered on every sample taken while held, so not on the first
//   sample after the release, and a press and release between two samples gives nothing
//   (Req 8 c6, D43). Both directions held gives neither (Req 8 c8).
// - blur()/reset(): every key counts as released and nothing is delivered for a key until it
//   is pressed again (Req 8 c7).
import { bindingFor } from './keymap';
import { CMD, type CommandMask } from '../sim/types';

export class InputSampler {
  /** Mapped keys currently held, by KeyboardEvent.code. */
  private readonly held = new Set<string>();
  /** The latched edge command for the next sample (0 = none). */
  private pendingEdge = 0;

  keyDown(code: string, repeat = false): void {
    if (repeat) return; // auto-repeat is ignored
    const b = bindingFor(code);
    if (b === undefined) return; // unmapped keys deliver nothing (Req 8 c10)
    if (this.held.has(code)) return; // no new press until released
    this.held.add(code);
    if (b.kind === 'edge' && this.pendingEdge === 0) this.pendingEdge = b.bit; // first-arriving wins (Req 8 c9)
  }

  keyUp(code: string): void {
    this.held.delete(code);
  }

  /** Window focus lost: treat all keys as released and drop any latched press (Req 8 c7). */
  blur(): void {
    this.reset();
  }

  reset(): void {
    this.held.clear();
    this.pendingEdge = 0;
  }

  /** The command mask for one Tick. Consumes the latched edge press. */
  sampleTick(): CommandMask {
    let left = false;
    let right = false;
    for (const code of this.held) {
      const b = bindingFor(code)!;
      if (b.kind !== 'level') continue;
      if (b.bit === CMD.MoveLeft) left = true;
      else if (b.bit === CMD.MoveRight) right = true;
    }
    let mask = this.pendingEdge;
    this.pendingEdge = 0;
    if (left !== right) mask |= left ? CMD.MoveLeft : CMD.MoveRight;
    return mask;
  }
}
