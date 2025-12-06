# committee.json
- Describes the local HotStuff committee used by the mock node.
- Consumed by `Node.new(...)` to wire mempool + consensus networking.
- Generated automatically by `ts-node main.ts deploy <n>`, but can be hand-edited for custom layouts.

## Shape
- Root object has two arrays: `mempool` and `consensus`.
- Each entry represents one node and reuses the same `name` across both arrays.

### mempool entries
- Fields: `name`, `stake`, `frontAddr` (transaction intake), `mempoolAddr` (gossip between mempools).
- Example:
```json
{
  "mempool": [
    {
      "name": "node_0",
      "stake": 1,
      "frontAddr": "127.0.0.1:25000",
      "mempoolAddr": "127.0.0.1:25100"
    }
  ]
}
```
- `frontAddr` is where clients send txns; `mempoolAddr` is where nodes share txns.

### consensus entries
- Fields: `name`, `stake`, `address` (HotStuff consensus transport).
- Example (paired with the mempool entry above):
```json
{
  "consensus": [
    {
      "name": "node_0",
      "stake": 1,
      "address": "127.0.0.1:25200"
    }
  ]
}
```
- All nodes should appear in both arrays with matching `name` and `stake`.

## Sample (4-node local testbed)
- `data-samples/committee.json` currently includes four equal-stake nodes:
  - `node_0` → front 25000, mempool 25100, consensus 25200
  - `node_1` → front 25001, mempool 25101, consensus 25201
  - `node_2` → front 25002, mempool 25102, consensus 25202
  - `node_3` → front 25003, mempool 25103, consensus 25203
- Edit ports or stakes to model different topologies or weights; keep addresses unique per service.
