/**
 * Deterministic PRNG utilities.
 *
 * The whole mock dataset is generated from a single seed so that every reload,
 * every teammate's machine, and every demo run shows identical numbers. That
 * matters: a jury walking through a trajectory should see the same path the
 * presenter rehearsed.
 */

export interface Rng {
  (): number;
  int(minInclusive: number, maxInclusive: number): number;
  float(min: number, max: number): number;
  bool(probability: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Picks an index using relative weights. */
  weightedIndex(weights: readonly number[]): number;
  /** Picks an entry from [value, weight] pairs. */
  weighted<T>(entries: readonly (readonly [T, number])[]): T;
  /** Normally distributed value, clamped to +/- 3 sigma. */
  gaussian(mean: number, stdDev: number): number;
  shuffle<T>(items: T[]): T[];
  /** Distinct sample of `count` items without replacement. */
  sample<T>(items: readonly T[], count: number): T[];
}

/** mulberry32 — small, fast, good enough distribution for simulation. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng = next as Rng;

  rng.int = (min, max) => Math.floor(next() * (max - min + 1)) + min;
  rng.float = (min, max) => next() * (max - min) + min;
  rng.bool = (probability) => next() < probability;
  rng.pick = (items) => items[Math.floor(next() * items.length)];

  rng.weightedIndex = (weights) => {
    const total = weights.reduce((sum, w) => sum + w, 0);
    let target = next() * total;
    for (let i = 0; i < weights.length; i++) {
      target -= weights[i];
      if (target <= 0) return i;
    }
    return weights.length - 1;
  };

  rng.weighted = (entries) => entries[rng.weightedIndex(entries.map((e) => e[1]))][0];

  rng.gaussian = (mean, stdDev) => {
    // Box-Muller. u1 must be non-zero to avoid log(0).
    const u1 = next() || 1e-9;
    const u2 = next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + stdDev * Math.max(-3, Math.min(3, z));
  };

  rng.shuffle = (items) => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };

  rng.sample = (items, count) => rng.shuffle([...items]).slice(0, Math.min(count, items.length));

  return rng;
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
