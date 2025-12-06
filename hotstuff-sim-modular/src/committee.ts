import { PublicKey, Stake } from "./types";

export interface Committee {
  authorities: Map<PublicKey, { stake: Stake }>;
}

export function quorumThreshold(c: Committee): Stake {
  let total = 0;
  for (const { stake } of c.authorities.values()) {
    total += stake;
  }
  return Math.floor((2 * total) / 3) + 1;
}
