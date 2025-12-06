import { Committee } from "./committee";
import { Store } from "./store";
import { Digest, PublicKey, Block, ConsensusMessage } from "./types";
import { Network } from "./network";

export class Helper {
  constructor(
    private committee: Committee,
    private store: Store,
    private network: Network
  ) {}

  // In Rust, this listens on a channel of (digest, origin).
  // Here we expose a simple method you could call when a SyncRequest arrives.
  async handleSyncRequest(digest: Digest, origin: PublicKey): Promise<void> {
    const address = this.committee.authorities.get(origin)?.address;
    if (!address) {
      console.warn(`[Helper] Unknown authority ${origin}`);
      return;
    }

    const bytes = this.store.read<Block>(digest);
    if (!bytes) {
      console.log(`[Helper] Missing block ${digest}, cannot help ${origin}`);
      return;
    }

    const msg: ConsensusMessage = { type: "Propose", block: bytes };
    this.network.send(origin, msg);
  }
}
