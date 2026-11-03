import { afterEach, describe, expect, it, vi } from "vitest";
import { HuaweiRateLimiter } from "./rate-limit";

afterEach(() => vi.useRealTimers());

describe("Huawei request budget", () => {
  it("allows concurrent requests immediately while budget is available", async () => {
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
    expect(starts).toEqual([0, 0, 0, 0, 0]);
  });

  it("holds concurrent overflow until the oldest requests leave the window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const limiter = new HuaweiRateLimiter(2, 60_000);
    const starts: number[] = [];
    const calls = Array.from({ length: 5 }, async () => {
      await limiter.wait();
      starts.push(Date.now());
    });
    await vi.advanceTimersByTimeAsync(59_999);
    expect(starts).toEqual([0, 0]);
    await vi.runAllTimersAsync();
    await Promise.all(calls);
    expect(starts).toEqual([0, 0, 60_000, 60_000, 120_000]);
  });

  it("expires individual requests rather than resetting a fixed minute bucket", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const limiter = new HuaweiRateLimiter(2, 60_000);
    await limiter.wait();
    await vi.advanceTimersByTimeAsync(30_000);
    await limiter.wait();
    const next = limiter.wait();
    await vi.advanceTimersByTimeAsync(30_000);
    await next;
    const last = limiter.wait();
    await vi.runAllTimersAsync();
    await last;
    expect(Date.now()).toBe(90_000);
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
