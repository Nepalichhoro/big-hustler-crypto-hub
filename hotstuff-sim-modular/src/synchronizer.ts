import { Committee, broadcastAddresses } from "./config";
import { Block, ConsensusMessage, QC } from "./messages";
import { Digest, PublicKey, Round } from "./types";
import { Network } from "./network";
import { Store } from "./store";
import { Channel } from "./channel";
import { hashObject } from "./hash";

const TIMER_ACCURACY = 5000;

export class Synchronizer {
  private innerChannel: Channel<Block>;

  constructor(
    private name: PublicKey,
    private committee: Committee,
    private store: Store,
    private txLoopback: Channel<Block>,
    private syncRetryDelay: number,
    private network: Network
  ) {
    this.innerChannel = new Channel<Block>();
    const rxInner = this.innerChannel;
    const storeCopy = this.store;
    const txLoopbackCopy = this.txLoopback;
    const committeeCopy = this.committee;
    const nameCopy = this.name;
    const networkCopy = this.network;
    const syncRetryDelayCopy = this.syncRetryDelay;

    (async () => {
      const waiting = new Map<string, Digest>();
      const requests = new Map<Digest, number>();

      let lastTimer = Date.now();

      while (true) {
        const race = await Promise.race([
          rxInner.recv().then((b) => ({ kind: "block" as const, b })),
          new Promise<{ kind: "timer" }>((resolve) =>
            setTimeout(() => resolve({ kind: "timer" }), TIMER_ACCURACY)
          )
        ]);

        if (race.kind === "block") {
          const block = race.b;
          const digest = hashObject(block);
          if (waiting.has(digest)) continue;
          waiting.set(digest, block.parent());
          const parent = block.parent();
          if (!requests.has(parent)) {
            const now = Date.now();
            requests.set(parent, now);
            const addr = committeeCopy.authorities.get(block.author)?.address;
            const msg: ConsensusMessage = {
              type: "SyncRequest",
              missing: parent,
              origin: nameCopy
            };
            networkCopy.send(block.author, msg);
          }
        } else {
          const now = Date.now();
          if (now - lastTimer >= TIMER_ACCURACY) {
            lastTimer = now;
            for (const [digest, ts] of requests.entries()) {
              if (now - ts >= syncRetryDelayCopy) {
                const addresses = broadcastAddresses(committeeCopy, nameCopy).map(
                  (x) => x.name
                );
                for (const addr of addresses) {
                  const msg: ConsensusMessage = {
                    type: "SyncRequest",
                    missing: digest,
                    origin: nameCopy
                  };
                  networkCopy.send(addr, msg);
                }
              }
            }
          }
        }

        for (const [parent, ts] of requests.entries()) {
          const bytes = storeCopy.read(parent);
          if (bytes) {
            const block: Block = JSON.parse(Buffer.from(bytes).toString("utf8"));
            await txLoopbackCopy.send(block);
            requests.delete(parent);
          }
        }
      }
    })();
  }

  async waiter(waitOn: Digest, deliver: Block): Promise<Block> {
    await this.store.notifyRead(waitOn);
    return deliver;
  }

  async getParentBlock(block: Block): Promise<Block | null> {
    if (block.qc.equals(QC.genesis())) {
      return Block.genesis();
    }
    const parent = block.parent();
    const bytes = this.store.read(parent);
    if (bytes) {
      return JSON.parse(Buffer.from(bytes).toString("utf8"));
    }
    await this.innerChannel.send(block);
    return null;
  }

  async getAncestors(block: Block): Promise<{ b0: Block; b1: Block } | null> {
    const b1 = await this.getParentBlock(block);
    if (!b1) return null;
    const b0 = await this.getParentBlock(b1);
    if (!b0) throw new Error("We should have all ancestors of delivered blocks");
    return { b0, b1 };
  }
}
