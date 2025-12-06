import { Channel } from "./channel";
import { Digest } from "./types";

export class SimpleMempool {
  constructor(public txOut: Channel<Digest>) {}

  async startFeeder(label: string): Promise<void> {
    let counter = 0;
    while (true) {
      await new Promise((r) => setTimeout(r, 300));
      const d: Digest = `${label}-tx-${counter++}`;
      this.txOut.send(d);
    }
  }
}
