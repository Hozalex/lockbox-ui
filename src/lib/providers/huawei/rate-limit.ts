/** Pace starts to 240 requests/minute per process, leaving quota headroom. */
export class HuaweiRateLimiter {
  private nextStart = 0;
  private queue: Promise<void> = Promise.resolve();

  wait(): Promise<void> {
    const turn = this.queue.then(async () => {
      const delay = this.nextStart - Date.now();
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      this.nextStart = Date.now() + 250;
    });
    this.queue = turn.catch(() => {});
    return turn;
  }
}
