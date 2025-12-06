import { Committee } from "./committee";
import { PublicKey, Round } from "./types";

export class LeaderElector {
  private keys: PublicKey[];

  constructor(private committee: Committee) {
    this.keys = Array.from(committee.authorities.keys()).sort();
  }

  getLeader(round: Round): PublicKey {
    const n = this.keys.length;
    return this.keys[round % n];
  }
}
