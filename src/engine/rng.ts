/**
 * Seeded Mulberry32 Pseudo-Random Number Generator.
 * Deterministic: identical seed guarantees identical sequence across platforms.
 */

export class SeededRNG {
  private state: number;

  constructor(seed: number | string = Date.now()) {
    if (typeof seed === 'string') {
      this.state = SeededRNG.hashString(seed);
    } else {
      this.state = seed >>> 0;
    }
  }

  public static hashString(str: string): number {
    let hash = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      hash = Math.imul(hash ^ str.charCodeAt(i), 3432918353);
      hash = (hash << 13) | (hash >>> 19);
    }
    return hash >>> 0;
  }

  /**
   * Generates next float in range [0, 1)
   */
  public next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /**
   * Generates integer in range [min, max] inclusive
   */
  public nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /**
   * Picks random element from an array
   */
  public pick<T>(arr: readonly T[]): T {
    const idx = Math.floor(this.next() * arr.length);
    return arr[idx];
  }
}
