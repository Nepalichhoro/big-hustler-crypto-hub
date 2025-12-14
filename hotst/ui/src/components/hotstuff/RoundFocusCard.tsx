import type { RoundRecord } from '../../types'
import { VOTE_THRESHOLD } from '../../constants'

type Props = {
  record: RoundRecord
  leader: string
  approvals: number
  decisionRemaining: number | null
}

export function RoundFocusCard({
  record,
  leader,
  approvals,
  decisionRemaining,
}: Props) {
  return (
    <div className="card round-detail">
      <div className="card-heading">
        <p className="label">Round focus</p>
        <p className="sub">Click the chain to inspect how we got here.</p>
      </div>
      <div className="round-summary">
        <p className="label">Round {record.round}</p>
        <h3>
          {record.qc
            ? 'Certified via QC'
            : record.tc
              ? 'Timeout collected'
              : record.proposal
                ? 'Proposed'
                : 'Not visited yet'}
        </h3>
        <p className="detail">
          {record.proposal
            ? `Block ${record.proposal.blockId} extends ${record.proposal.justifyQC.label}.`
            : 'No proposal observed for this round.'}
        </p>
        {record.proposal && (
          <div className="vote-strip">
            <span>
              Approvals {approvals}/{VOTE_THRESHOLD}
            </span>
            {decisionRemaining !== null && (
              <span>Decision window: {decisionRemaining}s</span>
            )}
          </div>
        )}
        <div className="round-grid">
          <div>
            <p className="stat-label">Block</p>
            <p className="stat-value">{record.proposal?.blockId ?? '—'}</p>
          </div>
          <div>
            <p className="stat-label">Parent</p>
            <p className="stat-value">
              {record.parent ?? record.proposal?.parent ?? '—'}
            </p>
          </div>
          <div>
            <p className="stat-label">justifyQC</p>
            <p className="stat-value">
              {record.justifyQC?.label ??
                record.proposal?.justifyQC.label ??
                '—'}
            </p>
          </div>
          <div>
            <p className="stat-label">QC</p>
            <p className="stat-value">{record.qc?.label ?? '—'}</p>
          </div>
          <div>
            <p className="stat-label">TC</p>
            <p className="stat-value">{record.tc?.label ?? '—'}</p>
          </div>
          <div>
            <p className="stat-label">Leader</p>
            <p className="stat-value">{leader}</p>
          </div>
        </div>
        <div className="notes-list">
          {(record.notes ?? []).map((note, idx) => (
            <div key={`${note}-${idx}`} className="note-chip">
              {note}
            </div>
          ))}
        </div>
        <pre className="json-view small">
          {JSON.stringify(record, null, 2)}
        </pre>
      </div>
    </div>
  )
}
