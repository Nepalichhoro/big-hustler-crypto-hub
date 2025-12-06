import { Digest, PublicKey, Round } from "./types";
import { quorumThreshold, Committee, stake as stakeOf } from "./config";
import { hashObject } from "./hash";

export class Signature {
  constructor(public value: string = "") {}
  verify(_digest: Digest, _author: PublicKey): void {
    // In this TS demo we trust all signatures.
    return;
  }

  static verifyBatch(_digest: Digest, _votes: [PublicKey, Signature][]): void {
    // Always ok in demo.
    return;
  }
}

export class Block {
  constructor(
    public qc: QC,
    public tc: TC | undefined,
    public author: PublicKey,
    public round: Round,
    public payload: Digest[],
    public signature: Signature
  ) {}

  static async new(
    qc: QC,
    tc: TC | undefined,
    author: PublicKey,
    round: Round,
    payload: Digest[]
  ): Promise<Block> {
    const b = new Block(qc, tc, author, round, payload, new Signature());
    const sig = new Signature(`sig(${author}:${round})`);
    b.signature = sig;
    return b;
  }

  static genesis(): Block {
    return new Block(QC.genesis(), undefined, "genesis", 0, [], new Signature("genesis"));
  }

  parent(): Digest {
    return this.qc.hash;
  }

  digest(): Digest {
    return hashObject({
      author: this.author,
      round: this.round,
      payload: this.payload,
      qcHash: this.qc.hash
    });
  }

  verify(committee: Committee): void {
    const votingRights = stakeOf(committee, this.author);
    if (votingRights === 0) {
      throw new Error(`Unknown authority ${this.author}`);
    }
    this.signature.verify(this.digest(), this.author);
    if (!this.qc.equals(QC.genesis())) {
      this.qc.verify(committee);
    }
    if (this.tc) {
      this.tc.verify(committee);
    }
  }

  toString(): string {
    return `B${this.round}`;
  }
}

export class Vote {
  constructor(
    public hash: Digest,
    public round: Round,
    public author: PublicKey,
    public signature: Signature
  ) {}

  static async new(block: Block, author: PublicKey): Promise<Vote> {
    const v = new Vote(block.digest(), block.round, author, new Signature());
    v.signature = new Signature(`vsig(${author}:${block.round})`);
    return v;
  }

  digest(): Digest {
    return hashObject({ hash: this.hash, round: this.round });
  }

  verify(committee: Committee): void {
    const s = stakeOf(committee, this.author);
    if (s === 0) {
      throw new Error(`Unknown authority ${this.author}`);
    }
    this.signature.verify(this.digest(), this.author);
  }
}

export class QC {
  constructor(
    public hash: Digest,
    public round: Round,
    public votes: [PublicKey, Signature][]
  ) {}

  static genesis(): QC {
    return new QC("0", 0, []);
  }

  timeout(): boolean {
    return this.hash === "0" && this.round !== 0;
  }

  verify(committee: Committee): void {
    let weight = 0;
    const used = new Set<PublicKey>();
    for (const [name] of this.votes) {
      if (used.has(name)) throw new Error(`Authority reuse ${name}`);
      const s = stakeOf(committee, name);
      if (s === 0) throw new Error(`Unknown authority ${name}`);
      used.add(name);
      weight += s;
    }
    if (weight < quorumThreshold(committee)) {
      throw new Error("QC requires quorum");
    }
    Signature.verifyBatch(this.digest(), this.votes);
  }

  digest(): Digest {
    return hashObject({ hash: this.hash, round: this.round });
  }

  equals(other: QC): boolean {
    return this.hash === other.hash && this.round === other.round;
  }

  toString(): string {
    return `QC(${this.hash}, ${this.round})`;
  }
}

export class Timeout {
  constructor(
    public highQc: QC,
    public round: Round,
    public author: PublicKey,
    public signature: Signature
  ) {}

  static async new(highQc: QC, round: Round, author: PublicKey): Promise<Timeout> {
    const t = new Timeout(highQc, round, author, new Signature());
    t.signature = new Signature(`tsig(${author}:${round})`);
    return t;
  }

  digest(): Digest {
    return hashObject({ round: this.round, highQcRound: this.highQc.round });
  }

  verify(committee: Committee): void {
    const s = stakeOf(committee, this.author);
    if (s === 0) throw new Error(`Unknown authority ${this.author}`);
    this.signature.verify(this.digest(), this.author);
    if (!this.highQc.equals(QC.genesis())) {
      this.highQc.verify(committee);
    }
  }
}

export class TC {
  constructor(public round: Round, public votes: [PublicKey, Signature, Round][]) {}

  verify(committee: Committee): void {
    let weight = 0;
    const used = new Set<PublicKey>();
    for (const [name] of this.votes) {
      if (used.has(name)) throw new Error(`Authority reuse ${name}`);
      const s = stakeOf(committee, name);
      if (s === 0) throw new Error(`Unknown authority ${name}`);
      used.add(name);
      weight += s;
    }
    if (weight < quorumThreshold(committee)) {
      throw new Error("TC requires quorum");
    }
    for (const [author, sig, highQcRound] of this.votes) {
      const d = hashObject({ round: this.round, highQcRound });
      sig.verify(d, author);
    }
  }

  highQcRounds(): Round[] {
    return this.votes.map(([, , r]) => r);
  }

  toString(): string {
    return `TC(${this.round}, [${this.highQcRounds().join(",")}])`;
  }
}

export type ConsensusMessage =
  | { type: "Propose"; block: Block }
  | { type: "Vote"; vote: Vote }
  | { type: "Timeout"; timeout: Timeout }
  | { type: "TC"; tc: TC }
  | { type: "SyncRequest"; missing: Digest; origin: PublicKey };
