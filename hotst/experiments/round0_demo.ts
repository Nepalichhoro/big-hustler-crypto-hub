// round0_demo.ts
//
// Simulate a "round 0" flow for HotStuff-style consensus with mocked data.
// Focus: Consensus + Core behavior from spawn → proposal → handle_proposal → process_qc → process_block.
//
// Run with:
//   npm install -D ts-node typescript
//   npx ts-node round0_demo.ts

// ---------- Basic types ----------

type PublicKey = string;
type Digest = string;

interface QC {
  round: number;
  hash: Digest;
}

interface Block {
  id: string;
  round: number;
  author: PublicKey;
  qc: QC;
  payload: Digest[];
}

type ConsensusMessage =
  | { type: "Propose"; block: Block };

// ---------- Committee & LeaderElector ----------

interface CommitteeMember {
  name: PublicKey;
  stake: number;
}

class Committee {
  private map: Map<PublicKey, CommitteeMember>;
  private keysSorted: PublicKey[];

  constructor(members: CommitteeMember[]) {
    this.map = new Map();
    for (const m of members) {
      this.map.set(m.name, m);
    }
    this.keysSorted = Array.from(this.map.keys()).sort();
  }

  size(): number {
    return this.map.size;
  }

  getLeader(round: number): PublicKey {
    const idx = round % this.keysSorted.length;
    return this.keysSorted[idx];
  }
}

class LeaderElector {
  constructor(private committee: Committee) {}

  getLeader(round: number): PublicKey {
    return this.committee.getLeader(round);
  }
}

// ---------- Simple "network" ----------

type NetworkHandler = (msg: ConsensusMessage) => void;

class Network {
  private handlers: Map<PublicKey, NetworkHandler> = new Map();

  register(name: PublicKey, handler: NetworkHandler) {
    this.handlers.set(name, handler);
  }

  send(to: PublicKey, msg: ConsensusMessage) {
    const h = this.handlers.get(to);
    if (!h) {
      console.log(`[Network] No handler registered for ${to}`);
      return;
    }
    console.log(`[Network] → ${to}: ${msg.type}(${msg.block.id})`);
    h(msg);
  }

  broadcast(from: PublicKey, msg: ConsensusMessage) {
    for (const [name, handler] of this.handlers.entries()) {
      if (name === from) continue;
      console.log(`[Network] ${from} → ${name}: ${msg.type}(${msg.block.id})`);
      handler(msg);
    }
  }
}

// ---------- Core (simplified) ----------

class Core {
  name: PublicKey;
  round: number = 0;
  highQC: QC = { round: 0, hash: "GENESIS" };

  constructor(
    name: PublicKey,
    private committee: Committee,
    private leaderElector: LeaderElector
  ) {
    this.name = name;
  }

  log(msg: string) {
    console.log(`[Core ${this.name}] ${msg}`);
  }

  // What run() would do initially
  async startRound0(proposer: Proposer) {
    this.log(`Booting with round=${this.round}, highQC.round=${this.highQC.round}`);

    const leader = this.leaderElector.getLeader(this.round);
    this.log(`Leader for round ${this.round} is ${leader}`);

    if (this.name === leader) {
      this.log(`I am the leader for round ${this.round}, generating proposal...`);
      await proposer.makeBlockForRound0(this.round, this.highQC);
    } else {
      this.log(`I am NOT the leader, waiting for proposal...`);
    }
  }

  // Handle proposal from network
  async handleProposal(block: Block) {
    this.log(`handle_proposal(${block.id}) called`);

    // 1) Ensure correct leader
    const expectedLeader = this.leaderElector.getLeader(block.round);
    this.log(
      `Verifying leader: block.author=${block.author}, expectedLeader=${expectedLeader}`
    );
    if (block.author !== expectedLeader) {
      this.log(`❌ WrongLeader, ignoring block`);
      return;
    }
    this.log(`✔ Leader is correct`);

    // 2) Verify block (mock)
    this.log(
      `Verifying block: round=${block.round}, qc.round=${block.qc.round}, payload=${block.payload.length} txs`
    );

    // 3) Process QC (this moves us to next round)
    await this.processQC(block.qc);

    // 4) (No TC in round 0 demo)

    // 5) Assume payload is present (mempool verify = true)
    this.log(`Payload verified (mock)`);

    // 6) Process block
    await this.processBlock(block);
  }

  async processQC(qc: QC) {
    this.log(`process_qc(qc.round=${qc.round})`);
    await this.advanceRound(qc.round);
    this.highQC = qc;
    this.log(`Updated highQC.round to ${this.highQC.round}`);
  }

  async advanceRound(qcRound: number) {
    if (qcRound < this.round) {
      this.log(`advance_round: qcRound=${qcRound} < current round=${this.round}, ignoring`);
      return;
    }
    const newRound = qcRound + 1;
    this.log(
      `advance_round: moving from round=${this.round} to round=${newRound} (qcRound=${qcRound})`
    );
    this.round = newRound;
    // In real code: reset timer, cleanup aggregator, etc.
  }

  async processBlock(block: Block) {
    this.log(
      `process_block(${block.id}): block.round=${block.round}, local.round=${this.round}`
    );

    // In real code we would:
    //  - ensure ancestors are present via synchronizer
    //  - store the block
    //  - maybe commit its grandparent (3-chain rule)
    // For round 0 demo we just log.

    this.log(`Storing block ${block.id} in local store (mock)`);

    // Commit check (3-chain) is not triggered in the very first block.
    this.log(`Checking commit rule (3-chain)... (none yet, just genesis → B0)`);

    // Now the key HotStuff detail: voting only happens if block.round == local.round
    if (block.round !== this.round) {
      this.log(
        `Block round != local round (block.round=${block.round}, local.round=${this.round}) → not voting`
      );
      return;
    }

    // If they matched, we'd do make_vote(block) here.
    this.log(`(Would vote here if rounds matched)`);
  }
}

// ---------- Proposer (simplified) ----------

class Proposer {
  private buffer: Digest[] = [];

  constructor(
    private name: PublicKey,
    private committee: Committee,
    private network: Network
  ) {}

  log(msg: string) {
    console.log(`[Proposer ${this.name}] ${msg}`);
  }

  // fake mempool fill
  fillBufferWithMockTxs() {
    this.buffer.push(`${this.name}-tx-1`, `${this.name}-tx-2`);
    this.log(`Buffer filled with mock payload digests: ${this.buffer.join(", ")}`);
  }

  async makeBlockForRound0(round: number, qc: QC) {
    this.fillBufferWithMockTxs();

    const block: Block = {
      id: `B0-${this.name}`,
      round,
      author: this.name,
      qc,
      payload: [...this.buffer],
    };

    this.log(
      `Created block ${block.id} with round=${block.round}, qc.round=${qc.round}, payload=[${block.payload.join(
        ", "
      )}]`
    );

    // Broadcast to others
    const msg: ConsensusMessage = { type: "Propose", block };
    this.network.broadcast(this.name, msg);

    // In the real code, leader also sends to its own core via loopback;
    // here we simulate that by calling its own core handler directly in main.
  }
}

// ---------- ConsensusNode: bundles Core + Proposer ----------

class ConsensusNode {
  core: Core;
  proposer: Proposer;

  constructor(
    public name: PublicKey,
    committee: Committee,
    network: Network
  ) {
    const leaderElector = new LeaderElector(committee);
    this.core = new Core(name, committee, leaderElector);
    this.proposer = new Proposer(name, committee, network);
  }

  onNetworkMessage(msg: ConsensusMessage) {
    if (msg.type === "Propose") {
      void this.core.handleProposal(msg.block);
    }
  }
}

// ---------- Main: simulate round 0 ----------

async function simulateRound0() {
  console.log("=== Round 0 Demo Start ===");

  // 1. Build committee and network
  const members: CommitteeMember[] = [
    { name: "A", stake: 1 },
    { name: "B", stake: 1 },
    { name: "C", stake: 1 },
    { name: "D", stake: 1 },
  ];
  const committee = new Committee(members);
  const network = new Network();

  // 2. Create nodes
  const nodes: Record<PublicKey, ConsensusNode> = {};
  for (const m of members) {
    nodes[m.name] = new ConsensusNode(m.name, committee, network);
  }

  // 3. Register network handlers
  for (const m of members) {
    network.register(m.name, (msg: ConsensusMessage) => {
      nodes[m.name].onNetworkMessage(msg);
    });
  }

  // 4. Start cores in "round 0" style
  console.log("\n--- Booting nodes and starting round 0 ---\n");

  // Simulate start() for each node:
  await Promise.all(
    members.map(async (m) => {
      await nodes[m.name].core.startRound0(nodes[m.name].proposer);
    })
  );

  // The proposer on A just broadcast B0 to others.
  // But in the real implementation, the leader also processes its own block via loopback.
  // Let's simulate that explicitly (A's core handling its own block):

  console.log(
    "\n--- Simulate leader A processing its own proposal via local loopback ---\n"
  );

  // We'll reconstruct the same block that was broadcast by A for logging clarity:
  const leader = "A";
  const qcGenesis: QC = { round: 0, hash: "GENESIS" };
  const leaderBlock: Block = {
    id: `B0-${leader}`,
    round: 0,
    author: leader,
    qc: qcGenesis,
    payload: [`${leader}-tx-1`, `${leader}-tx-2`],
  };
  await nodes[leader].core.handleProposal(leaderBlock);

  console.log("\n=== Round 0 Demo End ===");
}

// Run the demo
simulateRound0().catch((e) => {
  console.error("Error in simulateRound0:", e);
});
