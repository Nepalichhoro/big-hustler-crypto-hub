```lua
client.ts  --target 127.0.0.1:25100
        │
        ▼
Connect to mempool TCP port
        │
Send TX JSON lines
        │
        ▼
+mempool receives JSON
+mempool pushes tx → channel
        │
        ▼
consensus takes from tx channel
consensus commits blocks
        │
        ▼
node.analyzeBlocks prints committed blocks

```