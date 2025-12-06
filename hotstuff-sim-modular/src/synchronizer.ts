import { Block, Digest } from "./types";
import { Store } from "./store";
import { hash } from "./hash";

/**
 * Extremely simplified Synchronizer.
 * In Rust, it asks other nodes for missing parents and waits on the store.
 * Here we just try to read the parent from the store and if missing, we log.
 */
export class Synchronizer {
  constructor(private store: Store) {}

  private parentDigest(block: Block): Digest {
    // In the Rust version, the parent is block.qc.hash.
    return block.qc.hash;
  }

  async getParentBlock(block: Block): Promise<Block | null> {
    if (block.qc.round === 0) {
      // genesis parent
      return {
        qc: { hash: "genesis", round: 0, votes: [] },
        tc: undefined,
        author: "genesis",
        round: 0,
        payload: [],
        signature: "genesis-sig",
      };
    }
    const parentHash = this.parentDigest(block);
    const parent = this.store.read<Block>(parentHash);
    if (!parent) {
      console.log(
        `[Synchronizer] Missing parent for block ${hash(block)}, parent=${parentHash}`
      );
      return null;
    }
    return parent;
  }

  async getAncestors(block: Block): Promise<{ b0: Block; b1: Block } | null> {
    const b1 = await this.getParentBlock(block);
    if (!b1) return null;
    const b0 = await this.getParentBlock(b1);
    if (!b0) {
      throw new Error(
        "[Synchronizer] Ancestors invariant violated: parent of delivered block missing."
      );
    }
    return { b0, b1 };
  }
}
