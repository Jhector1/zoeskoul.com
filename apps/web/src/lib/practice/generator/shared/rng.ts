// Deterministic RNG you can seed (so picks are reproducible per session/key if you want).
// No hardcoding of topics/archetypes here — this is purely a utility.




export type WeightedItem<T> = { value: T; w: number };

export type RNG = {
  /** float in [0, 1) */
  next: () => number;

  /** float in [0, 1) */
  float: () => number;

  /** int in [min, max] inclusive */
  int: (min: number, max: number) => number;

  /** true with probability p (default 0.5) */
  bool: (p?: number) => boolean;

  /** pick one item uniformly (throws on empty) */
  pick: <T>(arr: readonly T[]) => T;

  /** returns a new shuffled copy */
  shuffle: <T>(arr: readonly T[]) => T[];

  /** in-place shuffle */
  shuffleInPlace: <T>(arr: T[]) => T[];

  /** weighted pick by positive weights (throws if none valid) */
  weighted: <T>(items: readonly WeightedItem<T>[]) => T;

  /** stable derivation of a child rng */
  fork: (salt: string) => RNG;
  step: (min: number, max: number, step: number) => number;

  /** expose seed string (debug) */
  seed: string;
};

/**
 * Deterministic string -> 32-bit seed hash.
 * xmur3: small, fast, good enough for practice content.
 */
function xmur3(str: string) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/**
 * mulberry32: simple PRNG from a 32-bit seed.
 * Returns float in [0,1).
 */
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  return x;
}

export function makeRng(seed: string): RNG {
  const seedStr = String(seed ?? "default");
  const seedFn = xmur3(seedStr);
  const s32 = seedFn(); // 32-bit
  const rnd = mulberry32(s32);

  const api: RNG = {
    seed: seedStr,
    step: (min: number, max: number, step: number) => {
      const lo = Number(min);
      const hi = Number(max);
      const st = Number(step);

      if (!Number.isFinite(lo) || !Number.isFinite(hi) || !Number.isFinite(st)) {
        throw new Error(`rng.step(min,max,step) requires finite numbers. got min=${min} max=${max} step=${step}`);
      }
      if (!(st > 0)) throw new Error(`rng.step(): step must be > 0 (got ${step})`);

      const a = Math.min(lo, hi);
      const b = Math.max(lo, hi);

      // number of step slots in [a,b]
      const n = Math.floor((b - a) / st);
      const k = api.int(0, n);
      const v = a + k * st;

      // reduce floating drift
      return Math.round(v / st) * st;
    },

    next: () => rnd(),
    float: () => rnd(),

    int: (min: number, max: number) => {
      const a = Math.floor(min);
      const b = Math.floor(max);
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        throw new Error(`rng.int(min,max) requires finite ints. got min=${min} max=${max}`);
      }
      const lo = Math.min(a, b);
      const hi = Math.max(a, b);
      // inclusive range
      const span = hi - lo + 1;
      return lo + Math.floor(rnd() * span);
    },

    bool: (p = 0.5) => {
      const pp = clamp01(Number(p));
      return rnd() < pp;
    },

    pick: <T>(arr: readonly T[]) => {
      if (!arr || arr.length === 0) throw new Error("rng.pick() called with empty array");
      const i = Math.floor(rnd() * arr.length);
      return arr[i] as T;
    },

    shuffle: <T>(arr: readonly T[]) => {
      const out = Array.from(arr);
      api.shuffleInPlace(out);
      return out;
    },

    shuffleInPlace: <T>(arr: T[]) => {
      // Fisher–Yates
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const tmp = arr[i];
        arr[i] = arr[j];
        arr[j] = tmp;
      }
      return arr;
    },

    weighted: <T>(items: readonly WeightedItem<T>[]) => {
      if (!items || items.length === 0) throw new Error("rng.weighted() called with empty items");

      // only count positive, finite weights
      let total = 0;
      for (const it of items) {
        const w = Number(it?.w);
        if (Number.isFinite(w) && w > 0) total += w;
      }
      if (!(total > 0)) {
        throw new Error("rng.weighted() requires at least one item with positive finite weight");
      }

      let r = rnd() * total;
      for (const it of items) {
        const w = Number(it?.w);
        if (!Number.isFinite(w) || w <= 0) continue;
        r -= w;
        if (r <= 0) return it.value;
      }

      // floating point fallthrough: return last valid
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        const w = Number(it?.w);
        if (Number.isFinite(w) && w > 0) return it.value;
      }
      // unreachable because total>0 above
      throw new Error("rng.weighted() internal error");
    },

    fork: (salt: string) => makeRng(`${seedStr}::${String(salt ?? "")}`),
  };

  return api;
}
// export type { RNG, WeightedItem } from "@/lib/practice/makeRng";
// export { makeRng } from "@/lib/practice/makeRng";