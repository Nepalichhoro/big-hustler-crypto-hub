import {
  Block,
  Vote,
  QC,
  Timeout,
  TC,
  ConsensusMessage,
  PublicKey,
  Round,
  Digest,
} from "./types";
import { hash } from "./hash";
import { Committee, quorumThreshold } from "./committee";

// In this simplified TS version, types.ts already defines the message shapes.
// Here we just re-export them under a 'messages' module for familiarity
// with the Rust structure, and add a few helper functions.

export type { Block, Vote, QC, Timeout, TC, ConsensusMessage, PublicKey, Round, Digest };

// Simple constructors / helpers mirroring the Rust intent (highly simplified).
export function makeBlock(
  qc: QC,
  author: PublicKey,
  round: Round,
  payload: Digest[]
): Block {
  return {
    qc,
    tc: undefined,
    author,
    round,
    payload,
    signature: `sig(${author}:${round})`,
  };
}

export function makeVote(block: Block, author: PublicKey): Vote {
  return {
    hash: hash(block),
    round: block.round,
    author,
    signature: `vote-sig(${author}:${block.round})`,
  };
}

export function verifyQC(qc: QC, committee: Committee): boolean {
  let weight = 0;
  const used = new Set<PublicKey>();
  for (const [name] of qc.votes) {
    if (used.has(name)) return false;
    used.add(name);
    const stake = committee.authorities.get(name)?.stake ?? 0;
    if (stake <= 0) return false;
    weight += stake;
  }
  return weight >= quorumThreshold(committee);
}
