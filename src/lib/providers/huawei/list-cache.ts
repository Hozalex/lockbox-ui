/** Metadata only. Invalidation also detaches in-flight reads after a write. */
export class ListCache<T> {
  private entries = new Map<string, { expires: number; value: Promise<T> }>();

  constructor(private readonly ttlMs = 15_000) {}

  async get(key: string, load: () => Promise<T>): Promise<T> {
    let entry = this.entries.get(key);
    if (!entry || entry.expires <= Date.now()) {
      // TTL starts at completion: a slow cold scan must still be reusable.
      entry = { expires: Infinity, value: Promise.resolve().then(load) };
      const current = entry;
      this.entries.set(key, current);
      current.value = current.value.then((value) => {
        current.expires = Date.now() + this.ttlMs;
        return value;
      }).catch((error) => {
        if (this.entries.get(key) === current) this.entries.delete(key);
        throw error;
      });
    }
    return structuredClone(await entry.value);
  }

  clear() {
    this.entries.clear();
  }
}
