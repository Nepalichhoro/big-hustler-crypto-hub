import { PublicKey, Stake } from "./types";

export type EpochNumber = number;

export interface Authority {
  stake: Stake;
  address: string; // simplified: string instead of SocketAddr
}

export interface Committee {
  authorities: Map<PublicKey, Authority>;
  epoch: EpochNumber;
}

export function makeCommittee(
  entries: Array<{ name: PublicKey; stake: Stake; address: string }>,
  epoch: EpochNumber
): Committee {
  const authorities = new Map<PublicKey, Authority>();
  for (const { name, stake, address } of entries) {
    authorities.set(name, { stake, address });
  }
  return { authorities, epoch };
}

export function quorumThreshold(c: Committee): Stake {
  let total = 0;
  for (const { stake } of c.authorities.values()) {
    total += stake;
  }
  return Math.floor((2 * total) / 3) + 1;
}

export function address(c: Committee, name: PublicKey): string | undefined {
  return c.authorities.get(name)?.address;
}

export function broadcastAddresses(
  c: Committee,
  myself: PublicKey
): Array<{ name: PublicKey; address: string }> {
  const res: Array<{ name: PublicKey; address: string }> = [];
  for (const [pk, auth] of c.authorities.entries()) {
    if (pk !== myself) {
      res.push({ name: pk, address: auth.address });
    }
  }
  return res;
}
