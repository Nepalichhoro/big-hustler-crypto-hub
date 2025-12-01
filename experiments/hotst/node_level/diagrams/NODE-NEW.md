```lua
Node.new(...)
   │
   ▼
┌────────────────────────────────────────────┐
│              node.ts                        │
│     (engine that starts the services)       │
└────────────────────────────────────────────┘
   │
   │ 1. Load key (identity)
   │ 2. Load committee.json
   │ 3. Load parameters
   │ 4. Create channels
   │
   ▼
┌────────────────────────────────────────────┐
│         Mempool.spawn()                    │
│   opens TCP port e.g., 25100               │
│   accepts tx from clients                  │
│   pushes tx → txMempoolToConsensus channel │
└────────────────────────────────────────────┘
   │
   ▼
┌────────────────────────────────────────────┐
│         Consensus.spawn()                  │
│   reads tx from channel                    │
│   batches + "commits" blocks               │
│   sends committed blocks → txCommit channel│
└────────────────────────────────────────────┘
   │
   ▼
analyzeBlocks() loop
   │
   ▼
print committed blocks

```