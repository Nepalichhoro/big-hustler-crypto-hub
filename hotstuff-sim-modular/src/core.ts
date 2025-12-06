import { Aggregator } from "./aggregator";
import { Committee } from "./committee";
import { LeaderElector } from "./leaderElector";
import { Store } from "./store";
import { Channel } from "./channel";
import {
  Block,
  ConsensusMessage,
  QC,
  Round,
  Vote,
  PublicKey,
} from "./types";
import { hash } from "./hash";
import { ProposerMessage } from "./proposer";
import { Network } from "./network";

export class Core {
  private round: Round = 1;
  private lastVotedRound: Round = 0;
  private lastCommittedRound: Round = 0;
  private highQc: QC = { hash: "genesis", round: 0, votes: [] };

  private aggregator: Aggregator;

  constructor(
    private name: PublicKey,
    private committee: Committee,
    private leaderElector: LeaderElector,
    private store: Store,
    private rxConsensus: Channel<ConsensusMessage>,
    private rxLoopback: Channel<Block>,
    private txProposer: Channel<ProposerMessage>,
    private network: Network
  ) {
    this.aggregator = new Aggregator(committee);
  }

  private storeBlock(block: Block): void {
    const d = hash(block);
    this.store.write(d, block);
  }

  private canVote(block: Block): boolean {
    if (block.round <= this.lastVotedRound) {
      return false;
    }
    if (block.qc.round + 1 !== block.round) {
      return false;
    }
    return true;
  }

  private makeVote(block: Block): Vote | null {
    if (!this.canVote(block)) {
      return null;
    }
    this.lastVotedRound = block.round;
    return {
      hash: hash(block),
      round: block.round,
      author: this.name,
      signature: `vote-sig(${this.name}:${block.round})`,
    };
  }

  private commit(block: Block): void {
    if (block.round <= this.lastCommittedRound) {
      return;
    }
    this.lastCommittedRound = block.round;
    console.log(`[Core ${this.name}] COMMIT block r=${block.round}`);
  }

  private async processBlock(block: Block): Promise<void> {
    this.storeBlock(block);

    if (
      block.qc.round === block.round - 1 &&
      block.qc.round > this.lastCommittedRound
    ) {
      this.commit(block);
    }

    if (block.round !== this.round) {
      return;
    }

    const vote = this.makeVote(block);
    if (!vote) {
      return;
    }

    const nextLeader = this.leaderElector.getLeader(this.round + 1);
    if (nextLeader === this.name) {
      await this.handleVote(vote);
    } else {
      this.network.send(nextLeader, { type: "Vote", vote });
    }
  }

  private async handleVote(v: Vote): Promise<void> {
    const qc = this.aggregator.addVote(v);
    if (!qc) {
      return;
    }

    console.log(`[Core ${this.name}] Assembled QC for round ${qc.round}`);

    this.highQc = qc;
    this.round = qc.round + 1;
    this.aggregator.cleanup(this.round);

    if (this.leaderElector.getLeader(this.round) === this.name) {
      this.txProposer.send({
        type: "Make",
        round: this.round,
        qc: this.highQc,
      });
    }
  }

  private async handlePropose(block: Block): Promise<void> {
    const leader = this.leaderElector.getLeader(block.round);
    if (block.author !== leader) {
      console.log(
        `[Core ${this.name}] Wrong leader for round ${block.round}, ignoring`
      );
      return;
    }

    console.log(
      `[Core ${this.name}] Received proposal r=${block.round} from ${block.author}`
    );
    await this.processBlock(block);
  }

  async run(): Promise<void> {
    if (this.leaderElector.getLeader(this.round) === this.name) {
      this.txProposer.send({
        type: "Make",
        round: this.round,
        qc: this.highQc,
      });
    }

    while (true) {
      const race = await Promise.race([
        this.rxConsensus.recv().then((m) => ({ kind: "net" as const, m })),
        this.rxLoopback.recv().then((b) => ({ kind: "loop" as const, b })),
      ]);

      if (race.kind === "net") {
        const m = race.m;
        if (m.type === "Propose") {
          await this.handlePropose(m.block);
        } else if (m.type === "Vote") {
          await this.handleVote(m.vote);
        }
      } else {
        await this.processBlock(race.b);
      }
    }
  }
}
