// M1 Attack_Registry: the jab only (Req 5 c2; task 4.1). Authored in world units and Ticks.
// Values from design §P2.4.4, which states them as the Part 1 defaults. Tuning data, not rules.
import type { AttackDefinition } from '../types';

export const JAB: AttackDefinition = {
  id: 'jab',
  startup: 4,
  active: 2,
  recovery: 8,
  damage: 4,
  staminaCost: 60, // used from P2
  guardDamage: 60, // used from P2
  hitStun: 14,
  blockStun: 8, // used from P2
  hitbox: { offset: { x: 0.5, y: 1.45 }, size: { w: 0.4, h: 0.25 } },
};

export const M1_ATTACKS: readonly AttackDefinition[] = [JAB];
