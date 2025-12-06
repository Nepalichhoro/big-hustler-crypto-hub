import { Digest, Round } from "./types";
import { Channel } from "./channel";
import { Block } from "./messages";
import { Store } from "./store";

export enum ConsensusMempoolMessageType {
  Synchronize = "Synchronize",
  Cleanup = "Cleanup"
}

export type ConsensusMempoolMessage =
  | { type: ConsensusMempoolMessageType.Synchronize; missing: Digest[]; author: string }
  | { type: ConsensusMempoolMessageType.Cleanup; round: Round };

enum PayloadWaiterMessageType {
  Wait = "Wait",
  Cleanup = "Cleanup"
}

type PayloadWaiterMessage =
  | { type: PayloadWaiterMessageType.Wait; missing: Digest[]; block: Block }
  | { type: PayloadWaiterMessageType.Cleanup; round: Round };

export class MempoolDriver {
  private txPayloadWaiter: Channel<PayloadWaiterMessage>;

  constructor(
    private store: Store,
    private txMempool: Channel<ConsensusMempoolMessage>,
    txLoopback: Channel<Block>
  ) {
    this.txPayloadWaiter = new Channel<PayloadWaiterMessage>();
    const rxPayloadWaiter = this.txPayloadWaiter;
    const storeCopy = this.store;
    (async () => {
      await PayloadWaiter.run(storeCopy, rxPayloadWaiter, txLoopback);
    })();
  }

  async verify(block: Block): Promise<boolean> {
    const missing: Digest[] = [];
    for (const x of block.payload) {
      if (!this.store.read(x)) {
        missing.push(x);
      }
    }
    if (missing.length === 0) return true;

    await this.txMempool.send({
      type: ConsensusMempoolMessageType.Synchronize,
      missing: missing.slice(),
      author: block.author
    });

    await this.txPayloadWaiter.send({
      type: PayloadWaiterMessageType.Wait,
      missing: missing.slice(),
      block
    });

    return false;
  }

  async cleanup(round: Round): Promise<void> {
    await this.txMempool.send({
      type: ConsensusMempoolMessageType.Cleanup,
      round
    });
    await this.txPayloadWaiter.send({
      type: PayloadWaiterMessageType.Cleanup,
      round
    });
  }
}

class PayloadWaiter {
  static async waiter(
    missing: Digest[],
    store: Store,
    deliver: Block,
    cancel: Channel<void>
  ): Promise<Block | null> {
    const waits = missing.map((d) => store.notifyRead(d));
    const all = Promise.all(waits);
    const cancelP = cancel.recv();
    const winner = await Promise.race([all.then(() => deliver), cancelP.then(() => null)]);
    return winner;
  }

  static async run(
    store: Store,
    rxMessage: Channel<PayloadWaiterMessage>,
    txLoopback: Channel<Block>
  ): Promise<void> {
    const waiting: Array<Promise<Block | null>> = [];
    const pending = new Map<string, { round: Round; cancel: Channel<void> }>();

    while (true) {
      const msg = await rxMessage.recv();
      if (msg.type === PayloadWaiterMessageType.Wait) {
        const block = msg.block;
        const digest = block.digest();
        if (pending.has(digest)) continue;
        const cancelChan = new Channel<void>();
        pending.set(digest, { round: block.round, cancel: cancelChan });
        const fut = this.waiter(msg.missing.slice(), store, block, cancelChan);
        waiting.push(
          (async () => {
            const result = await fut;
            if (result) {
              pending.delete(result.digest());
              await txLoopback.send(result);
            }
            return result;
          })()
        );
      } else if (msg.type === PayloadWaiterMessageType.Cleanup) {
        const round = msg.round;
        for (const [d, { round: r, cancel }] of pending.entries()) {
          if (r <= round) {
            await cancel.send();
            pending.delete(d);
          }
        }
      }
    }
  }
}
