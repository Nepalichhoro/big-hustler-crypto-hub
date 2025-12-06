# Channel<T> quick guide
`Channel<T>` is a tiny async queue (see `node.ts`) that lets producers `send` values and consumers `recv` them in order.

## Behavior
- **send(value)**: if a consumer is already waiting, deliver immediately; otherwise enqueue.
- **recv()**: if queue has data, return it; otherwise suspend until a producer sends; if the channel is closed, return `null`.
- **close()**: mark closed and wake any waiters with `null`; no further values flow.
- Note: the `resolvers` array is typed narrowly in code, so `close()` uses `// @ts-ignore` when waking with `null`.

## Minimal example
```ts
const ch = new Channel<number>();

(async () => {
  console.log(await ch.recv()); // waits
})();

ch.send(42); // wakes the waiter, logs 42
```

## Queueing when nobody is waiting
```ts
const ch = new Channel<string>();
ch.send("a"); // queued
ch.send("b"); // queued

console.log(await ch.recv()); // "a"
console.log(await ch.recv()); // "b"
```

## Closing and draining waiters
```ts
const ch = new Channel<number>();
const wait = ch.recv(); // waits
ch.close();
console.log(await wait); // null (channel ended)
```

## Where it is used
- Mempool → Consensus: transactions flow via a `Channel<Tx>`.
- Consensus → Commit loop: committed blocks flow via `Channel<Block>`.
- Consensus ↔ Mempool control path: placeholder channel in this mock.

## Demo scenarios (`channel-demo.ts`)
- **Scenario 1 – send first**: producer queues values before any consumer; later `recv()` drains existing items and then waits for a new send.
- **Scenario 2 – recv first**: consumer awaits with no data; first `send` wakes it immediately.
- **Scenario 3 – multiple receivers**: two consumers wait; first `send` wakes R1, second wakes R2 (FIFO behavior).
- **Scenario 4 – close with waiters**: pending receivers are awakened with `null` when `close()` is called.
- **Scenario 5 – close then recv/send**: `recv()` after close returns `null`; `send` after close is ignored/logged.
