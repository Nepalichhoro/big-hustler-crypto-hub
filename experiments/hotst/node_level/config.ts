// config.ts
import { promises as fs } from "fs";

export interface ConsensusParameters {
  dummy: boolean;
}

export interface MempoolParameters {
  dummy: boolean;
}

export interface Parameters {
  consensus: ConsensusParameters;
  mempool: MempoolParameters;
}

export function defaultParameters(): Parameters {
  return {
    consensus: { dummy: true },
    mempool: { dummy: true },
  };
}

export interface Secret {
  name: string;   // public key (mock)
  secret: string; // private key (mock)
}

export function newSecret(index?: number): Secret {
  const id = index ?? Math.floor(Math.random() * 1_000_000);
  return {
    name: `node_${id}`,
    secret: `secret_${id}_${Math.random().toString(36).slice(2)}`,
  };
}

export interface MempoolEntry {
  name: string;
  stake: number;
  frontAddr: string;   // unused in this mock
  mempoolAddr: string; // "127.0.0.1:25100"
}

export interface ConsensusEntry {
  name: string;
  stake: number;
  address: string; // "127.0.0.1:25200" (unused in this mock)
}

export interface Committee {
  mempool: MempoolEntry[];
  consensus: ConsensusEntry[];
}

export async function readJson<T>(path: string): Promise<T> {
  const data = await fs.readFile(path, "utf8");
  return JSON.parse(data) as T;
}

export async function writeJson(path: string, value: any): Promise<void> {
  const json = JSON.stringify(value, null, 2);
  await fs.writeFile(path, json + "\n", "utf8");
}
