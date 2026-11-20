// The only DOM-bound part of the Input_System (design §3.3; task 12.2): window keydown, keyup,
// and blur listeners forwarding to an InputSampler. Returns a disposer.
import type { InputSampler } from './inputSampler';

export interface KeyboardTarget {
  addEventListener(type: 'keydown' | 'keyup', listener: (e: KeyboardEvent) => void): void;
  addEventListener(type: 'blur', listener: () => void): void;
  removeEventListener(type: 'keydown' | 'keyup', listener: (e: KeyboardEvent) => void): void;
  removeEventListener(type: 'blur', listener: () => void): void;
}

export function attachKeyboard(sampler: InputSampler, target: KeyboardTarget = window): () => void {
  const down = (e: KeyboardEvent) => sampler.keyDown(e.code, e.repeat);
  const up = (e: KeyboardEvent) => sampler.keyUp(e.code);
  const blur = () => sampler.blur();
  target.addEventListener('keydown', down);
  target.addEventListener('keyup', up);
  target.addEventListener('blur', blur);
  return () => {
    target.removeEventListener('keydown', down);
    target.removeEventListener('keyup', up);
    target.removeEventListener('blur', blur);
  };
}
