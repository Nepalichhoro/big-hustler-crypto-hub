import { Committee, address } from "./config";
import { Block, ConsensusMessage } from "./messages";
import { Digest, PublicKey } from "./types";
import { Network } from "./network";
import { Store } from "./store";
import { Channel } from "./channel";

export class Helper {
  constructor(
    private committee: Committee,
    private store: Store,
    private network: Network
  ) {}

  async run(rxRequests: Channel<{ digest: Digest; origin: PublicKey }>): Promise<void> {
    while (true) {
      const { digest, origin } = await rxRequests.recv();
      const addr = address(this.committee, origin);
      if (!addr) {
        console.warn(`[Helper] Unknown authority ${origin}`);
        continue;
      }
      const bytes = this.store.read(digest);
      if (!bytes) continue;
      // bytes contain serialized Block; here we just assume it's JSON string.
      const block: Block = JSON.parse(Buffer.from(bytes).toString("utf8"));
      const msg: ConsensusMessage = { type: "Propose", block };
      this.network.send(origin, msg);
    }
  }
}
