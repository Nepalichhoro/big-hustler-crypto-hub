```lua
Client (client.ts)
        │  send tx
        ▼
 ┌──────────────────────┐
 │ Mempool (node.ts)     │  TCP port 25100+i
 └──────────────────────┘
        │ tx channel
        ▼
 ┌──────────────────────┐
 │ Consensus (node.ts)   │
 └──────────────────────┘
        │ committed block channel
        ▼
 ┌──────────────────────┐
 │ analyzeBlocks()       │
 └──────────────────────┘

```