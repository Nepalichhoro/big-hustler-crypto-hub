import { Committee, stake } from "./config";
import { Aggregator } from "./aggregator";
import { Block, ConsensusMessage, QC, TC } from "./messages";
import { Network } from "./network";
import { Channel } from "./channel";
import { Digest, PublicKey, Round, Stake } from "./types";

export enum ProposerMessageType {
  Make = "Make",
  Cleanup = "Cleanup"
}

export type ProposerMessage =
  | { type: ProposerMessageType.Make; round: Round; qc: QC; tc?: TC }
  | { type: ProposerMessageType.Cleanup; digests: Digest[] };

export class Proposer {
  private buffer = new Set<Digest>();

  constructor(
    private name: PublicKey,
    private committee: Committee,
    private rxMempool: Channel<Digest>,
    private rxMessage: Channel<ProposerMessage>,
    private txLoopback: Channel<Block>,
    private network: Network
  ) {}

  private async makeBlock(round: Round, qc: QC, tc?: TC): Promise<void> {
    const payload = Array.from(this.buffer);
    this.buffer.clear();
    const block = await Block.new(qc, tc, this.name, round, payload);
    console.log(`[Proposer ${this.name}] Created block r=${round}, payload=${payload.length}`);
    const names: PublicKey[] = [];
    const addresses: PublicKey[] = [];
    for (const [name] of this.committee.authorities.entries()) {
      if (name !== this.name) {
        names.push(name);
        addresses.push(name);
      }
    }
    const msg: ConsensusMessage = { type: "Propose", block };
    for (const addr of addresses) {
      this.network.send(addr, msg);
    }
    await this.txLoopback.send(block);
    // Control system: wait for 2f+1 acks (simulated immediate).
    let totalStake: Stake = stake(this.committee, this.name);
    const threshold = Aggregator.prototype["dummy"] ?? 0; // placeholder, not used.
    for (const n of names) {
      totalStake += stake(this.committee, n);
      if (totalStake >= threshold) break;
    }
  }

  async run(): Promise<void> {
    while (true) {
      const race = await Promise.race([
        this.rxMempool.recv().then((d) => ({ kind: "tx" as const, d })),
        this.rxMessage.recv().then((m) => ({ kind: "msg" as const, m }))
      ]);
      if (race.kind === "tx") {
        this.buffer.add(race.d);
      } else {
        const m = race.m;
        if (m.type === ProposerMessageType.Make) {
          await this.makeBlock(m.round, m.qc, m.tc);
        } else if (m.type === ProposerMessageType.Cleanup) {
          for (const d of m.digests) this.buffer.delete(d);
        }
      }
    }
  }
}
