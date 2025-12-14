type Props = {
  currentRound: number
  highQCLabel: string
  lockedRound: number
  lockedBlock: string | null
  onReset: () => void
}

export function ReplicaStateCard({
  currentRound,
  highQCLabel,
  lockedRound,
  lockedBlock,
  onReset,
}: Props) {
  return (
    <div className="card">
      <div className="card-heading">
        <p className="label">Replica state</p>
        <button className="ghost" onClick={onReset}>
          Reset
        </button>
      </div>
      <div className="stats">
        <div>
          <p className="stat-label">currentRound</p>
          <p className="stat-value">{currentRound}</p>
        </div>
        <div>
          <p className="stat-label">highQC</p>
          <p className="stat-value">{highQCLabel}</p>
        </div>
        <div>
          <p className="stat-label">lockedRound</p>
          <p className="stat-value">{lockedRound}</p>
        </div>
        <div>
          <p className="stat-label">locks</p>
          <p className="stat-value">{lockedBlock ?? 'none'}</p>
        </div>
      </div>
      <p className="note">
        Locks are intentionally absent in the first round—only QC(Genesis)
        exists, so every replica remains flexible.
      </p>
    </div>
  )
}
