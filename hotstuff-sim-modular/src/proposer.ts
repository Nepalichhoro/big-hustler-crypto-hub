import { PublicKey, Digest, Round, QC, TC, Block } from "./types";
import { Committee } from "./committee";
import { Channel } from "./channel";
import { Network } from "./network";

export type ProposerMessage =
  | { type: "Make"; round: Round; qc: QC; tc?: TC }
  | { type: "Cleanup"; digests: Digest[] };

export class Proposer {
  private buffer = new Set<Digest>();

  constructor(
    private name: PublicKey,
    private committee: Committee,
    private mempoolRx: Channel<Digest>,
    private msgRx: Channel<ProposerMessage>,
    private coreLoopback: Channel<Block>,
    private network: Network
  ) {}

  private async makeBlock(round: Round, qc: QC, tc?: TC): Promise<void> {
    const payload = Array.from(this.buffer);
    this.buffer.clear();

    const block: Block = {
      qc,
      tc,
      author: this.name,
      round,
      payload,
      signature: `sig(${this.name}:${round})`,
    };

    console.log(
      `[Proposer ${this.name}] Created block r=${round}, payload=${payload.length}`
    );

    this.network.broadcast(this.name, this.committee, {
      type: "Propose",
      block,
    });

    this.coreLoopback.send(block);
  }

  async run(): Promise<void> {
    while (true) {
      const race = await Promise.race([
        this.mempoolRx.recv().then((d) => ({ kind: "tx" as const, d })),
        this.msgRx.recv().then((m) => ({ kind: "msg" as const, m })),
      ]);

      if (race.kind === "tx") {
        this.buffer.add(race.d);
      } else {
        const msg = race.m;
        if (msg.type === "Make") {
          await this.makeBlock(msg.round, msg.qc, msg.tc);
        } else if (msg.type === "Cleanup") {
          for (const d of msg.digests) {
            this.buffer.delete(d);
          }
        }
      }
    }
  }
}
