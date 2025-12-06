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
  constructor(public kind: ConsensusErrorType, msg: string) {
    super(msg);
    this.name = `ConsensusError(${kind})`;
  }
}
