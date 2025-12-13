import { nodeCycle } from '../constants'
import type { RoundRecord, VoteStatus } from '../types'

type Props = {
  record: RoundRecord
  selectedLeader: string
  nodeVotes: Record<string, VoteStatus>
  activeProposalRound?: number
  newViewRemaining: number | null
  decisionRemaining: number | null
  onReplicaTimeout: (initiator: string) => void
  onVote: (label: string, choice: VoteStatus) => void
  onOpenModal: (round: number) => void
}

export function NodeCluster({
  record,
  selectedLeader,
  nodeVotes,
  activeProposalRound,
  newViewRemaining,
  decisionRemaining,
  onReplicaTimeout,
  onVote,
  onOpenModal,
}: Props) {
  return (
    <div className="card node-cluster">
      <div className="card-heading">
        <p className="label">Nodes</p>
        <p className="sub">Leader + 4 replicas linked to the selected round.</p>
      </div>
      <div className="node-grid">
        {nodeCycle.map((label) => {
          const isLeader = label === selectedLeader
          const vote = nodeVotes[label] ?? 'pending'
          const canVote =
            record.round === activeProposalRound && vote === 'pending'
          return (
            <div key={label} className={`node-card ${isLeader ? 'leader' : ''}`}>
              <div className="node-head">
                <p className="label">{label}</p>
                {isLeader && <span className="pill ok tiny">Leader</span>}
              </div>
              <h4>Round {record.round}</h4>
              <p className="node-line">
                Proposal: {record.proposal?.blockId ?? '—'}
              </p>
              <p className="node-line">QC: {record.qc?.label ?? '—'}</p>
              <p className="node-line">TC: {record.tc?.label ?? '—'}</p>
              {record.round === activeProposalRound ? (
                <p className="node-line">
                  Vote window: {decisionRemaining !== null ? `${decisionRemaining}s` : '—'}
                </p>
              ) : (
                <p className="node-line">
                  NewView window: {newViewRemaining !== null ? `${newViewRemaining}s` : '—'}
                </p>
              )}
              {!record.proposal && (
                <button
                  className="ghost full"
                  onClick={() => onReplicaTimeout(label)}
                >
                  Replica timeout → NewView
                </button>
              )}
              <p className={`vote-pill ${vote}`}>Vote: {vote}</p>
              <div className="node-actions">
                <button disabled={!canVote} onClick={() => onVote(label, 'approve')}>
                  Approve
                </button>
                <button disabled={!canVote} onClick={() => onVote(label, 'deny')}>
                  Deny
                </button>
                <button
                  className="ghost"
                  disabled={!canVote}
                  onClick={() => onVote(label, 'ignored')}
                >
                  Ignore
                </button>
              </div>
              <button
                className="ghost full"
                onClick={() => onOpenModal(record.round)}
              >
                View round modal
              </button>
            </div>
          )
        })}
      </div>
      <p className="note">
        Nodes mirror the selected round. Click “View round modal” to see full
        justification history and data structures.
      </p>
    </div>
  )
}
