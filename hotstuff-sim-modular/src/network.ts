import { ConsensusMessage, PublicKey } from "./types";
import { Committee } from "./committee";

export class Network {
  private handlers = new Map<PublicKey, (msg: ConsensusMessage) => void>();

  register(name: PublicKey, handler: (msg: ConsensusMessage) => void): void {
    this.handlers.set(name, handler);
  }

  send(to: PublicKey, msg: ConsensusMessage): void {
    const h = this.handlers.get(to);
    if (h) {
      h(msg);
    }
  }

  broadcast(from: PublicKey, committee: Committee, msg: ConsensusMessage): void {
    for (const [pk] of committee.authorities) {
      if (pk !== from) {
        this.send(pk, msg);
      }
    }
  }
}
