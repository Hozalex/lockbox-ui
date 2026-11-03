/** Sliding budget per process: allow bursts, wait only when quota is exhausted. */
export class HuaweiRateLimiter {
  private starts: number[] = [];
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly limit = 240,
    private readonly windowMs = 60_000,
  ) {}

  wait(): Promise<void> {
    const turn = this.queue.then(async () => {
      for (;;) {
        const now = Date.now();
        this.starts = this.starts.filter((start) => now - start < this.windowMs);
        if (this.starts.length < this.limit) {
          this.starts.push(now);
          return;
        }
        const delay = this.starts[0] + this.windowMs - now;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    });
    this.queue = turn.catch(() => {});
    return turn;
  }
}
