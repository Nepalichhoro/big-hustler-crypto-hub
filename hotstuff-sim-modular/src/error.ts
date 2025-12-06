import { Digest, PublicKey, Round } from "./types";

export type ConsensusErrorType =
  | "NetworkError"
  | "SerializationError"
  | "StoreError"
  | "NotInCommittee"
  | "InvalidSignature"
  | "AuthorityReuse"
  | "UnknownAuthority"
  | "QCRequiresQuorum"
  | "TCRequiresQuorum"
  | "MalformedBlock"
  | "WrongLeader"
  | "InvalidPayload";

export class ConsensusError extends Error {
  constructor(public kind: ConsensusErrorType, message: string) {
    super(message);
    this.name = `ConsensusError(${kind})`;
  }

  static notInCommittee(pk: PublicKey) {
    return new ConsensusError("NotInCommittee", `Node ${pk} is not in committee`);
  }

  static wrongLeader(digest: Digest, leader: PublicKey, round: Round) {
    return new ConsensusError(
      "WrongLeader",
      `Received block ${digest} from leader ${leader} at round ${round}`
    );
  }
}

export type ConsensusResult<T> = T; // for simplicity in TS version
