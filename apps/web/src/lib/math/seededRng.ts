// src/lib/math/seededRng.ts
export function xmur3(str: string) {
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

export function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed: string) {
  const seedFn = xmur3(seed);
  return mulberry32(seedFn());
}

export function seededGrid(rows: number, cols: number, seed: string) {
  const r = Math.max(1, rows | 0);
  const c = Math.max(1, cols | 0);
  const rand = makeRng(seed);

  return Array.from({ length: r }, () =>
    Array.from({ length: c }, () => {
      const v = rand() * 4 - 2; // [-2, 2)
      return v.toFixed(2);
    })
  );
}

export function seededNoise(rows: number, cols: number, seed: string) {
  const r = Math.max(1, rows | 0);
  const c = Math.max(1, cols | 0);
  const rand = makeRng(seed);

  return Array.from({ length: r }, () =>
    Array.from({ length: c }, () => rand() * 2 - 1)
  );
}
