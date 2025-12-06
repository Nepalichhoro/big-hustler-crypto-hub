import { Channel } from "./channel";
import { Committee } from "./committee";
import { Network } from "./network";
import { Store } from "./store";
import { Core } from "./core";
import { Proposer, ProposerMessage } from "./proposer";
import { SimpleMempool } from "./mempool";
import { Block, ConsensusMessage, Digest, PublicKey } from "./types";
import { LeaderElector } from "./leaderElector";

export function makeNode(
  name: PublicKey,
  committee: Committee,
  network: Network
): void {
  const store = new Store();
  const rxConsensus = new Channel<ConsensusMessage>();
  const rxLoopback = new Channel<Block>();
  const txProposer = new Channel<ProposerMessage>();
  const mempoolChannel = new Channel<Digest>();

  const leaderElector = new LeaderElector(committee);

  network.register(name, (msg) => rxConsensus.send(msg));

  const core = new Core(
    name,
    committee,
    leaderElector,
    store,
    rxConsensus,
    rxLoopback,
    txProposer,
    network
  );

  const proposer = new Proposer(
    name,
    committee,
    mempoolChannel,
    txProposer,
    rxLoopback,
    network
  );

  const mempool = new SimpleMempool(mempoolChannel);

  void core.run();
  void proposer.run();
  void mempool.startFeeder(name);
}
