import { makeCommittee } from "./config";
import { Consensus } from "./consensus";
import { Network } from "./network";
import { Store } from "./store";
import { PublicKey, Stake } from "./types";

async function main() {
  const info: { name: PublicKey; stake: Stake; address: string }[] = [
    { name: "A", stake: 1, address: "A" },
    { name: "B", stake: 1, address: "B" },
    { name: "C", stake: 1, address: "C" },
    { name: "D", stake: 1, address: "D" }
  ];

  const committee = makeCommittee(info, 1);
  const network = new Network();

  const storeA = new Store();
  const storeB = new Store();
  const storeC = new Store();
  const storeD = new Store();

  Consensus.spawn("A", committee, undefined, storeA, network);
  Consensus.spawn("B", committee, undefined, storeB, network);
  Consensus.spawn("C", committee, undefined, storeC, network);
  Consensus.spawn("D", committee, undefined, storeD, network);

  console.log("HotStuff TS simulation running. Watch the logs for commits, QCs, TCs, and timeouts.");
}

main().catch((e) => console.error(e));
