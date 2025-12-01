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
