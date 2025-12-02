# Channel Loops Walkthrough (HotStuff Warm‑up)

This is a self-contained warm-up to visualize HotStuff-like message flow using only async loops and typed channels. Treat it as an evented playground you can run with `ts-node` or by compiling to JS.

## Core Channel
Typed channel that delivers queued values to the next waiter and returns `null` when closed:

```ts
class Channel<T> {
  private queue: T[] = [];
  private resolvers: ((value: T | null) => void)[] = [];
  private closed = false;

  send(value: T): void {
    if (this.closed) {
      console.log("[Channel] send() on closed, dropping:", value);
      return;
    }
    const resolver = this.resolvers.shift();
    if (resolver) {
      console.log("[Channel] Handing value directly to waiter:", value);
      resolver(value);
    } else {
      console.log("[Channel] No waiter, enqueueing:", value);
      this.queue.push(value);
    }
  }

  async recv(): Promise<T | null> {
    if (this.queue.length > 0) {
      const v = this.queue.shift()!;
      console.log("[Channel] recv(): from queue:", v);
      return v;
    }
    if (this.closed) {
      console.log("[Channel] recv(): channel closed -> null");
      return null;
    }
    console.log("[Channel] recv(): no value, registering waiter");
    return new Promise<T | null>((resolve) => {
      this.resolvers.push(resolve);
    });
  }

  close() {
    console.log("[Channel] close(): waking", this.resolvers.length, "waiters");
    this.closed = true;
    this.resolvers.forEach((r) => r(null));
    this.resolvers = [];
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
```

## Stage 1: Producer → Consumer (single channel)
Basic event-loop + inbox idea; everything else builds on this.

```ts
async function stage1() {
  console.log("\n=== STAGE 1: simple producer/consumer ===");
  const ch = new Channel<number>();

  // Consumer
  (async () => {
    while (true) {
      const v = await ch.recv();
      if (v === null) {
        console.log("[Consumer] channel closed, stopping");
        break;
      }
      console.log("[Consumer] got:", v);
    }
  })();

  // Producer
  ch.send(1);
  ch.send(2);
  await sleep(500);
  ch.send(3);

  await sleep(500);
  ch.close();
}
```

## Stage 2: Client → Mempool → Consensus (two channels)
Buffers two transactions into a batch, then hands batches to consensus.

```ts
type Transaction = { id: number; payload: string };
type Batch = { id: number; txs: Transaction[] };

function startMempool(
  txIn: Channel<Transaction>,      // client → mempool
  batchOut: Channel<Batch>        // mempool → consensus
) {
  let buffer: Transaction[] = [];
  let nextBatchId = 1;

  (async () => {
    console.log("[Mempool] started");
    while (true) {
      const tx = await txIn.recv();
      if (tx === null) {
        console.log("[Mempool] tx channel closed, stopping");
        break;
      }
      console.log("[Mempool] got tx", tx.id);
      buffer.push(tx);

      if (buffer.length >= 2) {
        const batch: Batch = { id: nextBatchId++, txs: buffer };
        buffer = [];
        console.log("[Mempool] built batch", batch.id, "txs:", batch.txs.map(t => t.id));
        batchOut.send(batch);
      }
    }
  })();
}

function startConsensus(batchIn: Channel<Batch>) {
  (async () => {
    console.log("[Consensus] started");
    while (true) {
      const batch = await batchIn.recv();
      if (batch === null) {
        console.log("[Consensus] batch channel closed, stopping");
        break;
      }
      console.log("[Consensus] got batch", batch.id, " -> PROPOSE + COMMIT");
      // In real HotStuff: propose -> wait votes -> commit
    }
  })();
}

async function stage2() {
  console.log("\n=== STAGE 2: client → mempool → consensus ===");

  const txChan = new Channel<Transaction>();
  const batchChan = new Channel<Batch>();

  startMempool(txChan, batchChan);
  startConsensus(batchChan);

  console.log("[Client] sending tx 1,2,3");
  txChan.send({ id: 1, payload: "tx1" });
  txChan.send({ id: 2, payload: "tx2" });
  txChan.send({ id: 3, payload: "tx3" });

  await sleep(1000);
  console.log("[Main] closing txChan");
  txChan.close();

  await sleep(500);
  console.log("[Main] closing batchChan");
  batchChan.close();
}
```

## Stage 3: Add “network” (loopback channels)
Consensus sends proposals out, the network echoes them back, consensus votes on what it hears—no sockets required.

```ts
type ConsensusMsg =
  | { type: "PROPOSAL"; from: string; batch: Batch }
  | { type: "VOTE"; from: string; proposalId: number };

function startNetwork(
  outgoing: Channel<ConsensusMsg>,  // consensus → network
  incoming: Channel<ConsensusMsg>   // network → consensus
) {
  (async () => {
    console.log("[Network] started");
    while (true) {
      const msg = await outgoing.recv();
      if (msg === null) {
        console.log("[Network] outgoing closed, stopping");
        break;
      }
      console.log("[Network] sending to peers:", msg);

      // Simulate network delay + loopback
      setTimeout(() => {
        console.log("[Network] delivering message back to consensus");
        incoming.send(msg);
      }, 300);
    }
  })();
}

function startConsensusWithNetwork(
  batchIn: Channel<Batch>,
  netIn: Channel<ConsensusMsg>,
  netOut: Channel<ConsensusMsg>
) {
  console.log("[Consensus] starting (with network)");

  // From mempool: new batches => proposals
  (async () => {
    while (true) {
      const batch = await batchIn.recv();
      if (batch === null) {
        console.log("[Consensus] batchIn closed, stopping batch loop");
        break;
      }
      console.log("[Consensus] got batch", batch.id, " -> create PROPOSAL");
      const proposal: ConsensusMsg = {
        type: "PROPOSAL",
        from: "node1",
        batch,
      };
      netOut.send(proposal);
    }
  })();

  // From network: proposals & votes
  (async () => {
    while (true) {
      const msg = await netIn.recv();
      if (msg === null) {
        console.log("[Consensus] netIn closed, stopping net loop");
        break;
      }
      console.log("[Consensus] received from network:", msg);
      if (msg.type === "PROPOSAL") {
        console.log("[Consensus] validating proposal", msg.batch.id, "and sending VOTE");
        const vote: ConsensusMsg = {
          type: "VOTE",
          from: "node1",
          proposalId: msg.batch.id,
        };
        netOut.send(vote);
      } else if (msg.type === "VOTE") {
        console.log("[Consensus] got VOTE for proposal", msg.proposalId);
        // Real HotStuff: count votes, maybe commit
      }
    }
  })();
}

async function stage3() {
  console.log("\n=== STAGE 3: client → mempool → consensus ↔ network ===");

  const txChan = new Channel<Transaction>();
  const batchChan = new Channel<Batch>();
  const netOutChan = new Channel<ConsensusMsg>();
  const netInChan = new Channel<ConsensusMsg>();

  startMempool(txChan, batchChan);
  startNetwork(netOutChan, netInChan);
  startConsensusWithNetwork(batchChan, netInChan, netOutChan);

  console.log("[Client] sending tx 1,2,3,4");
  txChan.send({ id: 1, payload: "tx1" });
  txChan.send({ id: 2, payload: "tx2" }); // -> batch1
  txChan.send({ id: 3, payload: "tx3" });
  txChan.send({ id: 4, payload: "tx4" }); // -> batch2

  await sleep(2000);

  console.log("[Main] closing all channels");
  txChan.close();
  batchChan.close();
  netOutChan.close();
  netInChan.close();
}
```

## Glue: run all stages

```ts
async function main() {
  await stage1();
  await sleep(500);
  await stage2();
  await sleep(500);
  await stage3();
}

main().catch(console.error);
```

### Running it
- Save the snippets above into a scratch file such as `channel_playground.ts` in this folder.
- Run with `npx ts-node channel_playground.ts` (or compile to JS first).
- Watch logs to see which loop listens on which channel and how messages flow/close.
