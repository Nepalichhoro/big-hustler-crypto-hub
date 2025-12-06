import { Digest } from "./types";

export function hash(obj: any): Digest {
  // Very simple non-cryptographic hash for simulation/demo only.
  return "h" + JSON.stringify(obj);
}
