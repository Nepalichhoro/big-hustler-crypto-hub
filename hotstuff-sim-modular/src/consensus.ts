import { Committee, Parameters } from "./config";
import { Core } from "./core";
import { defaultParameters } from "./config";
import { Helper } from "./helper";
import { LeaderElector } from "./leader";
import { MempoolDriver, ConsensusMempoolMessage, ConsensusMempoolMessageType } from "./mempool";
import { Block, ConsensusMessage } from "./messages";
import { Proposer } from "./proposer";
import { Network } from "./network";
import { Channel } from "./channel";
import { Store } from "./store";
import { Digest, PublicKey } from "./types";
import { Synchronizer } from "./synchronizer";

export class Consensus {
  static spawn(
    name: PublicKey,
    committee: Committee,
    parameters: Parameters | undefined,
    store: Store,
    network: Network
  ): void {
    const params = parameters ?? defaultParameters();

    const rxConsensus = new Channel<ConsensusMessage>();
    const rxLoopback = new Channel<Block>();
    const txProposer = new Channel<any>();
    const txCommit = new Channel<Block>();
    const txMempool = new Channel<ConsensusMempoolMessage>();
    const rxMempool = new Channel<Digest>();
    const rxHelper = new Channel<{ digest: Digest; origin: PublicKey }>();

    network.register(name, (msg: ConsensusMessage) => {
      if (msg.type === "SyncRequest") {
        rxHelper.send({ digest: msg.missing, origin: msg.origin });
      } else {
        rxConsensus.send(msg);
      }
    });

    const leaderElector = new LeaderElector(committee);
    const mempoolDriver = new MempoolDriver(store, txMempool, rxLoopback);
    const synchronizer = new Synchronizer(
      name,
      committee,
      store,
      rxLoopback,
      params.syncRetryDelay,
      network
    );

    const core = new Core(
      name,
      committee,
      store,
      leaderElector,
      mempoolDriver,
      synchronizer,
      rxConsensus,
      rxLoopback,
      txProposer,
      txCommit,
      network,
      params.timeoutDelay
    );

    const proposer = new Proposer(
      name,
      committee,
      rxMempool,
      txProposer,
      rxLoopback,
      network
    );

    const helper = new Helper(committee, store, network);

    (async () => core.run())();
    (async () => proposer.run())();
    (async () => helper.run(rxHelper))();

    // simple mempool feeder mocking external mempool:
    (async () => {
      let counter = 0;
      while (true) {
        await new Promise((r) => setTimeout(r, 300));
        const d: Digest = `${name}-tx-${counter++}`;
        await rxMempool.send(d);
      }
    })();

    console.log(`[Consensus] Node ${name} spawned`);
  }
}
