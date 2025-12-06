import { PublicKey } from "./types";
import { Committee } from "./committee";
import { Store } from "./store";
import { Network } from "./network";
import { makeNode } from "./node";

/**
 * This is a simplified analogue of the Rust `Consensus::spawn`.
 * In the Rust code, it wires:
 *  - NetworkReceiver
 *  - Core
 *  - Proposer
 *  - Helper
 *  - MempoolDriver
 * Here we reuse `makeNode` which already wires Core + Proposer + Mempool.
 */
export class Consensus {
  static spawn(
    name: PublicKey,
    committee: Committee,
    store: Store,
    network: Network
  ): void {
    // For now, we ignore Parameters, tx_commit, rx_mempool, etc.
    // and delegate to makeNode which sets up the full mini-node.
    makeNode(name, committee, network);
    console.log(`[Consensus] Spawned node ${name}`);
  }
}
