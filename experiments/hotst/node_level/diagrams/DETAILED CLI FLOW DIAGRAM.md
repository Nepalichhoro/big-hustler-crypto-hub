```lua
                          User runs CLI command
                                  │
                                  ▼
                    ┌────────────────────────┐
                    │      main.ts CLI        │
                    │   (yargs dispatcher)    │
                    └────────────────────────┘
                                  │
             ┌────────────────────┼─────────────────────┐
             ▼                    ▼                     ▼
   ┌─────────────────┐   ┌──────────────────┐   ┌───────────────────────┐
   │  keys <file>     │   │  run k c s       │   │  deploy <N>           │
   │ Generate keys    │   │ Run ONE node     │   │ Run N nodes in 1 proc │
   └─────────────────┘   └──────────────────┘   └───────────────────────┘
             │                    │                          │
    writes JSON key file          │                          │
             │                    │                          │
             │                    ▼                          ▼
             │            Node.new(keys, committee, store)   deployTestbed(N)
             │                    │                          │
             │                    ▼                          ▼
             │           ┌────────────────┐          spawns N× Node.new()
             │           │ start mempool  │                 │
             │           ├────────────────┤                 │
             │           │ start consensus│                 │
             │           └────────────────┘                 │
             │                    │                          │
             │                    ▼                          │
             │           node.analyzeBlocks()   ◄────────────┘
             │
             └── (no node started)

```
