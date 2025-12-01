# Multi node test bed
```lua
main.ts: deploy <N>
        │
        ▼
deployTestbed(N)
        │
        ├── generate N keypairs
        ├── generate committee.json
        ├── create db_0 ... db_(N-1)
        │
        └── for each i in [0..N-1]:
                 Node.new(committee.json, node_i.json, db_i)
                       │
                       ▼
              spawns:
              - mempool_i (port 25100+i)
              - consensus_i
              - analyzeBlocks_i()

```