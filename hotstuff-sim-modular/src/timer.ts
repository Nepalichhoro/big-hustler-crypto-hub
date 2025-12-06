export class Timer {
  private durationMs: number;
  private deadline: number;

  constructor(durationMs: number) {
    this.durationMs = durationMs;
    this.deadline = Date.now() + durationMs;
  }

  reset(): void {
    this.deadline = Date.now() + this.durationMs;
  }

  // Awaitable: resolves when the deadline passes.
  async wait(): Promise<void> {
    while (true) {
      const now = Date.now();
      const remaining = this.deadline - now;
      if (remaining <= 0) return;
      await new Promise((r) => setTimeout(r, remaining));
    }
  }
}
