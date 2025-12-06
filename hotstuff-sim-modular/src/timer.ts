export class Timer {
  constructor(private durationMs: number) {}

  reset(): void {
    // no-op in this simple TS demo;
    // caller just asks for a fresh wait() when needed.
  }

  async wait(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, this.durationMs));
  }
}
