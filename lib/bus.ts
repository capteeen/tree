import type { TreeEvent } from './types';

type Listener = (e: TreeEvent) => void;
const listeners = new Set<Listener>();

/** Every animation subscribes here, so each glow on screen is one real event. */
export function onEvent(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emit(e: TreeEvent) {
  listeners.forEach((fn) => fn(e));
}
