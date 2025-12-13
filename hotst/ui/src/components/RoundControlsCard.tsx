type Props = {
  currentRound: number
  proposalId?: string
  onPropose: () => void
  onCollectQC: () => void
  onTimeout: () => void
  onIgnore: () => void
}

export function RoundControlsCard({
  currentRound,
  proposalId,
  onPropose,
  onCollectQC,
  onTimeout,
  onIgnore,
}: Props) {
  return (
    <div className="card actions">
      <div className="card-heading">
        <p className="label">Round controls (0-5)</p>
        <p className="sub">Drive the state machine by hand.</p>
      </div>
      <div className="action-buttons">
        <button onClick={onPropose}>Propose B{currentRound} (extends highQC)</button>
        <button onClick={onCollectQC}>
          {`Collect 2f+1 votes → QC(${proposalId ?? `B${currentRound}`})`}
        </button>
        <button onClick={onTimeout}>Timeouts → TC(R{currentRound})</button>
        <button onClick={onIgnore}>
          Ignore stale Round {Math.max(currentRound - 1, 0)} msg
        </button>
      </div>
      <p className="note">
        Every action re-checks the invariants. Votes are gated by
        justifyQC.round &gt; lockedRound, and QCs cannot conflict.
      </p>
    </div>
  )
}
