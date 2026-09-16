/**
 * Deterministic RNG.
 *
 * Crits and daily quest draws are seeded from stable ids, so the same entry
 * always produces the same roll. Without this you could delete and re-add an
 * entry until it crit, which would wreck the whole point system.
 */

/** FNV-1a, 32-bit. */
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32: tiny, fast, good enough for game rolls. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seeded(seed: string): () => number {
  return mulberry32(hashString(seed));
}

/** Pick `n` distinct items using a seeded shuffle. */
export function sampleSeeded<T>(items: T[], n: number, seed: string): T[] {
  const rand = seeded(seed);
  const pool = items.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.min(n, pool.length));
}
