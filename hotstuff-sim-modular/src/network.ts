import { ConsensusMessage, PublicKey } from "./messages";

type Handler = (msg: ConsensusMessage) => void;

export class Network {
  private handlers = new Map<PublicKey, Handler>();

  register(name: PublicKey, handler: Handler): void {
    this.handlers.set(name, handler);
  }

  send(to: PublicKey, msg: ConsensusMessage): void {
    const h = this.handlers.get(to);
    if (h) {
      h(msg);
    }
  }

  broadcast(from: PublicKey, msg: ConsensusMessage): void {
    for (const [name, handler] of this.handlers.entries()) {
      if (name !== from) {
        handler(msg);
      }
    }
  }
}
