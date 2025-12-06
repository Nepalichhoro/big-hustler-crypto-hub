import { Digest } from "./types";

type Waiter = (value: Uint8Array) => void;

export class Store {
  private data = new Map<Digest, Uint8Array>();
  private waiters = new Map<Digest, Waiter[]>();

  write(key: Digest, value: Uint8Array): void {
    this.data.set(key, value);
    const ws = this.waiters.get(key);
    if (ws) {
      for (const w of ws) {
        w(value);
      }
      this.waiters.delete(key);
    }
  }

  read(key: Digest): Uint8Array | undefined {
    return this.data.get(key);
  }

  async notifyRead(key: Digest): Promise<Uint8Array> {
    const existing = this.data.get(key);
    if (existing) {
      return existing;
    }
    return new Promise<Uint8Array>((resolve) => {
      const ws = this.waiters.get(key) ?? [];
      ws.push(resolve);
      this.waiters.set(key, ws);
    });
  }
}
