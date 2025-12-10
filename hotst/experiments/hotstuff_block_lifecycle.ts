/* 
  hotstuff_block_lifecycle.ts

  Run with:
    npx ts-node hotstuff_block_lifecycle.ts
  or:
    tsc hotstuff_block_lifecycle.ts && node hotstuff_block_lifecycle.js
*/

// ---- Types ----

type NodeId = "A" | "B" | "C" | "D";

interface Block {
  id: string;
  round: number;
  parentId: string | null;
  justify: QC | null; // HighQC used to build this block
}

interface Vote {
  blockId: string;
  round: number;
  voter: NodeId;
}

interface QC {
  blockId: string;
  round: number;
  voters: NodeId[]; // 2f+1 voters
}

// Very simple "node state" for logging purposes
interface NodeState {
  id: NodeId;
  lockedRound: number; // for real HotStuff locking rules (kept simple here)
}

// ---- Constants ----

const NODES: NodeId[] = ["A", "B", "C", "D"];
const F = 1;              // max faulty
const QUORUM = 2 * F + 1; // 3 out of 4

const LEADER: NodeId = "A"; // keep same leader for all rounds to simplify

// ---- Helper functions ----

function logHeader(title: string) {
  console.log("\n========================================");
  console.log(title);
  console.log("========================================\n");
}

function createBlock(round: number, parent: Block | null, justify: QC | null): Block {
  const id = parent ? `B${round}` : "GENESIS";
  return {
    id,
    round,
    parentId: parent ? parent.id : null,
    justify,
  };
}

// Simulate replicas processing a proposal and casting votes
function collectVotesForBlock(
  round: number,
  block: Block,
  leader: NodeId,
  nodes: NodeState[]
): { votes: Vote[]; qc: QC | null; timedOut: boolean } {
  console.log(`Leader ${leader}: starting vote-collection for block ${block.id} in round ${round}`);
  console.log(`Leader ${leader}: timeout window is [start .. end_of_round_${round}] (simulated)`);

  const votes: Vote[] = [];
  let timedOut = false;

  // Simulate leader's "time window" as a loop step counter
  let stepsRemaining = 3; // think of this as the timeout budget

  for (const node of nodes) {
    if (node.id === leader) {
      continue; // leader does not vote on own proposal in this simple model
    }

    if (stepsRemaining <= 0) {
      // Timeout reached before getting more votes
      timedOut = true;
      console.log(
        `Leader ${leader}: TIMEOUT while waiting for votes in round ${round}. Stopping collection.`
      );
      break;
    }

    console.log(
      `Replica ${node.id}: received proposal for block ${block.id} in round ${round}. Validating...`
    );

    // For this simple success-case, all replicas accept and vote
    const vote: Vote = {
      blockId: block.id,
      round,
      voter: node.id,
    };

    votes.push(vote);
    console.log(
      `Replica ${node.id}: ✔ VALID. Sending Vote(block=${block.id}, round=${round}) to leader ${leader}.`
    );

    console.log(
      `Leader ${leader}: received vote from ${node.id}. Total votes so far = ${votes.length}.`
    );

    if (votes.length >= QUORUM) {
      console.log(
        `Leader ${leader}: reached QUORUM(${QUORUM}) votes for block ${block.id} before timeout.`
      );
      timedOut = false;
      break;
    }

    stepsRemaining -= 1;
  }

  if (votes.length >= QUORUM) {
    const qc: QC = {
      blockId: block.id,
      round,
      voters: votes.map((v) => v.voter),
    };
    console.log(
      `Leader ${leader}: forming QC(block=${block.id}, round=${round}) with voters = [${qc.voters.join(
        ", "
      )}]`
    );
    return { votes, qc, timedOut: false };
  } else {
    console.log(
      `Leader ${leader}: FAILED to get QUORUM votes for block ${block.id}. votes=${votes.length}, needed=${QUORUM}.`
    );
    return { votes, qc: null, timedOut: true };
  }
}

// ---- Main simulation: 3-chain lifecycle ----

function simulateThreeChainCommit() {
  logHeader("HotStuff Block Lifecycle: Proposal → Votes → QC → 3-Chain Commit");

  // Initial node states (lockedRound only for illustration here)
  const nodes: NodeState[] = NODES.map((id) => ({
    id,
    lockedRound: 0,
  }));

  // GENESIS (round 0)
  console.log("Creating GENESIS block (round 0).");
  const genesis = createBlock(0, null, null);
  console.log(`GENESIS: id=${genesis.id}, round=${genesis.round}, parentId=${genesis.parentId}`);

  let highQC: QC | null = {
    blockId: genesis.id,
    round: genesis.round,
    voters: [], // not realistic, but good enough as initial HighQC for demo
  };

  // ---- Round 1 ----
  logHeader("ROUND 1: Leader proposes B1 and collects votes");

  const round1 = 1;
  console.log(`HighQC before round ${round1} = QC(block=${highQC!.blockId}, round=${highQC!.round})`);

  // Leader creates block B1
  const B1 = createBlock(round1, genesis, highQC);
  console.log(
    `Leader ${LEADER}: proposing block B1 (round=${B1.round}, parent=${B1.parentId}, justify.round=${B1.justify?.round}).`
  );

  const { qc: qc1, timedOut: r1Timeout } = collectVotesForBlock(round1, B1, LEADER, nodes);

  if (!qc1 || r1Timeout) {
    console.log("Round 1 failed, B1 will never be committed.");
    return;
  }
  highQC = qc1;
  console.log(
    `After round 1: HighQC = QC(block=${highQC.blockId}, round=${highQC.round}). Block B1 is CERTIFIED but not yet committed.`
  );

  // ---- Round 2 ----
  logHeader("ROUND 2: Leader proposes B2 extending B1");

  const round2 = 2;
  console.log(`HighQC before round ${round2} = QC(block=${highQC.blockId}, round=${highQC.round})`);

  const B2 = createBlock(round2, B1, highQC);
  console.log(
    `Leader ${LEADER}: proposing block B2 (round=${B2.round}, parent=${B2.parentId}, justify.round=${B2.justify?.round}).`
  );

  const { qc: qc2, timedOut: r2Timeout } = collectVotesForBlock(round2, B2, LEADER, nodes);

  if (!qc2 || r2Timeout) {
    console.log("Round 2 failed, B1 still not committed (needs 3-chain).");
    return;
  }
  highQC = qc2;
  console.log(
    `After round 2: HighQC = QC(block=${highQC.blockId}, round=${highQC.round}). Block B2 is CERTIFIED.`
  );

  // ---- Round 3 ----
  logHeader("ROUND 3: Leader proposes B3 extending B2 (this creates 3-chain)");

  const round3 = 3;
  console.log(`HighQC before round ${round3} = QC(block=${highQC.blockId}, round=${highQC.round})`);

  const B3 = createBlock(round3, B2, highQC);
  console.log(
    `Leader ${LEADER}: proposing block B3 (round=${B3.round}, parent=${B3.parentId}, justify.round=${B3.justify?.round}).`
  );

  const { qc: qc3, timedOut: r3Timeout } = collectVotesForBlock(round3, B3, LEADER, nodes);

  if (!qc3 || r3Timeout) {
    console.log("Round 3 failed, 3-chain not formed, B1 cannot be committed yet.");
    return;
  }
  highQC = qc3;
  console.log(
    `After round 3: HighQC = QC(block=${highQC.blockId}, round=${highQC.round}). Block B3 is CERTIFIED.`
  );

  // ---- 3-Chain Commit Rule ----
  logHeader("3-CHAIN COMMIT CHECK");

  console.log("We have QCs for:");
  console.log(`  QC1: block=${qc1.blockId}, round=${qc1.round}`);
  console.log(`  QC2: block=${qc2.blockId}, round=${qc2.round}`);
  console.log(`  QC3: block=${qc3.blockId}, round=${qc3.round}`);

  console.log("\nChecking 3-chain condition: B1 <- B2 <- B3, each with QC:");

  const chainOK =
    B1.id === B2.parentId &&
    B2.id === B3.parentId &&
    qc1.blockId === B1.id &&
    qc2.blockId === B2.id &&
    qc3.blockId === B3.id;

  if (chainOK) {
    console.log("\n✔ 3-CHAIN FORMED:");
    console.log("   QC(B1) @ round 1");
    console.log("   QC(B2) @ round 2");
    console.log("   QC(B3) @ round 3");
    console.log("\n🔥 COMMIT RULE: B1 is now COMMITTED (final).");
  } else {
    console.log("\n✖ 3-chain condition not met. No block is committed.");
  }

  logHeader("Simulation complete");
}

// ---- Run ----

simulateThreeChainCommit();
