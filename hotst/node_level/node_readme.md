# The NODE program
- This is the validator.
- It runs consensus, mempool, storage.
- It listens on TCP for transactions.


# What is a node?

A HotStuff node is:
    - code that starts the mempool + consensus tasks
        - loads keys + committee files
        - runs event loops
        - processes transactions
        - commits blocks

In our TS mock, that logic lives in:
    - node.ts → the Node engine

It contains:
- ✔ Node.new()
- ✔ Mempool.spawn()
- ✔ Consensus.spawn()
- ✔ Channel implementation
- ✔ analyzeBlocks()

But it does not start anything by itself.

## node.ts walkthrough
- **Channel**: tiny async queue used to pass messages between tasks (mempool → consensus → commit loop). `send` pushes, `recv` awaits next item, `close` drains waiters.
- **Mempool.spawn**: TCP server at `mempoolAddr`. Each newline-delimited JSON payload is parsed as a `Tx` and forwarded over `txMempoolToConsensus`.
- **Consensus.spawn**: consumes `Tx` from the mempool channel, batches 10 at a time into a `Block`, then emits it on `txCommit`. Simplified HotStuff mock—no voting/leader changes.
- **Node.new(committeeFile, keyFile, storePath, parametersFile?)**:
  - loads committee + secret key (names must match)
  - loads parameters or uses defaults
  - builds the three channels (commit, mempool↔consensus)
  - finds this node's mempool address in the committee
  - spawns mempool and consensus loops
  - returns a `Node` with a `commit` channel handle
- **analyzeBlocks()**: forever waits on `commit.recv()` and logs each committed block; this is where app-level processing would live.
- **printKeyFile(filename)**: helper to generate a mock keypair JSON.

## Runtime flow
1) `main.ts deploy <n>` writes committee + key files and calls `Node.new` for each node.
2) Each node starts a mempool TCP server and a consensus loop.
3) Clients send newline-delimited JSON txs to the mempool port; those flow into consensus.
4) Consensus batches and "commits" blocks; `analyzeBlocks` logs them.
