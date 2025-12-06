import { Committee } from "./config";
import { PublicKey, Round } from "./types";

export class RRLeaderElector {
  private keys: PublicKey[];

  constructor(private committee: Committee) {
    this.keys = Array.from(this.committee.authorities.keys()).sort();
  }

  getLeader(round: Round): PublicKey {
    const idx = round % this.keys.length;
    return this.keys[idx];
  }
}

export type LeaderElector = RRLeaderElector;
