# Mempool actor graph (BatchMaker, QuorumWaiter, Processor, Synchronizer)

Mini-graph of four async actors, each with a single inbox channel. They never call each other directly; every handoff is a `Channel<T>` send/recv. This mirrors the Rust HotStuff/Narwhal mempool layout.

## Channels at a glance
- `txInput`: client → BatchMaker (raw transactions).
- `ourBatches`: BatchMaker → QuorumWaiter (newly built batches we originated).
- `peerAcks`: network → QuorumWaiter (proof other nodes stored our batch).
- `readyDigests`: QuorumWaiter → Processor (batch digests safe to advertise to consensus/primary).
- `consensusDigests`: consensus/primary → Processor (which digests it needs materialized).
- `storeLookup`: Processor → Synchronizer (batch digests we are missing locally).
- `batchResponses`: Synchronizer → Processor (downloaded batches).
- `batchOut`: Processor → consensus/primary (full batches ready for certificates).

## Actor responsibilities
- **BatchMaker**: buffers incoming tx until size/timeout, seals a batch `{digest, payload}`. Persists locally, broadcasts to peers, pushes digest to `ourBatches`.
- **QuorumWaiter**: counts `Ack` messages from peers for each digest. When it sees 2f+1 acks (or a timeout policy), forwards the digest to `readyDigests` so consensus can rely on it.
- **Processor**: central router. It (a) accepts safe digests from `readyDigests` and tells consensus/primary; (b) reacts to `consensusDigests` by ensuring the batch exists—if missing, asks Synchronizer; once present, emits full batches on `batchOut`.
- **Synchronizer**: fetcher/repair loop. Given a digest, issues fetch requests to peers, retries on timeouts, and answers `batchResponses` once payload arrives or is rebuilt from local disk.

## Wiring (one node)
```
clients ──► txInput ─► [BatchMaker] ─► ourBatches ─► [QuorumWaiter] ─► readyDigests ─┐
                                                                                    │
                                              peerAcks ◄── network sender/receiver ─┘

readyDigests ─► [Processor] ─► batchOut ─► consensus/primary
        ▲             │
        │             ├─ requests missing digests ─► storeLookup ─► [Synchronizer]
consensusDigests ◄────┘                                     │
                                                            └─► batchResponses ─► [Processor]
```

## Happy-path narrative
1) Client tx hit `txInput`; BatchMaker seals a batch and floods peers.
2) Peers reply with `Ack`; QuorumWaiter waits for quorum, then marks the digest “ready”.
3) Processor forwards ready digests to consensus/primary. When consensus later asks for concrete batches (`consensusDigests`), Processor serves them from local store.
4) If a digest is missing, Processor asks Synchronizer. Synchronizer fetches from peers and returns the payload; Processor resumes and hands the batch to consensus.

## Why this layout?
- Backpressure via channels: if consensus is slow, Processor queues; BatchMaker keeps batching independently.
- Fault isolation: Synchronizer retries/fetches without blocking BatchMaker.
- Deterministic: ordering within each channel is preserved, matching the real actor model used in the Rust implementation.***
