```lua
main.ts: run node_0.json committee.json db_0
        │
        ▼
Node.new(...)
        │
        ├── Start mempool server on assigned port
        ├── Start consensus loop
        └── Start analyzeBlocks()


```