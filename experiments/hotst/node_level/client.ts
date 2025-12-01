// client.ts
import { hideBin } from "yargs/helpers";
import yargs from "yargs";
import * as net from "net";

interface CliArgs {
  target: string; // "127.0.0.1:25100"
  timeout: number;
  size: number;
  rate: number;
  nodes: string[]; // list of "host:port"
}

async function waitForNode(address: string): Promise<void> {
  const [host, portStr] = address.split(":");
  const port = Number(portStr);

  return new Promise((resolve) => {
    const tryConnect = () => {
      const socket = net.createConnection({ host, port }, () => {
        socket.end();
        resolve();
      });
      socket.on("error", () => {
        setTimeout(tryConnect, 10);
      });
    };
    tryConnect();
  });
}

async function waitForAllNodes(nodes: string[]) {
  console.log("[client] Waiting for all nodes to be online...");
  await Promise.all(nodes.map(waitForNode));
  console.log("[client] All nodes online.");
}

async function sendTransactions(
  target: string,
  size: number,
  rate: number
): Promise<void> {
  const [host, portStr] = target.split(":");
  const port = Number(portStr);

  const socket = net.createConnection({ host, port }, () => {
    console.log(`[client] Connected to mempool at ${target}`);
  });

  socket.on("error", (err) => {
    console.error("[client] socket error:", err);
  });

  const PRECISION = 20; // samples per second
  const BURST_DURATION = 1000 / PRECISION; // in ms
  const burst = Math.floor(rate / PRECISION);

  if (burst <= 0) {
    console.warn("[client] rate too low, adjusting to 1 tx/s");
  }

  let counter = 0;
  let randId = Math.floor(Math.random() * 10_000_000);

  console.log(
    `[client] Start sending transactions. size=${size}, rate=${rate} tx/s, burst=${burst}`
  );

  const interval = setInterval(() => {
    const burstCount = burst > 0 ? burst : 1;
    const now = Date.now();
    for (let x = 0; x < burstCount; x++) {
      let kind: "sample" | "standard";
      let id: number;

      if (x === counter % burstCount) {
        kind = "sample";
        id = counter;
        console.log(`[client] Sending sample tx ${counter}`);
      } else {
        kind = "standard";
        randId += 1;
        id = randId;
      }

      const txObj = {
        kind,
        id,
        rawSize: size,
      };
      const line = JSON.stringify(txObj) + "\n";
      socket.write(line);
    }
    counter += 1;

    const elapsed = Date.now() - now;
    if (elapsed > BURST_DURATION) {
      console.warn("[client] transaction rate too high for this client");
    }
  }, BURST_DURATION);

  // keep sending forever; in a real benchmark you'd stop after N seconds
}

async function mainClient() {
  const argv = await yargs(hideBin(process.argv))
    .option("target", {
      type: "string",
      demandOption: true,
      describe: "Node mempool address (host:port)",
    })
    .option("timeout", {
      type: "number",
      demandOption: true,
      describe: "Node timeout in ms (used to wait before starting)",
    })
    .option("size", {
      type: "number",
      demandOption: true,
      describe: "Transaction size (bytes, just metadata here)",
    })
    .option("rate", {
      type: "number",
      demandOption: true,
      describe: "Rate (txs/s)",
    })
    .option("nodes", {
      type: "array",
      demandOption: true,
      describe: "Addresses that must be reachable before starting (host:port)",
    })
    .help()
    .strict()
    .parseAsync();

  const args = argv as unknown as CliArgs;
  console.log("args:", args);

  await waitForAllNodes(args.nodes);
  console.log(
    `[client] Waiting extra ${2 * args.timeout} ms for nodes to synchronize...`
  );
  await new Promise((r) => setTimeout(r, 2 * args.timeout));

  await sendTransactions(args.target, args.size, args.rate);
}

mainClient().catch((e) => {
  console.error("Fatal error in client:", e);
  process.exit(1);
});
