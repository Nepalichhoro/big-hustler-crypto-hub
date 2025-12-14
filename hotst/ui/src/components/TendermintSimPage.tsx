import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { nodeCycle, VOTE_THRESHOLD } from '../constants'
import { Toaster } from './Toaster'
import type { RootState, AppDispatch } from '../store/store'
import {
  tmAddToast,
  tmPhaseTimeout,
  tmPropose,
  tmRecordPrecommit,
  tmRecordPrevote,
  tmRemoveToast,
  tmReset,
  tmSetSelected,
} from '../store/tendermintSlice'
import type { TendermintVote } from '../types'

const proposerFor = (round: number) => nodeCycle[round % nodeCycle.length]

export function TendermintSimPage() {
  const tm = useSelector((s: RootState) => s.tendermint)
  const dispatch = useDispatch<AppDispatch>()
  const [now, setNow] = useState(Date.now())

  const addToastWithTTL = (
    message: string,
    tone: 'success' | 'warn' | 'error' | 'info' | 'newview' = 'info',
    ttlMs = 3200,
  ) => {
    const id = Date.now() + Math.random()
    dispatch(tmAddToast({ id, message, tone }))
    setTimeout(() => dispatch(tmRemoveToast(id)), ttlMs)
  }

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    if (tm.phase === 'proposal' && tm.proposeDeadline) {
      const remaining = tm.proposeDeadline - Date.now()
      if (remaining <= 0) {
        addToastWithTTL('Proposer silent → round timeout', 'warn')
        dispatch(tmPhaseTimeout('proposal'))
        return
      }
      const timer = setTimeout(() => {
        addToastWithTTL('Proposer silent → round timeout', 'warn')
        dispatch(tmPhaseTimeout('proposal'))
      }, remaining)
      return () => clearTimeout(timer)
    }
  }, [tm.phase, tm.proposeDeadline, tm.round, tm.height, dispatch])

  useEffect(() => {
    if ((tm.phase === 'prevote' || tm.phase === 'precommit') && tm.phaseDeadline) {
      const remaining = tm.phaseDeadline - Date.now()
      if (remaining <= 0) {
        addToastWithTTL(`${tm.phase} timed out`, 'warn')
        dispatch(tmPhaseTimeout(tm.phase))
        return
      }
      const timer = setTimeout(() => {
        addToastWithTTL(`${tm.phase} timed out`, 'warn')
        dispatch(tmPhaseTimeout(tm.phase))
      }, remaining)
      return () => clearTimeout(timer)
    }
  }, [tm.phase, tm.phaseDeadline, tm.proposal?.blockId, dispatch])

  useEffect(() => {
    const timers = tm.toasts.map((t) => setTimeout(() => dispatch(tmRemoveToast(t.id)), 3200))
    return () => timers.forEach((id) => clearTimeout(id))
  }, [tm.toasts, dispatch])

  const proposeRemaining = tm.proposeDeadline
    ? Math.max(0, Math.ceil((tm.proposeDeadline - now) / 1000))
    : null
  const phaseRemaining = tm.phaseDeadline
    ? Math.max(0, Math.ceil((tm.phaseDeadline - now) / 1000))
    : null

  const selectedRecord = tm.roundRecords[tm.selectedKey]
  const heightStatuses = useMemo(() => {
    const statuses: Record<number, 'committed' | 'timeout' | 'failed' | 'pending'> = {}
    Object.values(tm.roundRecords).forEach((rec) => {
      if (rec.status === 'committed') statuses[rec.height] = 'committed'
      else if (rec.status === 'timeout') statuses[rec.height] = statuses[rec.height] ?? 'timeout'
      else if (rec.status === 'failed') statuses[rec.height] = statuses[rec.height] ?? 'failed'
    })
    return statuses
  }, [tm.roundRecords])

  const snapshot = useMemo(
    () =>
      JSON.stringify(
        {
          height: tm.height,
          round: tm.round,
          phase: tm.phase,
          proposer: proposerFor(tm.round),
          proposal: tm.proposal ?? null,
          prevotes: tm.prevotes,
          precommits: tm.precommits,
          committedBlocks: tm.committedBlocks,
          deadlines: {
            proposeDeadline: tm.proposeDeadline,
            phaseDeadline: tm.phaseDeadline,
          },
          roundRecords: tm.roundRecords,
        },
        null,
        2,
      ),
    [tm],
  )

  const currentVotes =
    tm.phase === 'prevote' ? tm.prevotes : tm.phase === 'precommit' ? tm.precommits : {}

  const handleVote = (validator: string, vote: TendermintVote) => {
    if (tm.phase === 'prevote') {
      dispatch(tmRecordPrevote({ validator, vote }))
    } else if (tm.phase === 'precommit') {
      dispatch(tmRecordPrecommit({ validator, vote }))
    }
  }

  return (
    <div className="page">
      <div className="section-heading">
        <h2>Tendermint simulator</h2>
        <p className="sub">
          Prevote + precommit pipeline across 5 heights with rotating proposers, timeouts, logs, and
          finality.
        </p>
      </div>

      <div className="state-grid">
        <div className="card">
          <div className="card-heading">
            <p className="label">Consensus state</p>
            <p className="sub">prevote → precommit → commit</p>
          </div>
          <div className="stats">
            <div>
              <p className="stat-label">Height</p>
              <p className="stat-value">{tm.height}</p>
            </div>
            <div>
              <p className="stat-label">Round</p>
              <p className="stat-value">{tm.round}</p>
            </div>
            <div>
              <p className="stat-label">Phase</p>
              <p className="stat-value">{tm.phase}</p>
            </div>
            <div>
              <p className="stat-label">Proposer</p>
              <p className="stat-value">{proposerFor(tm.round)}</p>
            </div>
          </div>
          <div className="timer-strip">
            <div>
              <div className="timer-value">
                <span className="timer-clock" />
                Proposal window: {proposeRemaining !== null ? `${proposeRemaining}s` : '—'}
              </div>
              <p className="mini-note">If proposer is silent, validators timeout and advance.</p>
            </div>
            <div>
              <div className="timer-value">
                <span className="timer-clock" />
                {tm.phase === 'proposal' ? 'Prevote window' : 'Stage window'}:{' '}
                {phaseRemaining !== null ? `${phaseRemaining}s` : '—'}
              </div>
              <p className="mini-note">Prevote / precommit timeout triggers a new round.</p>
            </div>
          </div>
        </div>

        <div className="card actions">
          <div className="card-heading">
            <p className="label">Actions</p>
            <p className="sub">Drive proposals and votes manually.</p>
          </div>
          <div className="action-buttons">
            <button onClick={() => dispatch(tmPropose())} disabled={tm.phase !== 'proposal'}>
              Propose block
            </button>
            <button className="ghost" onClick={() => dispatch(tmReset())}>
              Reset Tendermint
            </button>
          </div>
          <p className="note">
            Two-step voting: prevote establishes the candidate, precommit finalizes it. Quorum is
            {` ${VOTE_THRESHOLD} `}
            of 5 validators.
          </p>
        </div>
      </div>

      <div className="state-grid">
        <div className="card">
          <div className="card-heading">
            <p className="label">Current proposal</p>
            <p className="sub">Block + QC artifacts</p>
          </div>
          {tm.proposal ? (
            <div className="proposal">
              <div>
                <p className="stat-label">Block</p>
                <p className="stat-value">{tm.proposal.blockId}</p>
              </div>
              <div>
                <p className="stat-label">Proposer</p>
                <p className="stat-value">{tm.proposal.proposer}</p>
              </div>
              <div>
                <p className="stat-label">Payload</p>
                <p className="stat-value">{tm.proposal.payload}</p>
              </div>
            </div>
          ) : (
            <div className="empty">No proposal in-flight.</div>
          )}
          <p className="note">
            Tendermint commits when a block gathers both prevote and precommit quorums in the same
            round. Timeouts or nil/deny votes rotate to the next proposer without committing.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-heading">
          <p className="label">Validators</p>
          <p className="sub">Cast prevote / precommit.</p>
        </div>
        <div className="round-grid">
          {nodeCycle.map((v) => {
            const status = currentVotes[v] ?? 'pending'
            return (
              <div key={v} className="vote-strip">
                <strong>{v}</strong>
                <span>→ {status}</span>
                {(tm.phase === 'prevote' || tm.phase === 'precommit') && (
                  <>
                    <button
                      className="ghost"
                      disabled={status !== 'pending'}
                      onClick={() => handleVote(v, 'approve')}
                    >
                      Approve
                    </button>
                    <button
                      className="ghost"
                      disabled={status !== 'pending'}
                      onClick={() => handleVote(v, 'deny')}
                    >
                      Deny
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>
        <p className="note">
          Prevote quorum → precommit stage. Precommit quorum → commit. Rejection or timeout → next
          round with a new proposer.
        </p>
      </div>

      <div className="card">
        <div className="card-heading">
          <p className="label">Heights (1-5)</p>
          <p className="sub">Click to inspect the round record.</p>
        </div>
        <div className="chain-compact">
          {[1, 2, 3, 4, 5].map((h) => {
            const status = heightStatuses[h] ?? 'pending'
            const isSelected = tm.selectedKey.startsWith(`${h}-`)
            return (
              <button
                key={h}
                className={`rail-item ${status === 'committed' ? 'accepted' : status === 'timeout' ? 'timeout' : status === 'failed' ? 'rejected' : 'idle'}`}
                onClick={() => {
                  const firstKey = Object.keys(tm.roundRecords).find((k) => k.startsWith(`${h}-`))
                  if (firstKey) dispatch(tmSetSelected(firstKey))
                }}
              >
                <div className={`rail-dot ${isSelected ? 'active' : ''}`} />
                <div>
                  <p className="rail-caption">Height {h}</p>
                  <p className="rail-leader">
                    {status === 'committed'
                      ? 'Committed'
                      : status === 'timeout'
                        ? 'Timeout'
                        : status === 'failed'
                          ? 'Rejected'
                          : 'Pending'}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
        <div className="round-detail">
          <h3>Selected record</h3>
          {selectedRecord ? (
            <>
              <p className="detail">
                Height {selectedRecord.height}, Round {selectedRecord.round}, proposer{' '}
                {selectedRecord.proposer}
              </p>
              <div className="note-chip">Prevote: {selectedRecord.prevote ?? '—'}</div>
              <div className="note-chip">Precommit: {selectedRecord.precommit ?? '—'}</div>
              <div className="note-chip">Status: {selectedRecord.status ?? 'pending'}</div>
              <div className="note-chip">
                Proposal: {selectedRecord.proposal ? selectedRecord.proposal.blockId : '—'}
              </div>
              <p className="note">
                {(selectedRecord.notes ?? []).length ? selectedRecord.notes.join(' • ') : 'No notes yet.'}
              </p>
            </>
          ) : (
            <p className="note">No record selected.</p>
          )}
        </div>
      </div>

      <div className="state-grid">
        <div className="card">
          <div className="card-heading">
            <p className="label">Finality</p>
            <p className="sub">Committed chain so far</p>
          </div>
          <p className="stat-label">Latest committed</p>
          <p className="stat-value">{tm.lastCommitted ?? '—'}</p>
          <p className="stat-label">All committed</p>
          <p className="note">{tm.committedBlocks.join(' → ')}</p>
          <p className="note">
            Tendermint finalizes in the same height once prevote + precommit quorums align. No
            speculative chain; each height commits independently.
          </p>
        </div>
        <div className="card">
          <div className="card-heading">
            <p className="label">Logs</p>
            <p className="sub">Latest 18 events</p>
          </div>
          <ul className="log-list">
            {tm.log.map((entry, idx) => (
              <li key={`${entry.title}-${idx}`}>
                <p className="log-title">{entry.title}</p>
                <p className="log-detail">{entry.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="card">
        <div className="card-heading">
          <p className="label">Snapshot</p>
          <p className="sub">JSON view of Tendermint simulator state</p>
        </div>
        <pre className="json-view small">{snapshot}</pre>
      </div>

      <Toaster toasts={tm.toasts} />
    </div>
  )
}
