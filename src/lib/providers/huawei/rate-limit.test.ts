import { afterEach, describe, expect, it, vi } from "vitest";
import { HuaweiRateLimiter } from "./rate-limit";

afterEach(() => vi.useRealTimers());

describe("Huawei request pacing", () => {
  it("spaces concurrent callers instead of sending a burst", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const limiter = new HuaweiRateLimiter();
    const starts: number[] = [];
    const calls = Array.from({ length: 5 }, async () => {
      await limiter.wait();
      starts.push(Date.now());
    });
    await vi.runAllTimersAsync();
    await Promise.all(calls);
    expect(starts).toEqual([0, 250, 500, 750, 1000]);
  });

  it("allows an immediate call after an idle period", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const limiter = new HuaweiRateLimiter();
    await limiter.wait();
    await vi.advanceTimersByTimeAsync(1000);
    await limiter.wait();
    expect(Date.now()).toBe(1000);
  });
});
