import { afterEach, describe, expect, it, vi } from "vitest";
import { PayloadCache } from "./payload-cache";

afterEach(() => vi.useRealTimers());

describe("version payload cache", () => {
  it("coalesces concurrent loads and isolates versions and returned objects", async () => {
    const cache = new PayloadCache<{ text: string }>();
    const load = vi.fn(async () => ({ text: "original" }));
    const [first, second] = await Promise.all([
      cache.get("secret/v1", load), cache.get("secret/v1", load),
    ]);
    first.text = "changed";
    expect(second.text).toBe("original");
    expect((await cache.get("secret/v1", load)).text).toBe("original");
    expect(load).toHaveBeenCalledTimes(1);
    await cache.get("secret/v2", load);
    await cache.get("recreated-secret/v1", load);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it("reloads expired values and evicts entries at capacity", async () => {
    vi.useFakeTimers();
    const cache = new PayloadCache<number>(1000, 2);
    const load = vi.fn(async () => 1);
    await cache.get("a", load);
    await vi.advanceTimersByTimeAsync(1000);
    await cache.get("a", load);
    expect(load).toHaveBeenCalledTimes(2);
    await cache.get("b", load);
    await cache.get("c", load);
    await cache.get("a", load);
    expect(load).toHaveBeenCalledTimes(5);
  });

  it("does not cache failures", async () => {
    const cache = new PayloadCache<number>();
    await expect(cache.get("a", async () => { throw new Error("denied"); })).rejects.toThrow("denied");
    await expect(cache.get("a", async () => 42)).resolves.toBe(42);
  });
});
