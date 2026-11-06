// Requests a minute per address, so one misbehaving client (or a scraper)
// can't starve the crews. In memory only: addresses are never logged or
// stored, and each count is dropped when its minute is over.

export class RateLimiter {
  private counts = new Map<string, { windowStart: number; n: number }>();

  constructor(
    private readonly perMinute: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Counts a request; false when this address is over its limit for the minute. */
  allow(key: string): boolean {
    const t = this.now();
    const c = this.counts.get(key);
    if (!c || t - c.windowStart >= 60_000) {
      this.counts.set(key, { windowStart: t, n: 1 });
      this.sweep(t);
      return true;
    }
    c.n++;
    return c.n <= this.perMinute;
  }

  /** Forgets finished minutes, now and then. */
  private sweep(t: number) {
    if (this.counts.size < 1000) return;
    for (const [k, c] of this.counts) if (t - c.windowStart >= 60_000) this.counts.delete(k);
  }
}
