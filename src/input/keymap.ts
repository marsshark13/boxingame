// Key bindings (Req 8 c1, c2; design §3.3; task 12.1). Matched by KeyboardEvent.code, which
// names the physical key, so Shift and Caps Lock never change the mapping. The binding list is
// reused later by the Controls screen (P3), so the shown controls cannot drift from these.
import { CMD } from '../sim/types';

export type InputKind =
  /** Delivered on every Tick while held (movement; block from P2). */
  | 'level'
  /** Delivered once on the first Tick after a press (attacks; slip from P2). */
  | 'edge';

export interface KeyBinding {
  action: 'move-left' | 'move-right' | 'jab';
  label: string;
  codes: readonly string[];
  bit: number;
  kind: InputKind;
}

export const KEY_BINDINGS: readonly KeyBinding[] = Object.freeze([
  { action: 'move-left', label: 'Move left', codes: ['KeyA', 'ArrowLeft'], bit: CMD.MoveLeft, kind: 'level' },
  { action: 'move-right', label: 'Move right', codes: ['KeyD', 'ArrowRight'], bit: CMD.MoveRight, kind: 'level' },
  { action: 'jab', label: 'Jab', codes: ['KeyJ'], bit: CMD.Jab, kind: 'edge' },
]);

const BY_CODE: ReadonlyMap<string, KeyBinding> = new Map(KEY_BINDINGS.flatMap((b) => b.codes.map((c) => [c, b] as const)));

/** The binding for a KeyboardEvent.code, or undefined for an unmapped key (Req 8 c10). */
export function bindingFor(code: string): KeyBinding | undefined {
  return BY_CODE.get(code);
}
