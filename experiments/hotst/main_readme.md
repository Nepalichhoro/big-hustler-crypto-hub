## When you run:
- npx tsx main.ts run node_0.json committee.json db_0

## This calls:
- Node.new(...)  ← start mempool + consensus
- node.analyzeBlocks()  ← event loop that watches commits

--------

You start a HotStuff node:
- opens a mempool TCP listener (25100 + node index)
- spawns:
    - Mempool task
- Consensus task
    - loads:
        - keypair (identity)
        - committee.json (other nodes)
        - parameters
    - waits for tx from clients
    - commits blocks

👉 This is the blockchain node.
👉 It is the “server” or “backend”.

---- 
## What main.ts does

main.ts contains the CLI entrypoint (like Rust main.rs).

This program:
    - Reads command-line arguments (keys, committee, store)
    - Calls Node.new(...)
    - Starts the node by calling node.analyzeBlocks()
        - Or deploys many nodes
        - Or initializes config files
        - Or prints keypairs
So:
✔ main.ts = the “launcher”
✔ node.ts = the “engine”
Both are necessary to create a running node.


## main cli roles
This CLI exposes three commands:
    - keys
    - run
    - deploy


### 1 - keys 
1️⃣ keys
- Generate a node keypair

- Creates a JSON file like:
    { "name": "node_123", "secret": "secret_123_something" }

### 2 - run 
2️⃣ run — Start ONE node

This launches a validator node:
- loads keys
- loads committee
- loads parameters
- starts mempool + consensus
- starts block analyzer loop

### 3 - deploy
Useful for local testbed / benchmarking.

Automatically:
- Generates keys for all nodes
- Generates committee.json
- Creates DB folders
- Starts each node
- Runs all analyze-block loops in parallel

----- ----- ----- ----- ----- ----- ----- ----- 

# More Detailed

## Command 1: keys <filename>
Purpose: generate a keypair for a node

CLI Spec:

```javascript
    .command(
    "keys <filename>",
    "Generate a new keypair",
    ...
    async (args) => {
        const filename = args.filename as string;
        await Node.printKeyFile(filename);
    }
    )
```

## What it does:
- npx tsx main.ts keys node_0.json

    - - Will create:
    ```json
        {
        "name": "node_5281",
        "secret": "secret_5281_whatever"
        }
    ```
    - This is your "validator identity".

-----
# Command 2: run <keys> <committee> <store>
Purpose: Start ONE node (just like running validator software)**

Example:

npx tsx main.ts run node_0.json committee.json db_0


CLI definition:
```javascript 
        .command(
        "run <keys> <committee> <store>",
        "Run a single node",
        (y) => y.positional("keys")...
        async (args) => {
            const node = await Node.new(...);
            await node.analyzeBlocks();
        }
        )
```
What it does:
    - Loads config:
        - keys file (identity)
        - committee.json
        - parameters.json (optional)
    - Starts:
        - mempool server (25100 + index)
        - consensus loop
        - commit channel
    Runs analyzer:
        - [node_0] observed committed block 3 with 10 txs

-----
# Command 3: deploy <nodes>
Purpose: Start MULTIPLE nodes in a single process (local cluster)**

Example:
```javascript
    npx tsx main.ts deploy 4
```


CLI definition:
```javascript 
        .command(
        "deploy <nodes>",
        "Deploy local testbed with number of nodes",
        async (args) => {
            const nodeInstances = await deployTestbed(nodes);
            await Promise.all(nodeInstances.map((n) => n.analyzeBlocks()));
        }
        )
```

## What it does:
    - Calls deployTestbed(4)
    - Generates:
        - committee.json
        - node_0.json … node_3.json
        - db_0 … db_3
    - Starts 4 nodes simultaneously inside one process
    - Keeps them alive by analyzing blocks for all nodes

This is the fastest way to test multi-node consensus with only 1 terminal.