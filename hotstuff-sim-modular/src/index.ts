import { Committee } from "./committee";
import { Network } from "./network";
import { makeNode } from "./node";
import { PublicKey, Stake } from "./types";

async function runSimulation(): Promise<void> {
  const committee: Committee = {
    authorities: new Map<PublicKey, { stake: Stake }>([
      ["A", { stake: 1 }],
      ["B", { stake: 1 }],
      ["C", { stake: 1 }],
      ["D", { stake: 1 }],
    ]),
  };

  const network = new Network();

  makeNode("A", committee, network);
  makeNode("B", committee, network);
  makeNode("C", committee, network);
  makeNode("D", committee, network);

  console.log(
    "Simulation started… watch logs for proposals, QCs, and commits.\n"
  );
}

runSimulation().catch((err) => {
  console.error("Simulation error:", err);
});
