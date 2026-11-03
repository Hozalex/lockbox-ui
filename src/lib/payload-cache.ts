/** Bounded, process-local version cache shared by provider implementations. */
export class PayloadCache<T> {
  private entries = new Map<string, { value: T; expires: number }>();
  private pending = new Map<string, Promise<T>>();

  constructor(private readonly ttlMs = 300_000, private readonly capacity = 100) {}

  async get(key: string, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(key);
    if (cached && cached.expires > Date.now()) return structuredClone(cached.value);
    this.entries.delete(key);
    let promise = this.pending.get(key);
    if (!promise) {
      promise = load().then((value) => {
        for (const [id, entry] of this.entries) {
          if (entry.expires <= Date.now()) this.entries.delete(id);
        }
        if (this.entries.size >= this.capacity) {
          this.entries.delete(this.entries.keys().next().value!);
        }
        this.entries.set(key, { value: structuredClone(value), expires: Date.now() + this.ttlMs });
        return value;
      }).finally(() => this.pending.delete(key));
      this.pending.set(key, promise);
    }
    return structuredClone(await promise);
  }
}
