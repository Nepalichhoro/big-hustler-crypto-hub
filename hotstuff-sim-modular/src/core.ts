import { Aggregator } from "./aggregator";
import { Committee, stake } from "./config";
import { LeaderElector } from "./leader";
import { Block, ConsensusMessage, QC, TC, Timeout, Vote } from "./messages";
import { Network } from "./network";
import { Channel } from "./channel";
import { Store } from "./store";
import { Timer } from "./timer";
import { ProposerMessage, ProposerMessageType } from "./proposer";
import { Synchronizer } from "./synchronizer";
import { MempoolDriver } from "./mempool";
import { Digest, PublicKey, Round } from "./types";
import { hashObject } from "./hash";

export class Core {
  private round: Round = 1;
  private lastVotedRound: Round = 0;
  private lastCommittedRound: Round = 0;
  private highQc: QC = QC.genesis();
  private timer: Timer;
  private aggregator: Aggregator;

  constructor(
    private name: PublicKey,
    private committee: Committee,
    private store: Store,
    private leaderElector: LeaderElector,
    private mempoolDriver: MempoolDriver,
    private synchronizer: Synchronizer,
    private rxMessage: Channel<ConsensusMessage>,
    private rxLoopback: Channel<Block>,
    private txProposer: Channel<ProposerMessage>,
    private txCommit: Channel<Block>,
    private network: Network,
    timeoutDelay: number
  ) {
    this.timer = new Timer(timeoutDelay);
    this.aggregator = new Aggregator(committee);
  }

  private storeBlock(block: Block): void {
    const key: Digest = block.digest();
    const value = Buffer.from(JSON.stringify(block));
    this.store.write(key, value);
  }

  private increaseLastVotedRound(target: Round): void {
    this.lastVotedRound = Math.max(this.lastVotedRound, target);
  }

  private async makeVote(block: Block): Promise<Vote | null> {
    const safetyRule1 = block.round > this.lastVotedRound;
    let safetyRule2 = block.qc.round + 1 === block.round;
    if (block.tc) {
      const tc = block.tc;
      let canExtend = tc.round + 1 === block.round;
      const maxHigh = Math.max(...tc.highQcRounds());
      canExtend = canExtend && block.qc.round >= maxHigh;
      safetyRule2 = safetyRule2 || canExtend;
    }
    if (!(safetyRule1 && safetyRule2)) return null;

    this.increaseLastVotedRound(block.round);
    return Vote.new(block, this.name);
  }

  private async commit(block: Block): Promise<void> {
    if (this.lastCommittedRound >= block.round) return;
    const toCommit: Block[] = [];
    let parent = block;
    while (this.lastCommittedRound + 1 < parent.round) {
      const ancestor = await this.synchronizer.getParentBlock(parent);
      if (!ancestor) throw new Error("Missing ancestor during commit");
      toCommit.unshift(ancestor);
      parent = ancestor;
    }
    toCommit.unshift(block);
    this.lastCommittedRound = block.round;
    for (const b of toCommit) {
      if (b.payload.length > 0) {
        console.log(`[Core ${this.name}] Committed ${b.toString()}`);
      }
      await this.txCommit.send(b);
    }
  }

  private updateHighQc(qc: QC): void {
    if (qc.round > this.highQc.round) this.highQc = qc;
  }

  private async localTimeoutRound(): Promise<void> {
    console.warn(`[Core ${this.name}] Timeout reached for round ${this.round}`);
    this.increaseLastVotedRound(this.round);
    const timeout = await Timeout.new(this.highQc, this.round, this.name);
    this.timer.reset();
    const addrs = Array.from(this.committee.authorities.keys()).filter(
      (n) => n !== this.name
    );
    const msg: ConsensusMessage = { type: "Timeout", timeout };
    for (const a of addrs) this.network.send(a, msg);
    await this.handleTimeout(timeout);
  }

  private async handleVote(vote: Vote): Promise<void> {
    if (vote.round < this.round) return;
    vote.verify(this.committee);
    const qc = this.aggregator.addVote(vote);
    if (qc) {
      console.log(`[Core ${this.name}] Assembled ${qc.toString()}`);
      await this.processQc(qc);
      if (this.name === this.leaderElector.getLeader(this.round)) {
        await this.generateProposal(undefined);
      }
    }
  }

  private async handleTimeout(timeout: Timeout): Promise<void> {
    if (timeout.round < this.round) return;
    timeout.verify(this.committee);
    await this.processQc(timeout.highQc);
    const tc = this.aggregator.addTimeout(timeout);
    if (tc) {
      await this.advanceRound(tc.round);
      const addrs = Array.from(this.committee.authorities.keys()).filter(
        (n) => n !== this.name
      );
      const msg: ConsensusMessage = { type: "TC", tc };
      for (const a of addrs) this.network.send(a, msg);
      if (this.name === this.leaderElector.getLeader(this.round)) {
        await this.generateProposal(tc);
      }
    }
  }

  private async advanceRound(round: Round): Promise<void> {
    if (round < this.round) return;
    this.timer.reset();
    this.round = round + 1;
    console.log(`[Core ${this.name}] Moved to round ${this.round}`);
    this.aggregator.cleanup(this.round);
  }

  private async generateProposal(tc?: TC): Promise<void> {
    await this.txProposer.send({
      type: ProposerMessageType.Make,
      round: this.round,
      qc: this.highQc,
      tc
    });
  }

  private async cleanupProposer(b0: Block, b1: Block, block: Block): Promise<void> {
    const digests = [...b0.payload, ...b1.payload, ...block.payload];
    await this.txProposer.send({
      type: ProposerMessageType.Cleanup,
      digests
    });
  }

  private async processQc(qc: QC): Promise<void> {
    await this.advanceRound(qc.round);
    this.updateHighQc(qc);
  }

  private async processBlock(block: Block): Promise<void> {
    const ancestors = await this.synchronizer.getAncestors(block);
    if (!ancestors) {
      console.log(
        `[Core ${this.name}] Processing of ${hashObject(block)} suspended: missing parent`
      );
      return;
    }
    const { b0, b1 } = ancestors;
    this.storeBlock(block);
    await this.cleanupProposer(b0, b1, block);
    if (b0.round + 1 === b1.round) {
      await this.mempoolDriver.cleanup(b0.round);
      await this.commit(b0);
    }
    if (block.round !== this.round) return;
    const vote = await this.makeVote(block);
    if (!vote) return;
    const nextLeader = this.leaderElector.getLeader(this.round + 1);
    if (nextLeader === this.name) {
      await this.handleVote(vote);
    } else {
      this.network.send(nextLeader, { type: "Vote", vote });
    }
  }

  private async handleProposal(block: Block): Promise<void> {
    const digest = block.digest();
    const expectedLeader = this.leaderElector.getLeader(block.round);
    if (block.author !== expectedLeader) {
      console.warn(
        `[Core ${this.name}] Wrong leader for block ${digest}: got ${block.author}, expected ${expectedLeader}`
      );
      return;
    }
    block.verify(this.committee);
    await this.processQc(block.qc);
    if (block.tc) {
      await this.advanceRound(block.tc.round);
    }
    const ok = await this.mempoolDriver.verify(block);
    if (!ok) {
      console.log(`[Core ${this.name}] Processing of ${digest} suspended: missing payload`);
      return;
    }
    await this.processBlock(block);
  }

  private async handleTc(tc: TC): Promise<void> {
    tc.verify(this.committee);
    if (tc.round < this.round) return;
    await this.advanceRound(tc.round);
    if (this.name === this.leaderElector.getLeader(this.round)) {
      await this.generateProposal(tc);
    }
  }

  async run(): Promise<void> {
    this.timer.reset();
    if (this.name === this.leaderElector.getLeader(this.round)) {
      await this.generateProposal(undefined);
    }

    while (true) {
      const race = await Promise.race([
        this.rxMessage.recv().then((m) => ({ kind: "msg" as const, m })),
        this.rxLoopback.recv().then((b) => ({ kind: "loop" as const, b })),
        this.timer.wait().then(() => ({ kind: "timeout" as const }))
      ]);

      if (race.kind === "msg") {
        const m = race.m;
        switch (m.type) {
          case "Propose":
            await this.handleProposal(m.block);
            break;
          case "Vote":
            await this.handleVote(m.vote);
            break;
          case "Timeout":
            await this.handleTimeout(m.timeout);
            break;
          case "TC":
            await this.handleTc(m.tc);
            break;
        }
      } else if (race.kind === "loop") {
        await this.processBlock(race.b);
      } else if (race.kind === "timeout") {
        await this.localTimeoutRound();
      }
    }
  }
}
