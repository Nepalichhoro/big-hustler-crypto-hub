export type PublicKey = string;
export type Digest = string;
export type Round = number;
export type Stake = number;

export interface QC {
  hash: Digest;
  round: Round;
  votes: [PublicKey, string][];
}

export interface TC {
  round: Round;
  votes: [PublicKey, string, Round][];
}

export interface Block {
  qc: QC;
  tc?: TC;
  author: PublicKey;
  round: Round;
  payload: Digest[];
  signature: string;
}

export interface Vote {
  hash: Digest;
  round: Round;
  author: PublicKey;
  signature: string;
}

export interface Timeout {
  highQc: QC;
  round: Round;
  author: PublicKey;
  signature: string;
}

export type ConsensusMessage =
  | { type: "Propose"; block: Block }
  | { type: "Vote"; vote: Vote }
  | { type: "Timeout"; timeout: Timeout }
  | { type: "TC"; tc: TC }
  | { type: "SyncRequest"; missing: Digest; origin: PublicKey };
