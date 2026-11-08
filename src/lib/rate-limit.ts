// A small in-memory rate limit, per key (a browser's address, never stored): a window of `windowMs`, at most `limit`
// hits a key in it, and at most `maxKeys` keys remembered (the oldest forgotten first). One per server instance: on
// several instances, each counts its own, which bounds the writes anyway. Pure but for its state; time is given.

export type RateLimit = {
  /** Whether a hit of this key at this time is let through; counts it when it is. */
  allow: (key: string, now: number) => boolean;
};

export function rateLimit({ limit, windowMs, maxKeys }: { limit: number; windowMs: number; maxKeys: number }): RateLimit {
  const hits = new Map<string, { start: number; count: number }>();
  return {
    allow(key, now) {
      const entry = hits.get(key);
      if (entry === undefined || now - entry.start >= windowMs) {
        hits.delete(key);
        if (hits.size >= maxKeys) {
          // A Map keeps its insertion order: the first key is the oldest window.
          const oldest = hits.keys().next().value;
          if (oldest !== undefined) {
            hits.delete(oldest);
          }
        }
        hits.set(key, { start: now, count: 1 });
        return true;
      }
      if (entry.count >= limit) {
        return false;
      }
      entry.count++;
      return true;
    },
  };
}
