import { QC, Vote, Round, Digest } from "./types";
import { Committee, quorumThreshold } from "./committee";

class QCMaker {
  weight = 0;
  used = new Set<string>();
  votes: [string, string][] = [];

  append(vote: Vote, committee: Committee, threshold: number): QC | null {
    if (this.used.has(vote.author)) {
      return null;
    }
    this.used.add(vote.author);
    this.votes.push([vote.author, vote.signature]);
    const stake = committee.authorities.get(vote.author)?.stake ?? 0;
    this.weight += stake;
    if (this.weight >= threshold) {
      const qc: QC = {
        hash: vote.hash,
        round: vote.round,
        votes: [...this.votes],
      };
      this.weight = 0; // emit only once
      return qc;
    }
    return null;
  }
}

export class Aggregator {
  // round -> digest -> QCMaker
  private votes = new Map<Round, Map<Digest, QCMaker>>();

  constructor(private committee: Committee) {}

  addVote(v: Vote): QC | null {
    let perRound = this.votes.get(v.round);
    if (!perRound) {
      perRound = new Map<Digest, QCMaker>();
      this.votes.set(v.round, perRound);
    }
    let maker = perRound.get(v.hash);
    if (!maker) {
      maker = new QCMaker();
      perRound.set(v.hash, maker);
    }
    return maker.append(v, this.committee, quorumThreshold(this.committee));
  }

  cleanup(currentRound: Round): void {
    for (const r of Array.from(this.votes.keys())) {
      if (r < currentRound) {
        this.votes.delete(r);
      }
    }
  }
}
