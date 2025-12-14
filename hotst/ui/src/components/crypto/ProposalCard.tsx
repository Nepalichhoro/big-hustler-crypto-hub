import type { Proposal } from '../../types'

type Props = {
  proposal?: Proposal
}

export function ProposalCard({ proposal }: Props) {
  return (
    <div className="card">
      <div className="card-heading">
        <p className="label">Proposal</p>
        <p className="sub">What the leader is broadcasting in Round 0.</p>
      </div>
      {proposal ? (
        <div className="proposal">
          <div>
            <p className="stat-label">Block</p>
            <p className="stat-value">{proposal.blockId}</p>
          </div>
          <div>
            <p className="stat-label">Parent</p>
            <p className="stat-value">{proposal.parent}</p>
          </div>
          <div>
            <p className="stat-label">justifyQC</p>
            <p className="stat-value">{proposal.justifyQC.label}</p>
          </div>
        </div>
      ) : (
        <div className="empty">No proposal yet. Click “Propose B0”.</div>
      )}
    </div>
  )
}
