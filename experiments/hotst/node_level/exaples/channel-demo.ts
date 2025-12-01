class Channel<T> {
  private queue: T[] = [];
  private resolvers: ((value: T | null) => void)[] = [];
  private closed = false;

  send(value: T): void {
    if (this.closed) {
      console.log("[send] Channel is closed, dropping value:", value);
      return;
    }
    // resolvers == waiting receivers
    const resolver = this.resolvers.shift();
    if (resolver) {
      console.log("[send] Handing value directly to waiting recv:", value);
      resolver(value);
    } else {
      console.log("[send] No one waiting, enqueueing:", value);
      this.queue.push(value);
    }
  }

  async recv(): Promise<T | null> {
    if (this.queue.length > 0) {
      const value = this.queue.shift()!;
      console.log("[recv] Got value immediately from queue:", value);
      return value;
    }
    if (this.closed) {
      console.log("[recv] Channel already closed, returning null");
      return null;
    }
    console.log("[recv] No value, waiting for future send...");
    return new Promise<T | null>((resolve) => {
      this.resolvers.push(resolve);
    });
  }

  close() {
    console.log("[close] Closing channel");
    this.closed = true;
    this.resolvers.forEach((r, i) => {
      console.log(`[close] Waking pending receiver #${i} with null`);
      r(null);
    });
    this.resolvers = [];
  }
}

// Helper to wait
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Scenario 1:
 * Sender sends first, receiver comes later.
 */
async function scenarioSendFirst() {
  console.log("\n--- Scenario 1: send first, then recv ---");
  const ch = new Channel<number>();

  ch.send(1);
  ch.send(2);

  console.log("Calling recv #1");
  console.log("Received:", await ch.recv());

  console.log("Calling recv #2");
  console.log("Received:", await ch.recv());

  console.log("Calling recv #3 (channel empty, will wait until send)");
  setTimeout(() => {
    console.log("Sending 3 after 1 second");
    ch.send(3);
  }, 1000);

  console.log("Received:", await ch.recv());
}

/**
 * Scenario 2:
 * Receiver calls recv() before any send.
 */
async function scenarioRecvFirst() {
  console.log("\n--- Scenario 2: recv first, then send ---");
  const ch = new Channel<string>();

  // Start a receiver that is waiting
  (async () => {
    console.log("[worker] Waiting for message...");
    const msg = await ch.recv();
    console.log("[worker] Got message:", msg);
  })();

  console.log("Main: sleeping 1s, then sending...");
  await sleep(1000);
  ch.send("hello");
}

/**
 * Scenario 3:
 * Multiple receivers, multiple sends.
 */
async function scenarioMultipleReceivers() {
  console.log("\n--- Scenario 3: multiple receivers ---");
  const ch = new Channel<string>();

  // Two receivers start waiting immediately
  (async () => {
    console.log("[R1] recv...");
    const v = await ch.recv();
    console.log("[R1] got:", v);
  })();

  (async () => {
    console.log("[R2] recv...");
    const v = await ch.recv();
    console.log("[R2] got:", v);
  })();

  await sleep(500);
  console.log("Sending A");
  ch.send("A");
  console.log("Sending B");
  ch.send("B");
}

/**
 * Scenario 4:
 * Close channel with pending receivers.
 */
async function scenarioCloseWithPending() {
  console.log("\n--- Scenario 4: close with pending receivers ---");
  const ch = new Channel<number>();

  (async () => {
    console.log("[R1] recv...");
    const v = await ch.recv();
    console.log("[R1] got:", v);
  })();

  (async () => {
    console.log("[R2] recv...");
    const v = await ch.recv();
    console.log("[R2] got:", v);
  })();

  await sleep(500);
  console.log("Closing channel now");
  ch.close();
}

/**
 * Scenario 5:
 * Close channel, then attempt recv and send.
 */
async function scenarioCloseThenRecvSend() {
  console.log("\n--- Scenario 5: close, then recv & send ---");
  const ch = new Channel<number>();

  ch.close();
  console.log("Calling recv after close");
  console.log("Received:", await ch.recv());

  console.log("Trying to send after close");
  ch.send(42);
}

/**
 * Run all scenarios sequentially.
 */
async function main() {
  await scenarioSendFirst();
  await sleep(500);

  await scenarioRecvFirst();
  await sleep(500);

  await scenarioMultipleReceivers();
  await sleep(500);

  await scenarioCloseWithPending();
  await sleep(500);

  await scenarioCloseThenRecvSend();
}

main().catch(console.error);
