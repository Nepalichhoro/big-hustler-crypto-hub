import type { RoundRecord } from '../../types'

type Props = {
  record: RoundRecord
  leader: string
  onClose: () => void
}

export function RoundModal({ record, leader, onClose }: Props) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="label">Round detail</p>
            <h3>Round {record.round}</h3>
          </div>
          <button className="ghost" onClick={onClose}>
            Close
          </button>
        </div>
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
              {record.justifyQC?.label ?? record.proposal?.justifyQC.label ?? '—'}
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
