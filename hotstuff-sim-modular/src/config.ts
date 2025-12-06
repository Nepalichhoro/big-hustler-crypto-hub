import { PublicKey, Stake } from "./types";

export type EpochNumber = number;

export interface Authority {
  stake: Stake;
  address: string; // simplified socket address
}

export interface Parameters {
  timeoutDelay: number;
  syncRetryDelay: number;
}

export function defaultParameters(): Parameters {
  return {
    timeoutDelay: 5000,
    syncRetryDelay: 10000
  };
}

export interface Committee {
  authorities: Map<PublicKey, Authority>;
  epoch: EpochNumber;
}

export function makeCommittee(
  info: Array<{ name: PublicKey; stake: Stake; address: string }>,
  epoch: EpochNumber
): Committee {
  const authorities = new Map<PublicKey, Authority>();
  for (const { name, stake, address } of info) {
    authorities.set(name, { stake, address });
  }
  return { authorities, epoch };
}

export function size(c: Committee): number {
  return c.authorities.size;
}

export function stake(c: Committee, name: PublicKey): Stake {
  return c.authorities.get(name)?.stake ?? 0;
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
  for (const [name, auth] of c.authorities.entries()) {
    if (name !== myself) {
      res.push({ name, address: auth.address });
    }
  }
  return res;
}
