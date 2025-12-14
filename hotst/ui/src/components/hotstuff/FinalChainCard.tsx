type Props = {
  committedBlocks: string[]
}

export function FinalChainCard({ committedBlocks }: Props) {
  const latest = committedBlocks[committedBlocks.length - 1] ?? 'None yet'
  return (
    <div className="card">
      <div className="card-heading">
        <p className="label">Final chain</p>
        <p className="sub">Blocks that reached HotStuff finality.</p>
      </div>
      <div className="stats">
        <div>
          <p className="stat-label">Most recent final</p>
          <p className="stat-value">{latest}</p>
        </div>
        <div>
          <p className="stat-label">All finals</p>
          <p className="stat-value">
            {committedBlocks.length ? committedBlocks.join(', ') : 'None'}
          </p>
        </div>
      </div>
      <p className="note">
        Final means committed via the HotStuff 3-chain rule: block ← child ←
        grandchild all certified. Until that pattern appears, no block is final.
      </p>
    </div>
  )
}
