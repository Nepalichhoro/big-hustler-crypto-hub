// node.ts
import * as net from "net";
import {
  Committee,
  newSecret,
  Parameters,
  defaultParameters,
  readJson,
  Secret,
} from "./config";

// Simple async channel similar to Rust mpsc (single-producer/multi-consumer-ish)
class Channel<T> {
  private queue: T[] = [];
  private resolvers: ((value: T) => void)[] = [];
  private closed = false;

  send(value: T): void {
    if (this.closed) return;
    const resolver = this.resolvers.shift();
    if (resolver) {
      resolver(value);
    } else {
      this.queue.push(value);
    }
  }

  async recv(): Promise<T | null> {
    if (this.queue.length > 0) {
      return this.queue.shift()!;
    }
    if (this.closed) {
      return null;
    }
    return new Promise<T>((resolve) => {
      this.resolvers.push(resolve);
    });
  }

  close() {
    this.closed = true;
    this.resolvers.forEach((r) => {
      // @ts-ignore
      r(null);
    });
    this.resolvers = [];
  }
}

export interface Tx {
  kind: "sample" | "standard";
  id: number;
  rawSize: number;
}

export interface Block {
  id: number;
  proposer: string;
  txs: Tx[];
}

class Mempool {
  static spawn(
    name: string,
    mempoolAddr: string,
    params: Parameters["mempool"],
    rxConsensusToMempool: Channel<any>, // unused in this mock
    txMempoolToConsensus: Channel<Tx>
  ) {
    console.log(`[mempool ${name}] starting on ${mempoolAddr}`);

    const [host, portStr] = mempoolAddr.split(":");
    const port = Number(portStr);

    const server = net.createServer((socket) => {
      console.log(`[mempool ${name}] client connected from ${socket.remoteAddress}:${socket.remotePort}`);
      let buffer = "";

      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        let idx;
        while ((idx = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;
          try {
            const tx: Tx = JSON.parse(line);
            txMempoolToConsensus.send(tx);
          } catch (e) {
            console.warn(`[mempool ${name}] failed to parse tx:`, e);
          }
        }
      });

      socket.on("error", (err) => {
        console.warn(`[mempool ${name}] socket error:`, err);
      });

      socket.on("close", () => {
        console.log(`[mempool ${name}] client disconnected`);
      });
    });

    server.listen(port, host, () => {
      console.log(`[mempool ${name}] listening on ${host}:${port}`);
    });
  }
}

class Consensus {
  static spawn(
    name: string,
    params: Parameters["consensus"],
    rxMempoolToConsensus: Channel<Tx>,
    txConsensusToMempool: Channel<any>, // unused in this mock
    txCommit: Channel<Block>
  ) {
    console.log(`[consensus ${name}] starting...`);

    (async () => {
      let blockId = 0;
      const batch: Tx[] = [];
      const BATCH_SIZE = 10;

      while (true) {
        const tx = await rxMempoolToConsensus.recv();
        if (tx === null) {
          console.log(`[consensus ${name}] channel closed, stopping`);
          break;
        }
        batch.push(tx);

        if (batch.length >= BATCH_SIZE) {
          const block: Block = {
            id: blockId++,
            proposer: name,
            txs: batch.splice(0, batch.length),
          };
          console.log(
            `[consensus ${name}] committing block ${block.id} with ${block.txs.length} txs`
          );
          txCommit.send(block);
        }
      }
    })().catch((e) => {
      console.error(`[consensus ${name}] loop error:`, e);
    });
  }
}

export class Node {
  public commit: Channel<Block>;
  private name: string;

  private constructor(name: string, commit: Channel<Block>) {
    this.name = name;
    this.commit = commit;
  }

  static async new(
    committeeFile: string,
    keyFile: string,
    storePath: string, // unused in this mock
    parametersFile?: string
  ): Promise<Node> {
    console.log(`[node] bootstrapping from ${committeeFile}, ${keyFile}`);

    const committee = await readJson<Committee>(committeeFile);
    const secret = await readJson<Secret>(keyFile);
    const name = secret.name;

    const params: Parameters =
      parametersFile != null
        ? await readJson<Parameters>(parametersFile)
        : defaultParameters();

    // Channels
    const txCommit = new Channel<Block>();
    const rxCommit = txCommit; // symmetric for our simple Channel

    const txConsensusToMempool = new Channel<any>();
    const rxConsensusToMempool = txConsensusToMempool;

    const txMempoolToConsensus = new Channel<Tx>();
    const rxMempoolToConsensus = txMempoolToConsensus;

    // Figure out the mempool address for this node
    const mempoolEntry = committee.mempool.find((e) => e.name === name);
    if (!mempoolEntry) {
      throw new Error(`No mempool entry for node ${name}`);
    }

    // Spawn mempool & consensus
    Mempool.spawn(
      name,
      mempoolEntry.mempoolAddr,
      params.mempool,
      rxConsensusToMempool,
      txMempoolToConsensus
    );

    Consensus.spawn(
      name,
      params.consensus,
      rxMempoolToConsensus,
      txConsensusToMempool,
      txCommit
    );

    console.log(`[node ${name}] successfully booted, store at ${storePath}`);

    return new Node(name, rxCommit);
  }

  async analyzeBlocks() {
    console.log(`[node ${this.name}] starting analyzeBlocks loop...`);
    while (true) {
      const block = await this.commit.recv();
      if (block === null) {
        console.log(`[node ${this.name}] commit channel closed`);
        break;
      }
      // App-level processing of committed blocks
      console.log(
        `[node ${this.name}] observed committed block ${block.id} with ${block.txs.length} txs`
      );
    }
  }

  static async printKeyFile(filename: string): Promise<void> {
    const secret = newSecret();
    const { writeJson } = await import("./config");
    await writeJson(filename, secret);
    console.log(`[node] wrote key file ${filename}`);
  }
}
