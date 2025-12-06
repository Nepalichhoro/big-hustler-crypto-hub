import { Digest } from "./types";

export class Store {
  private data = new Map<Digest, any>();

  write(key: Digest, value: any): void {
    this.data.set(key, value);
  }

  read<T>(key: Digest): T | undefined {
    return this.data.get(key);
  }
}
