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
