// Deterministic seeded random numbers (mulberry32). Every random choice the
// world makes comes from one of these, so the same seed always builds the
// same city and the same traffic — screenshots are reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = mulberry32(seed);
  return {
    next,
    /** Float in [min, max). */
    range(min, max) { return min + next() * (max - min); },
    /** Integer in [min, max] inclusive. */
    int(min, max) { return Math.floor(min + next() * (max - min + 1)); },
    /** True with probability p. */
    chance(p) { return next() < p; },
    /** One element of an array. */
    pick(arr) { return arr[Math.floor(next() * arr.length)]; },
    /** Shuffle a copy of an array. */
    shuffled(arr) {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        const t = out[i]; out[i] = out[j]; out[j] = t;
      }
      return out;
    },
  };
}

/** Clamp a number into [min, max]. */
export function clamp(v, min, max) { return v < min ? min : v > max ? max : v; }
/** Linear interpolation. */
export function lerp(a, b, t) { return a + (b - a) * t; }
/** Shortest signed angle difference, in (-PI, PI]. */
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
/** Euclidean distance. */
export function dist(x1, y1, x2, y2) { return Math.hypot(x2 - x1, y2 - y1); }
