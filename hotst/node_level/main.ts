// main.ts
import { hideBin } from "yargs/helpers";
import yargs from "yargs";
import { Node } from "./node";
import {
  Committee,
  newSecret,
  readJson,
  writeJson,
  Secret,
} from "./config";
import { promises as fs } from "fs";
import * as path from "path";

async function deployTestbed(nodes: number): Promise<Node[]> {
  const keys: Secret[] = [];
  for (let i = 0; i < nodes; i++) {
    keys.push(newSecret(i));
  }

  const epoch = 1;
  const mempool: Committee["mempool"] = [];
  const consensus: Committee["consensus"] = [];

  for (let i = 0; i < nodes; i++) {
    const key = keys[i];
    const name = key.name;
    const stake = 1;
    const frontPort = 25_000 + i;
    const mempoolPort = 25_100 + i;
    const consensusPort = 25_200 + i;

    mempool.push({
      name,
      stake,
      frontAddr: `127.0.0.1:${frontPort}`,
      mempoolAddr: `127.0.0.1:${mempoolPort}`,
    });

    consensus.push({
      name,
      stake,
      address: `127.0.0.1:${consensusPort}`,
    });
  }

  const committee: Committee = { mempool, consensus };
  const committeeFile = "committee.json";

  await fs.rm(committeeFile, { force: true });
  await writeJson(committeeFile, committee);
  console.log(`[deploy] wrote ${committeeFile}`);

  const nodeInstances: Node[] = [];

  for (let i = 0; i < nodes; i++) {
    const keyFile = `node_${i}.json`;
    await fs.rm(keyFile, { force: true });
    await writeJson(keyFile, keys[i]);
    console.log(`[deploy] wrote key file ${keyFile}`);

    const storePath = `db_${i}`;
    await fs.rm(storePath, { recursive: true, force: true });
    await fs.mkdir(storePath);

    const node = await Node.new(committeeFile, keyFile, storePath, undefined);
    nodeInstances.push(node);
  }

  return nodeInstances;
}

async function main() {
  const argv = await yargs(hideBin(process.argv))
    .command(
      "keys <filename>",
      "Generate a new keypair",
      (y) =>
        y.positional("filename", {
          type: "string",
          describe: "File to write keypair JSON",
        }),
      async (args) => {
        const filename = args.filename as string;
        await Node.printKeyFile(filename);
      }
    )
    .command(
      "run <keys> <committee> <store>",
      "Run a single node",
      (y) =>
        y
          .positional("keys", {
            type: "string",
            describe: "Key file",
          })
          .positional("committee", {
            type: "string",
            describe: "Committee file",
          })
          .positional("store", {
            type: "string",
            describe: "Store path",
          })
          .option("parameters", {
            alias: "p",
            type: "string",
            describe: "Parameters file (optional)",
          }),
      async (args) => {
        const { keys, committee, store, parameters } = args;
        const node = await Node.new(
          committee as string,
          keys as string,
          store as string,
          parameters as string | undefined
        );
        // Block forever analyzing blocks
        await node.analyzeBlocks();
      }
    )
    .command(
      "deploy <nodes>",
      "Deploy local testbed with the specified number of nodes",
      (y) =>
        y.positional("nodes", {
          type: "number",
          describe: "Number of nodes (>=4 recommended)",
        }),
      async (args) => {
        const nodes = args.nodes as number;
        const nodeInstances = await deployTestbed(nodes);
        console.log(
          `[deploy] started ${nodes} nodes. They are listening on ports 25100.. etc.`
        );
        // Keep process alive: all nodes analyze blocks in parallel
        await Promise.all(nodeInstances.map((n) => n.analyzeBlocks()));
      }
    )
    .demandCommand(1)
    .help()
    .strict()
    .parseAsync();
}

main().catch((e) => {
  console.error("Fatal error in main:", e);
  process.exit(1);
});
