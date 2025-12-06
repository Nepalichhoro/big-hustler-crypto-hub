import { Committee, quorumThreshold, stake } from "./config";
import { Digest, PublicKey, Round, Stake } from "./types";
import { QC, TC, Timeout, Vote } from "./messages";

class QCMaker {
  weight: Stake = 0;
  votes: [PublicKey, string][] = [];
  used = new Set<PublicKey>();

  append(vote: Vote, committee: Committee, threshold: Stake): QC | null {
    const author = vote.author;
    if (this.used.has(author)) {
      throw new Error(`Authority reuse: ${author}`);
    }
    this.used.add(author);
    this.votes.push([author, vote.signature.value]);
    this.weight += stake(committee, author);
    if (this.weight >= threshold) {
      this.weight = 0;
      return new QC(vote.hash, vote.round, this.votes.slice());
    }
    return null;
  }
}

class TCMaker {
  weight: Stake = 0;
  votes: [PublicKey, string, Round][] = [];
  used = new Set<PublicKey>();

  append(timeout: Timeout, committee: Committee, threshold: Stake): TC | null {
    const author = timeout.author;
    if (this.used.has(author)) {
      throw new Error(`Authority reuse: ${author}`);
    }
    this.used.add(author);
    this.votes.push([author, timeout.signature.value, timeout.highQc.round]);
    this.weight += stake(committee, author);
    if (this.weight >= threshold) {
      this.weight = 0;
      return new TC(timeout.round, this.votes.slice());
    }
    return null;
  }
}

export class Aggregator {
  private votesAggregators = new Map<Round, Map<Digest, QCMaker>>();
  private timeoutsAggregators = new Map<Round, TCMaker>();

  constructor(private committee: Committee) {}

  addVote(vote: Vote): QC | null {
    const roundMap =
      this.votesAggregators.get(vote.round) ||
      (this.votesAggregators.set(vote.round, new Map()).get(vote.round) as Map<
        Digest,
        QCMaker
      >);
    const digest = vote.hash;
    let maker = roundMap.get(digest);
    if (!maker) {
      maker = new QCMaker();
      roundMap.set(digest, maker);
    }
    return maker.append(vote, this.committee, quorumThreshold(this.committee));
  }

  addTimeout(timeout: Timeout): TC | null {
    let maker = this.timeoutsAggregators.get(timeout.round);
    if (!maker) {
      maker = new TCMaker();
      this.timeoutsAggregators.set(timeout.round, maker);
    }
    return maker.append(timeout, this.committee, quorumThreshold(this.committee));
  }

  cleanup(round: Round): void {
    for (const r of Array.from(this.votesAggregators.keys())) {
      if (r < round) this.votesAggregators.delete(r);
    }
    for (const r of Array.from(this.timeoutsAggregators.keys())) {
      if (r < round) this.timeoutsAggregators.delete(r);
    }
  }
}
