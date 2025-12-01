# Core idea: HotStuff is many independent event loops
- Each subsystem owns one job and runs concurrently.
- Channels connect them so logic stays decoupled.

## Subsystems
- Mempool: receives transactions, batches them.
- Consensus: receives proposals, votes, commits.
- Network: receives and sends messages.
- Store: reads/writes blocks.
- Timer: schedules timeouts.

## 1) Mempool → Consensus
- Producer: Mempool; Consumer: Consensus.
- Flow:
```ts
// when tx arrives
client -> mempool.add(tx);
mempoolOutputChannel.send(batch);

// consensus reacts
while (true) {
  const batch = await mempoolOutputChannel.recv();
  consensus.handleNewBatch(batch);
}
```
- Purpose: Consensus never pulls directly; it only reacts to batches pushed by the mempool.

## 2) Consensus → Other nodes (network sender)
- Producer: Consensus; Consumer: TCP sender worker.
- Flow:
```ts
networkSendChannel.send({ vote });

while (true) {
  const msg = await networkSendChannel.recv();
  tcpSender.send(msg);
}
```
- Why a channel? Consensus stays pure logic; network stays transport; they do not block each other.

## 3) Network receiver → Consensus
- Producer: Network; Consumer: Consensus.
- Flow:
```ts
incomingConsensusChannel.send(hotstuffMsg); // after decoding bytes

while (true) {
  const msg = await incomingConsensusChannel.recv();
  consensus.dispatch(msg);
}
```
- Consensus acts like a controller: everything comes in via a channel.

## 4) Store (KV) → Consensus
- Producer: Store worker; Consumer: Consensus.
- Example (oneshot-style):
```ts
const response = await store.read(key); // awaits a channel-backed reply
```
- Consensus is the client; store is the service.

## 5) Timer → Consensus
- Producer: Timer; Consumer: Consensus.
- Flow:
```ts
timeoutChannel.send({ round });

while (true) {
  const event = await timeoutChannel.recv();
  consensus.handleTimeout(event);
}
```

## Putting it together
```
               ┌────────────┐
     TX input  │  MEMPOOL   │
      ───────► │ (producer) │────────┐
               └────────────┘        │ batches
                                      ▼   (channel)
                               ┌────────────┐
                               │ CONSENSUS  │◄───────────────┐
                               │  (reactor) │                 │
                               └────────────┘                 │
                                      │                      │
                                      │ votes/blocks         │ messages
                                      ▼                      │
                               ┌────────────┐                │
                               │ TCP SENDER │                │
                               └────────────┘                │
                                      ▲                      │
                                      │                      │
            incoming messages         │    ┌─────────────────┘
                   │                  │    │
                   ▼                  │    │
             ┌────────────┐          │    │
             │ TCP RECV   │──────────┘    │
             └────────────┘   (channel)   │
                                          │
                         timer events     │
                         ───────────────► │
                                          │
                         store callbacks  │
                         ───────────────► │
                                          │
                                          ▼
```
Consensus sits in the center; every communication uses a channel.

## Why channels fit HotStuff
- Non-blocking: consensus never waits on network, disk, or mempool delays.
- Actor model: each subsystem is an actor with inbox/outbox channels.
- Deterministic: message order follows channel order—ideal for consensus.
- Mirrors Rust implementation: the real HotStuff uses tokio `mpsc` and `oneshot` the same way.

## Small TypeScript echo
```ts
async function consensusLoop() {
  while (true) {
    const msg = await consensusInput.recv();
    handleConsensusMessage(msg);
  }
}

socket.on("data", (decoded) => {
  consensusInput.send(decoded);
});

setInterval(() => {
  const batch = mempool.makeBatch();
  consensusInput.send(batch);
}, 100);
```
Everything talks through channels.
