// demo_mempool_flow.ts
// ------------------------------------------------------------
// End-to-end mempool flow with mock data & mock dependencies.
// One client transaction goes through:
//
// Client -> TxReceiverHandler -> BatchMaker -> QuorumWaiter
// -> Processor -> Consensus
// ------------------------------------------------------------

// ---------- Minimal channel implementation ----------

interface ChannelSender<T> {
  send(value: T): Promise<void>;
}

interface ChannelReceiver<T> {
  recv(): Promise<T | null>;
}

interface Channel<T> {
  sender: ChannelSender<T>;
  receiver: ChannelReceiver<T>;
}

function createChannel<T>(capacity: number): Channel<T> {
  const queue: T[] = [];
  const waiters: ((v: T | null) => void)[] = [];
  let closed = false;

  const sender: ChannelSender<T> = {
    async send(value: T) {
      if (closed) throw new Error("Channel closed");
      if (waiters.length > 0) {
        const resolve = waiters.shift()!;
        resolve(value);
      } else {
        queue.push(value);
      }
    },
  };

  const receiver: ChannelReceiver<T> = {
    async recv(): Promise<T | null> {
      if (queue.length > 0) {
        return queue.shift()!;
      }
      if (closed) return null;
      return new Promise<T | null>((resolve) => {
        waiters.push(resolve);
      });
    },
  };

  return { sender, receiver };
}

// ---------- Basic types (Digest, PublicKey, etc.) ----------

type Digest = string;
type PublicKey = string;
type Transaction = Uint8Array;

// A "batch" is just an array of transactions plus an id for this demo.
interface Batch {
  id: string;
  txs: Transaction[];
}

type Round = number;

// ---------- Messages ----------

type ConsensusMempoolMessage =
  | { type: "Synchronize"; missing: Digest[]; target: PublicKey }
  | { type: "Cleanup"; round: Round };

// We won’t use MempoolMessage in this minimal client-flow demo,
// but we define it for completeness.
type MempoolMessage =
  | { type: "Batch"; batch: Batch }
  | { type: "BatchRequest"; missing: Digest[]; origin: PublicKey };

// ---------- Mock Store ----------

class Store {
  private data = new Map<string, any>();

  async write(key: string, value: any): Promise<void> {
    console.log(`[Store] Writing key=${key}`);
    this.data.set(key, value);
  }

  async read(key: string): Promise<any | undefined> {
    const v = this.data.get(key);
    console.log(`[Store] Reading key=${key}, found=${v ? "yes" : "no"}`);
    return v;
  }
}

// ---------- Mock Committee & Parameters ----------

class Address {
  constructor(public kind: "tx" | "mempool", public name: PublicKey) {}
  toString() {
    return `${this.kind}-addr-for-${this.name}`;
  }
}

class Committee {
  // For demo, just one node.
  transactionsAddress(name: PublicKey): Address {
    return new Address("tx", name);
  }
  mempoolAddress(name: PublicKey): Address {
    return new Address("mempool", name);
  }
  broadcastAddresses(name: PublicKey): Address[] {
    // In real code, returns all peers in same mempool committee.
    return [this.mempoolAddress(name)];
  }
  stake(name: PublicKey): number {
    return 1;
  }
}

class Parameters {
  batchSize = 1;          // cut batch after 1 tx (for demo)
  maxBatchDelayMs = 1000; // not really used in demo
  gcDepth = 10;
  syncRetryDelay = 1000;
  syncRetryNodes = 1;

  log() {
    console.log("[Parameters] Mempool parameters logged.");
  }
}

// ---------- Mock Network Receiver & Writer ----------

interface Writer {
  send(bytes: Uint8Array): Promise<void>;
}

interface MessageHandler {
  dispatch(writer: Writer, message: Uint8Array): Promise<void>;
}

class SimpleWriter implements Writer {
  constructor(private name: string) {}
  async send(bytes: Uint8Array): Promise<void> {
    console.log(`[Writer:${this.name}] Sending bytes:`, Buffer.from(bytes).toString());
  }
}

/**
 * Very simplified “network”:
 * - We register handlers by address string.
 * - We can simulate incoming messages by calling simulateIncoming(address, message).
 */
class NetworkReceiver {
  private static handlers = new Map<string, MessageHandler>();

  static spawn(address: Address, handler: MessageHandler) {
    const key = address.toString();
    console.log(`[NetworkReceiver] Listening on ${key}`);
    this.handlers.set(key, handler);
  }

  static async simulateIncoming(address: Address, message: Uint8Array) {
    const key = address.toString();
    const handler = this.handlers.get(key);
    if (!handler) {
      console.error(`[NetworkReceiver] No handler for address ${key}`);
      return;
    }
    console.log(`[NetworkReceiver] Incoming message on ${key}:`, Buffer.from(message).toString());
    const writer = new SimpleWriter(key);
    await handler.dispatch(writer, message);
  }
}

// ---------- BatchMaker (mock) ----------

class BatchMaker {
  static spawn(opts: {
    batchSize: number;
    maxBatchDelayMs: number;
    rxTransaction: ChannelReceiver<Transaction>;
    txMessage: ChannelSender<Batch>;
    mempoolAddresses: Address[];
  }) {
    const { batchSize, rxTransaction, txMessage } = opts;

    (async () => {
      console.log("[BatchMaker] Started");
      let currentBatch: Transaction[] = [];
      let batchId = 0;

      while (true) {
        const tx = await rxTransaction.recv();
        if (tx === null) {
          console.log("[BatchMaker] Channel closed, exiting.");
          return;
        }
        console.log("[BatchMaker] Received tx from client");
        currentBatch.push(tx);

        if (currentBatch.length >= batchSize) {
          batchId += 1;
          const batch: Batch = { id: `batch-${batchId}`, txs: currentBatch };
          console.log(`[BatchMaker] Cutting batch ${batch.id} with ${currentBatch.length} tx(s)`);
          currentBatch = [];

          // In real code, this also reliably broadcasts via network and collects cancel handlers.
          await txMessage.send(batch);
        }
      }
    })();
  }
}

// ---------- QuorumWaiter (mock) ----------

class QuorumWaiter {
  static spawn(opts: {
    committee: Committee;
    stake: number;
    rxMessage: ChannelReceiver<Batch>;
    txBatch: ChannelSender<Batch>;
  }) {
    const { rxMessage, txBatch } = opts;

    (async () => {
      console.log("[QuorumWaiter] Started");
      while (true) {
        const batch = await rxMessage.recv();
        if (!batch) {
          console.log("[QuorumWaiter] Channel closed, exiting.");
          return;
        }
        console.log(`[QuorumWaiter] Got batch ${batch.id}, simulating 2f ACKs`);
        // In real code, this waits for 2f ACKs using cancel handlers from the reliable sender.
        await new Promise((resolve) => setTimeout(resolve, 100)); // simulate some waiting
        console.log(`[QuorumWaiter] Quorum reached for ${batch.id}, forwarding to Processor`);
        await txBatch.send(batch);
      }
    })();
  }
}

// ---------- Processor (mock) ----------

class Processor {
  static spawn(opts: {
    store: Store;
    rxBatch: ChannelReceiver<Batch>;
    txDigest: ChannelSender<Digest>;
  }) {
    const { store, rxBatch, txDigest } = opts;

    (async () => {
      console.log("[Processor] Started");
      while (true) {
        const batch = await rxBatch.recv();
        if (!batch) {
          console.log("[Processor] Channel closed, exiting.");
          return;
        }

        console.log(`[Processor] Processing ${batch.id}, hashing & storing`);
        // Very naive "hash":
        const digest: Digest = `digest-of-${batch.id}`;

        await store.write(digest, batch);
        console.log(`[Processor] Stored batch ${batch.id} with digest ${digest}`);
        console.log(`[Processor] Sending digest to consensus`);
        await txDigest.send(digest);
      }
    })();
  }
}

// ---------- Synchronizer (mock, for consensus -> mempool) ----------

class Synchronizer {
  static spawn(opts: {
    name: PublicKey;
    committee: Committee;
    store: Store;
    gcDepth: number;
    syncRetryDelay: number;
    syncRetryNodes: number;
    rxMessage: ChannelReceiver<ConsensusMempoolMessage>;
  }) {
    const { rxMessage } = opts;

    (async () => {
      console.log("[Synchronizer] Started");
      while (true) {
        const msg = await rxMessage.recv();
        if (!msg) {
          console.log("[Synchronizer] Channel closed, exiting.");
          return;
        }
        console.log("[Synchronizer] Received from consensus:", msg);
        // In real code, this would send BatchRequest to other mempools to fetch missing batches.
      }
    })();
  }
}

// ---------- Mempool itself ----------

const CHANNEL_CAPACITY = 1000;

class Mempool {
  constructor(
    private readonly name: PublicKey,
    private readonly committee: Committee,
    private readonly parameters: Parameters,
    private readonly store: Store,
    private readonly txConsensus: ChannelSender<Digest>
  ) {}

  static spawn(
    name: PublicKey,
    committee: Committee,
    parameters: Parameters,
    store: Store,
    rxConsensus: ChannelReceiver<ConsensusMempoolMessage>,
    txConsensus: ChannelSender<Digest>
  ) {
    parameters.log();
    const mempool = new Mempool(name, committee, parameters, store, txConsensus);

    mempool.handleConsensusMessages(rxConsensus);
    mempool.handleClientsTransactions();
    // mempool.handleMempoolMessages(); // not needed for this client-only demo

    const addr = committee.mempoolAddress(name).toString();
    console.log(`[*] Mempool successfully booted on ${addr}`);
  }

  private handleConsensusMessages(rxConsensus: ChannelReceiver<ConsensusMempoolMessage>) {
    Synchronizer.spawn({
      name: this.name,
      committee: this.committee,
      store: this.store,
      gcDepth: this.parameters.gcDepth,
      syncRetryDelay: this.parameters.syncRetryDelay,
      syncRetryNodes: this.parameters.syncRetryNodes,
      rxMessage: rxConsensus,
    });
  }

  private handleClientsTransactions() {
    // Channels inside the mempool pipeline
    const txChan1 = createChannel<Transaction>(CHANNEL_CAPACITY);
    const txChan2 = createChannel<Batch>(CHANNEL_CAPACITY);
    const txChan3 = createChannel<Batch>(CHANNEL_CAPACITY);

    const txBatchMaker = txChan1.sender;
    const rxBatchMaker = txChan1.receiver;
    const txQuorumWaiter = txChan2.sender;
    const rxQuorumWaiter = txChan2.receiver;
    const txProcessor = txChan3.sender;
    const rxProcessor = txChan3.receiver;

    // NetworkReceiver for clients' transactions
    const txAddress = this.committee.transactionsAddress(this.name);
    NetworkReceiver.spawn(txAddress, new TxReceiverHandler(txBatchMaker));
    console.log(`[Mempool] Listening to client transactions on ${txAddress.toString()}`);

    // BatchMaker
    BatchMaker.spawn({
      batchSize: this.parameters.batchSize,
      maxBatchDelayMs: this.parameters.maxBatchDelayMs,
      rxTransaction: rxBatchMaker,
      txMessage: txQuorumWaiter,
      mempoolAddresses: this.committee.broadcastAddresses(this.name),
    });

    // QuorumWaiter
    QuorumWaiter.spawn({
      committee: this.committee,
      stake: this.committee.stake(this.name),
      rxMessage: rxQuorumWaiter,
      txBatch: txProcessor,
    });

    // Processor -> consensus
    Processor.spawn({
      store: this.store,
      rxBatch: rxProcessor,
      txDigest: this.txConsensus,
    });
  }
}

// ---------- TxReceiverHandler (network -> BatchMaker channel) ----------

class TxReceiverHandler implements MessageHandler {
  constructor(private readonly txBatchMaker: ChannelSender<Transaction>) {}

  async dispatch(_writer: Writer, message: Uint8Array): Promise<void> {
    console.log(
      "[TxReceiverHandler] Received transaction bytes from client:",
      Buffer.from(message).toString()
    );
    await this.txBatchMaker.send(message);
    // In Rust they call tokio::task::yield_now(); here it's a no-op.
  }
}

// ---------- Demo: run a single transaction through the flow ----------

async function runDemo() {
  console.log("=== DEMO START ===");

  // 1. Set up committee, params, store.
  const committee = new Committee();
  const params = new Parameters();
  const store = new Store();
  const nodeName: PublicKey = "node-1";

  // 2. Create consensus <-> mempool channels.
  const consensusToMempool = createChannel<ConsensusMempoolMessage>(CHANNEL_CAPACITY);
  const mempoolToConsensus = createChannel<Digest>(CHANNEL_CAPACITY);

  const rxConsensus = consensusToMempool.receiver;
  const txConsensus = mempoolToConsensus.sender;
  const rxConsensusDigests = mempoolToConsensus.receiver;

  // 3. Start Mempool.
  Mempool.spawn(nodeName, committee, params, store, rxConsensus, txConsensus);

  // 4. Simulate "consensus" reading digests from mempool.
  (async () => {
    console.log("[Consensus] Waiting for digests from mempool...");
    const digest = await rxConsensusDigests.recv();
    console.log(`[Consensus] Got digest from mempool: ${digest}`);
    console.log("=== DEMO END ===");
  })();

  // 5. Simulate a client sending one transaction.
  const txAddress = committee.transactionsAddress(nodeName);
  const clientTxPayload = Buffer.from("tx-1: user pays 10 coins to Bob", "utf8");

  console.log("\n[Client] Sending one transaction to mempool...");
  await NetworkReceiver.simulateIncoming(txAddress, clientTxPayload);
}

runDemo().catch((e) => console.error(e));
// demo_mempool_flow.ts
// ------------------------------------------------------------
// End-to-end mempool flow with mock data & mock dependencies.
// One client transaction goes through:
//
// Client -> TxReceiverHandler -> BatchMaker -> QuorumWaiter
// -> Processor -> Consensus
// ------------------------------------------------------------

// ---------- Minimal channel implementation ----------

interface ChannelSender<T> {
  send(value: T): Promise<void>;
}

interface ChannelReceiver<T> {
  recv(): Promise<T | null>;
}

interface Channel<T> {
  sender: ChannelSender<T>;
  receiver: ChannelReceiver<T>;
}

function createChannel<T>(capacity: number): Channel<T> {
  const queue: T[] = [];
  const waiters: ((v: T | null) => void)[] = [];
  let closed = false;

  const sender: ChannelSender<T> = {
    async send(value: T) {
      if (closed) throw new Error("Channel closed");
      if (waiters.length > 0) {
        const resolve = waiters.shift()!;
        resolve(value);
      } else {
        queue.push(value);
      }
    },
  };

  const receiver: ChannelReceiver<T> = {
    async recv(): Promise<T | null> {
      if (queue.length > 0) {
        return queue.shift()!;
      }
      if (closed) return null;
      return new Promise<T | null>((resolve) => {
        waiters.push(resolve);
      });
    },
  };

  return { sender, receiver };
}

// ---------- Basic types (Digest, PublicKey, etc.) ----------

type Digest = string;
type PublicKey = string;
type Transaction = Uint8Array;

// A "batch" is just an array of transactions plus an id for this demo.
interface Batch {
  id: string;
  txs: Transaction[];
}

type Round = number;

// ---------- Messages ----------

type ConsensusMempoolMessage =
  | { type: "Synchronize"; missing: Digest[]; target: PublicKey }
  | { type: "Cleanup"; round: Round };

// We won’t use MempoolMessage in this minimal client-flow demo,
// but we define it for completeness.
type MempoolMessage =
  | { type: "Batch"; batch: Batch }
  | { type: "BatchRequest"; missing: Digest[]; origin: PublicKey };

// ---------- Mock Store ----------

class Store {
  private data = new Map<string, any>();

  async write(key: string, value: any): Promise<void> {
    console.log(`[Store] Writing key=${key}`);
    this.data.set(key, value);
  }

  async read(key: string): Promise<any | undefined> {
    const v = this.data.get(key);
    console.log(`[Store] Reading key=${key}, found=${v ? "yes" : "no"}`);
    return v;
  }
}

// ---------- Mock Committee & Parameters ----------

class Address {
  constructor(public kind: "tx" | "mempool", public name: PublicKey) {}
  toString() {
    return `${this.kind}-addr-for-${this.name}`;
  }
}

class Committee {
  // For demo, just one node.
  transactionsAddress(name: PublicKey): Address {
    return new Address("tx", name);
  }
  mempoolAddress(name: PublicKey): Address {
    return new Address("mempool", name);
  }
  broadcastAddresses(name: PublicKey): Address[] {
    // In real code, returns all peers in same mempool committee.
    return [this.mempoolAddress(name)];
  }
  stake(name: PublicKey): number {
    return 1;
  }
}

class Parameters {
  batchSize = 1;          // cut batch after 1 tx (for demo)
  maxBatchDelayMs = 1000; // not really used in demo
  gcDepth = 10;
  syncRetryDelay = 1000;
  syncRetryNodes = 1;

  log() {
    console.log("[Parameters] Mempool parameters logged.");
  }
}

// ---------- Mock Network Receiver & Writer ----------

interface Writer {
  send(bytes: Uint8Array): Promise<void>;
}

interface MessageHandler {
  dispatch(writer: Writer, message: Uint8Array): Promise<void>;
}

class SimpleWriter implements Writer {
  constructor(private name: string) {}
  async send(bytes: Uint8Array): Promise<void> {
    console.log(`[Writer:${this.name}] Sending bytes:`, Buffer.from(bytes).toString());
  }
}

/**
 * Very simplified “network”:
 * - We register handlers by address string.
 * - We can simulate incoming messages by calling simulateIncoming(address, message).
 */
class NetworkReceiver {
  private static handlers = new Map<string, MessageHandler>();

  static spawn(address: Address, handler: MessageHandler) {
    const key = address.toString();
    console.log(`[NetworkReceiver] Listening on ${key}`);
    this.handlers.set(key, handler);
  }

  static async simulateIncoming(address: Address, message: Uint8Array) {
    const key = address.toString();
    const handler = this.handlers.get(key);
    if (!handler) {
      console.error(`[NetworkReceiver] No handler for address ${key}`);
      return;
    }
    console.log(`[NetworkReceiver] Incoming message on ${key}:`, Buffer.from(message).toString());
    const writer = new SimpleWriter(key);
    await handler.dispatch(writer, message);
  }
}

// ---------- BatchMaker (mock) ----------

class BatchMaker {
  static spawn(opts: {
    batchSize: number;
    maxBatchDelayMs: number;
    rxTransaction: ChannelReceiver<Transaction>;
    txMessage: ChannelSender<Batch>;
    mempoolAddresses: Address[];
  }) {
    const { batchSize, rxTransaction, txMessage } = opts;

    (async () => {
      console.log("[BatchMaker] Started");
      let currentBatch: Transaction[] = [];
      let batchId = 0;

      while (true) {
        const tx = await rxTransaction.recv();
        if (tx === null) {
          console.log("[BatchMaker] Channel closed, exiting.");
          return;
        }
        console.log("[BatchMaker] Received tx from client");
        currentBatch.push(tx);

        if (currentBatch.length >= batchSize) {
          batchId += 1;
          const batch: Batch = { id: `batch-${batchId}`, txs: currentBatch };
          console.log(`[BatchMaker] Cutting batch ${batch.id} with ${currentBatch.length} tx(s)`);
          currentBatch = [];

          // In real code, this also reliably broadcasts via network and collects cancel handlers.
          await txMessage.send(batch);
        }
      }
    })();
  }
}

// ---------- QuorumWaiter (mock) ----------

class QuorumWaiter {
  static spawn(opts: {
    committee: Committee;
    stake: number;
    rxMessage: ChannelReceiver<Batch>;
    txBatch: ChannelSender<Batch>;
  }) {
    const { rxMessage, txBatch } = opts;

    (async () => {
      console.log("[QuorumWaiter] Started");
      while (true) {
        const batch = await rxMessage.recv();
        if (!batch) {
          console.log("[QuorumWaiter] Channel closed, exiting.");
          return;
        }
        console.log(`[QuorumWaiter] Got batch ${batch.id}, simulating 2f ACKs`);
        // In real code, this waits for 2f ACKs using cancel handlers from the reliable sender.
        await new Promise((resolve) => setTimeout(resolve, 100)); // simulate some waiting
        console.log(`[QuorumWaiter] Quorum reached for ${batch.id}, forwarding to Processor`);
        await txBatch.send(batch);
      }
    })();
  }
}

// ---------- Processor (mock) ----------

class Processor {
  static spawn(opts: {
    store: Store;
    rxBatch: ChannelReceiver<Batch>;
    txDigest: ChannelSender<Digest>;
  }) {
    const { store, rxBatch, txDigest } = opts;

    (async () => {
      console.log("[Processor] Started");
      while (true) {
        const batch = await rxBatch.recv();
        if (!batch) {
          console.log("[Processor] Channel closed, exiting.");
          return;
        }

        console.log(`[Processor] Processing ${batch.id}, hashing & storing`);
        // Very naive "hash":
        const digest: Digest = `digest-of-${batch.id}`;

        await store.write(digest, batch);
        console.log(`[Processor] Stored batch ${batch.id} with digest ${digest}`);
        console.log(`[Processor] Sending digest to consensus`);
        await txDigest.send(digest);
      }
    })();
  }
}

// ---------- Synchronizer (mock, for consensus -> mempool) ----------

class Synchronizer {
  static spawn(opts: {
    name: PublicKey;
    committee: Committee;
    store: Store;
    gcDepth: number;
    syncRetryDelay: number;
    syncRetryNodes: number;
    rxMessage: ChannelReceiver<ConsensusMempoolMessage>;
  }) {
    const { rxMessage } = opts;

    (async () => {
      console.log("[Synchronizer] Started");
      while (true) {
        const msg = await rxMessage.recv();
        if (!msg) {
          console.log("[Synchronizer] Channel closed, exiting.");
          return;
        }
        console.log("[Synchronizer] Received from consensus:", msg);
        // In real code, this would send BatchRequest to other mempools to fetch missing batches.
      }
    })();
  }
}

// ---------- Mempool itself ----------

const CHANNEL_CAPACITY = 1000;

class Mempool {
  constructor(
    private readonly name: PublicKey,
    private readonly committee: Committee,
    private readonly parameters: Parameters,
    private readonly store: Store,
    private readonly txConsensus: ChannelSender<Digest>
  ) {}

  static spawn(
    name: PublicKey,
    committee: Committee,
    parameters: Parameters,
    store: Store,
    rxConsensus: ChannelReceiver<ConsensusMempoolMessage>,
    txConsensus: ChannelSender<Digest>
  ) {
    parameters.log();
    const mempool = new Mempool(name, committee, parameters, store, txConsensus);

    mempool.handleConsensusMessages(rxConsensus);
    mempool.handleClientsTransactions();
    // mempool.handleMempoolMessages(); // not needed for this client-only demo

    const addr = committee.mempoolAddress(name).toString();
    console.log(`[*] Mempool successfully booted on ${addr}`);
  }

  private handleConsensusMessages(rxConsensus: ChannelReceiver<ConsensusMempoolMessage>) {
    Synchronizer.spawn({
      name: this.name,
      committee: this.committee,
      store: this.store,
      gcDepth: this.parameters.gcDepth,
      syncRetryDelay: this.parameters.syncRetryDelay,
      syncRetryNodes: this.parameters.syncRetryNodes,
      rxMessage: rxConsensus,
    });
  }

  private handleClientsTransactions() {
    // Channels inside the mempool pipeline
    const txChan1 = createChannel<Transaction>(CHANNEL_CAPACITY);
    const txChan2 = createChannel<Batch>(CHANNEL_CAPACITY);
    const txChan3 = createChannel<Batch>(CHANNEL_CAPACITY);

    const txBatchMaker = txChan1.sender;
    const rxBatchMaker = txChan1.receiver;
    const txQuorumWaiter = txChan2.sender;
    const rxQuorumWaiter = txChan2.receiver;
    const txProcessor = txChan3.sender;
    const rxProcessor = txChan3.receiver;

    // NetworkReceiver for clients' transactions
    const txAddress = this.committee.transactionsAddress(this.name);
    NetworkReceiver.spawn(txAddress, new TxReceiverHandler(txBatchMaker));
    console.log(`[Mempool] Listening to client transactions on ${txAddress.toString()}`);

    // BatchMaker
    BatchMaker.spawn({
      batchSize: this.parameters.batchSize,
      maxBatchDelayMs: this.parameters.maxBatchDelayMs,
      rxTransaction: rxBatchMaker,
      txMessage: txQuorumWaiter,
      mempoolAddresses: this.committee.broadcastAddresses(this.name),
    });

    // QuorumWaiter
    QuorumWaiter.spawn({
      committee: this.committee,
      stake: this.committee.stake(this.name),
      rxMessage: rxQuorumWaiter,
      txBatch: txProcessor,
    });

    // Processor -> consensus
    Processor.spawn({
      store: this.store,
      rxBatch: rxProcessor,
      txDigest: this.txConsensus,
    });
  }
}

// ---------- TxReceiverHandler (network -> BatchMaker channel) ----------

class TxReceiverHandler implements MessageHandler {
  constructor(private readonly txBatchMaker: ChannelSender<Transaction>) {}

  async dispatch(_writer: Writer, message: Uint8Array): Promise<void> {
    console.log(
      "[TxReceiverHandler] Received transaction bytes from client:",
      Buffer.from(message).toString()
    );
    await this.txBatchMaker.send(message);
    // In Rust they call tokio::task::yield_now(); here it's a no-op.
  }
}

// ---------- Demo: run a single transaction through the flow ----------

async function runDemo() {
  console.log("=== DEMO START ===");

  // 1. Set up committee, params, store.
  const committee = new Committee();
  const params = new Parameters();
  const store = new Store();
  const nodeName: PublicKey = "node-1";

  // 2. Create consensus <-> mempool channels.
  const consensusToMempool = createChannel<ConsensusMempoolMessage>(CHANNEL_CAPACITY);
  const mempoolToConsensus = createChannel<Digest>(CHANNEL_CAPACITY);

  const rxConsensus = consensusToMempool.receiver;
  const txConsensus = mempoolToConsensus.sender;
  const rxConsensusDigests = mempoolToConsensus.receiver;

  // 3. Start Mempool.
  Mempool.spawn(nodeName, committee, params, store, rxConsensus, txConsensus);

  // 4. Simulate "consensus" reading digests from mempool.
  (async () => {
    console.log("[Consensus] Waiting for digests from mempool...");
    const digest = await rxConsensusDigests.recv();
    console.log(`[Consensus] Got digest from mempool: ${digest}`);
    console.log("=== DEMO END ===");
  })();

  // 5. Simulate a client sending one transaction.
  const txAddress = committee.transactionsAddress(nodeName);
  const clientTxPayload = Buffer.from("tx-1: user pays 10 coins to Bob", "utf8");

  console.log("\n[Client] Sending one transaction to mempool...");
  await NetworkReceiver.simulateIncoming(txAddress, clientTxPayload);
}

runDemo().catch((e) => console.error(e));
