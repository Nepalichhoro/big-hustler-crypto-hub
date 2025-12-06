export class Channel<T> {
  private queue: T[] = [];
  private waiting: ((v: T) => void)[] = [];

  send(value: T): void {
    const resolver = this.waiting.shift();
    if (resolver) {
      resolver(value);
    } else {
      this.queue.push(value);
    }
  }

  async recv(): Promise<T> {
    if (this.queue.length > 0) {
      return this.queue.shift() as T;
    }
    return new Promise<T>((resolve) => this.waiting.push(resolve));
  }
}
