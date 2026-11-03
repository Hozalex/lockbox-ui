import { afterEach, describe, expect, it, vi } from "vitest";
import { ListCache } from "./list-cache";

afterEach(() => vi.useRealTimers());

describe("Huawei metadata list cache", () => {
  it("shares concurrent scans and starts TTL after a slow scan finishes", async () => {
    vi.useFakeTimers();
    const cache = new ListCache<string[]>(1000);
    const load = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      return ["metadata"];
    });
    const first = cache.get("scan", load);
    const second = cache.get("scan", load);
    await vi.advanceTimersByTimeAsync(30_000);
    const result = await first;
    result.push("changed");
    expect(await second).toEqual(["metadata"]);
    expect(await cache.get("scan", load)).toEqual(["metadata"]);
    expect(load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    const expired = cache.get("scan", load);
    await vi.runAllTimersAsync();
    await expired;
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("does not restore stale in-flight results after a mutation", async () => {
    const cache = new ListCache<string>();
    let finish!: (value: string) => void;
    const pending = cache.get("scan", () => new Promise<string>(resolve => { finish = resolve; }));
    await Promise.resolve();
    cache.clear();
    expect(await cache.get("scan", async () => "new")).toBe("new");
    finish("old");
    await pending;
    expect(await cache.get("scan", async () => "unexpected")).toBe("new");
  });

  it("retries failed scans and isolates scopes", async () => {
    const cache = new ListCache<string>();
    await expect(cache.get("a", async () => { throw new Error("denied"); })).rejects.toThrow("denied");
    expect(await cache.get("a", async () => "a")).toBe("a");
    expect(await cache.get("b", async () => "b")).toBe("b");
  });
});
