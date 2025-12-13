import { useMemo, useState } from 'react'
import './App.css'

type CertificateKind = 'QC' | 'TC'

type Certificate = {
  round: number
  type: CertificateKind
  formedBy: 'votes' | 'timeouts'
  block?: string
  label: string
}

type Proposal = {
  blockId: string
  round: number
  parent: string
  justifyQC: Certificate
}

type LogEntry = {
  title: string
  detail: string
  tag?: 'safety' | 'info' | 'ignored' | 'round'
}

type RoundRecord = {
  round: number
  proposal?: Proposal
  qc?: Certificate
  tc?: Certificate
  justifyQC?: Certificate
  parent?: string
  notes: string[]
}

type NodeState = {
  currentRound: number
  lockedRound: number
  lockedBlock: string | null
  highQC: Certificate
  proposal?: Proposal
  roundRegressed: boolean
  highQCRegressed: boolean
  certifiedByRound: Record<number, string>
  hasConflictingQC: boolean
  committedBlocks: string[]
  roundAdvanced: boolean
  timeoutIssued: boolean
  staleMessagesIgnored: number
  roundRecords: Record<number, RoundRecord>
  selectedRound: number
  modalRound: number | null
  log: LogEntry[]
  lastVoteSafety: 'unknown' | 'safe' | 'blocked'
}

type InvariantStatus = 'ok' | 'warn' | 'fail'

const genesisQC: Certificate = {
  round: 0,
  type: 'QC',
  formedBy: 'votes',
  block: 'Genesis',
  label: 'QC(Genesis)',
}

const initialRoundRecords: Record<number, RoundRecord> = {
  0: {
    round: 0,
    qc: genesisQC,
    justifyQC: genesisQC,
    parent: '⊥',
    notes: ['Genesis QC anchors the chain.'],
  },
}

const initialState: NodeState = {
  currentRound: 0,
  lockedRound: -1,
  lockedBlock: null,
  highQC: genesisQC,
  roundRegressed: false,
  highQCRegressed: false,
  certifiedByRound: {},
  hasConflictingQC: false,
  committedBlocks: [],
  roundAdvanced: false,
  timeoutIssued: false,
  staleMessagesIgnored: 0,
  roundRecords: initialRoundRecords,
  selectedRound: 0,
  modalRound: null,
  log: [
    {
      title: 'Genesis loaded',
      detail: 'QC(Genesis) anchors the state; all replicas start flexible.',
      tag: 'info',
    },
  ],
  lastVoteSafety: 'unknown',
}

const trimLog = (log: LogEntry[], entry: LogEntry) =>
  [entry, ...log].slice(0, 18)

const statusLabel: Record<InvariantStatus, string> = {
  ok: 'Holds',
  warn: 'Pending',
  fail: 'Violated',
}

function App() {
  const [state, setState] = useState<NodeState>(initialState)

  const proposeBlock = () => {
    setState((prev) => {
      const targetRound = Math.min(prev.currentRound, 5)
      const blockId = `B${targetRound}`
      const proposal: Proposal = {
        blockId,
        round: targetRound,
        parent: prev.highQC.block ?? 'Genesis',
        justifyQC: prev.highQC,
      }

      const updatedRecords: Record<number, RoundRecord> = {
        ...prev.roundRecords,
        [targetRound]: {
          ...(prev.roundRecords[targetRound] ?? {
            round: targetRound,
            notes: [],
          }),
          proposal,
          justifyQC: proposal.justifyQC,
          parent: proposal.parent,
          notes: [
            ...(prev.roundRecords[targetRound]?.notes ?? []),
            `Leader proposed ${blockId} extending ${proposal.justifyQC.label}.`,
          ],
        },
      }

      return {
        ...prev,
        proposal,
        lastVoteSafety: 'unknown',
        roundRecords: updatedRecords,
        log: trimLog(prev.log, {
          title: `Leader proposes ${blockId}`,
          detail: `Proposal extends ${proposal.justifyQC.label} into Round ${targetRound}.`,
          tag: 'round',
        }),
      }
    })
  }

  const formQCFromVotes = () => {
    setState((prev) => {
      if (!prev.proposal) {
        return trimOnly(prev, {
          title: 'No proposal yet',
          detail: 'Propose B0 before collecting votes.',
          tag: 'info',
        })
      }

      const safeToVote =
        prev.proposal.justifyQC.round > prev.lockedRound &&
        prev.lockedRound <= prev.highQC.round

      if (!safeToVote) {
        return trimOnly(prev, {
          title: 'Vote blocked',
          detail: 'Safety-to-vote rule refused this proposal.',
          tag: 'safety',
        })
      }

      const roundKey = prev.proposal.round
      const existing = prev.certifiedByRound[roundKey]
      const conflictDetected =
        (existing && existing !== prev.proposal.blockId) ||
        prev.hasConflictingQC

      const qc: Certificate = {
        round: roundKey,
        type: 'QC',
        formedBy: 'votes',
        block: prev.proposal.blockId,
        label: `QC(${prev.proposal.blockId})`,
      }

      const nextRound = Math.min(Math.max(prev.currentRound, roundKey + 1), 5)
      const roundRegressed = prev.roundRegressed || nextRound < prev.currentRound
      const highQCRegressed =
        prev.highQCRegressed || qc.round < prev.highQC.round

      const nextLog = trimLog(
        conflictDetected
          ? trimLog(prev.log, {
              title: 'Conflicting QC avoided',
              detail: 'Duplicate certification attempt was ignored.',
              tag: 'safety',
            })
          : prev.log,
        {
          title: `QC formed for ${prev.proposal.blockId}`,
          detail: `2f+1 votes certify Round ${roundKey} and advance to Round ${nextRound}.`,
          tag: 'round',
        },
      )

      const updatedRecords: Record<number, RoundRecord> = {
        ...prev.roundRecords,
        [roundKey]: {
          ...(prev.roundRecords[roundKey] ?? { round: roundKey, notes: [] }),
          proposal: prev.proposal,
          qc,
          justifyQC: prev.proposal.justifyQC,
          parent: prev.proposal.parent,
          notes: [
            ...(prev.roundRecords[roundKey]?.notes ?? []),
            `QC formed via votes for ${prev.proposal.blockId}.`,
          ],
        },
      }

      if (!updatedRecords[nextRound]) {
        updatedRecords[nextRound] = {
          round: nextRound,
          justifyQC: qc,
          parent: prev.proposal.blockId,
          notes: [`Entered Round ${nextRound} via ${qc.label}.`],
        }
      }

      return {
        ...prev,
        highQC: qc,
        highQCRegressed,
        currentRound: nextRound,
        roundRegressed,
        roundAdvanced: true,
        certifiedByRound: { ...prev.certifiedByRound, [roundKey]: qc.block! },
        hasConflictingQC: conflictDetected,
        lastVoteSafety: 'safe',
        proposal: { ...prev.proposal, justifyQC: qc },
        roundRecords: updatedRecords,
        selectedRound: Math.min(nextRound, 5),
        log: nextLog,
      }
    })
  }

  const triggerTimeout = () => {
    setState((prev) => {
      const tc: Certificate = {
        round: prev.currentRound,
        type: 'TC',
        formedBy: 'timeouts',
        label: `TC(R${prev.currentRound})`,
      }

      const nextRound = Math.min(prev.currentRound + 1, 5)
      const roundRegressed = prev.roundRegressed || nextRound < prev.currentRound
      const highQCRegressed =
        prev.highQCRegressed || tc.round < prev.highQC.round

      return {
        ...prev,
        highQC: tc.round >= prev.highQC.round ? tc : prev.highQC,
        highQCRegressed,
        timeoutIssued: true,
        currentRound: nextRound,
        roundAdvanced: true,
        roundRegressed,
        proposal: undefined,
        lastVoteSafety: 'unknown',
        roundRecords: (() => {
          const records = { ...prev.roundRecords }
          records[prev.currentRound] = {
            ...(records[prev.currentRound] ?? {
              round: prev.currentRound,
              notes: [],
            }),
            tc,
            notes: [
              ...(records[prev.currentRound]?.notes ?? []),
              `TC collected in Round ${prev.currentRound}.`,
            ],
          }
          if (!records[nextRound]) {
            records[nextRound] = {
              round: nextRound,
              justifyQC: tc,
              parent: records[prev.currentRound]?.proposal?.blockId,
              notes: [`Entered Round ${nextRound} via ${tc.label}.`],
            }
          }
          return records
        })(),
        selectedRound: Math.min(nextRound, 5),
        log: trimLog(prev.log, {
          title: 'Timeout collected',
          detail: 'TC pushes replicas forward when QC is slow.',
          tag: 'round',
        }),
      }
    })
  }

  const ignoreStaleMessage = () => {
    setState((prev) => ({
      ...prev,
      staleMessagesIgnored: prev.staleMessagesIgnored + 1,
      log: trimLog(prev.log, {
        title: 'Stale message ignored',
        detail: `Message from Round ${Math.max(
          0,
          prev.currentRound - 1,
        )} dropped; currentRound=${prev.currentRound}.`,
        tag: 'ignored',
      }),
    }))
  }

  const setSelectedRound = (round: number, openModal?: boolean) =>
    setState((prev) => ({
      ...prev,
      selectedRound: round,
      modalRound: openModal ? round : prev.modalRound,
    }))

  const reset = () => setState(initialState)

  const invariants = useMemo(() => {
    const statuses: {
      id: number
      title: string
      detail: string
      status: InvariantStatus
    }[] = [
      {
        id: 1,
        title: 'Monotonic Round Progress',
        detail: 'currentRound never decreases',
        status: state.roundRegressed ? 'fail' : 'ok',
      },
      {
        id: 2,
        title: 'HighQC Monotonicity',
        detail: `highQC.round=${state.highQC.round}`,
        status: state.highQCRegressed ? 'fail' : 'ok',
      },
      {
        id: 3,
        title: 'HighQC Comes From Quorum',
        detail: 'highQC ∈ {QC, TC}',
        status:
          state.highQC.type === 'QC' || state.highQC.type === 'TC'
            ? 'ok'
            : 'fail',
      },
      {
        id: 4,
        title: 'Safety-to-Vote Rule',
        detail: 'justifyQC.round > lockedRound',
        status:
          state.lastVoteSafety === 'blocked'
            ? 'fail'
            : state.lastVoteSafety === 'unknown'
              ? 'warn'
              : 'ok',
      },
      {
        id: 5,
        title: 'No Locks Exist Yet',
        detail: 'lockedRound = -1; lockedBlock = ⊥',
        status:
          state.lockedRound === -1 && !state.lockedBlock ? 'ok' : 'fail',
      },
      {
        id: 6,
        title: 'Unique Certified Block per Round',
        detail: 'a round cannot have two QCs',
        status: state.hasConflictingQC ? 'fail' : 'ok',
      },
      {
        id: 7,
        title: 'Leader Proposals Extend HighQC',
        detail: 'proposal.justifyQC = highQC',
        status:
          !state.proposal ||
          state.proposal.justifyQC.round === state.highQC.round
            ? 'ok'
            : 'fail',
      },
      {
        id: 8,
        title: 'Round Change Is Eventual',
        detail: 'QC or TC will move the system to Round 1',
        status: state.roundAdvanced ? 'ok' : 'warn',
      },
      {
        id: 9,
        title: 'Locked Round ≤ HighQC Round',
        detail: 'lock never ahead of global QC',
        status:
          state.lockedRound <= state.highQC.round ? 'ok' : 'fail',
      },
      {
        id: 10,
        title: 'No Commit Is Possible Yet',
        detail: 'needs child + grandchild QCs',
        status: state.committedBlocks.length === 0 ? 'ok' : 'fail',
      },
    ]

    return statuses
  }, [
    state.roundRegressed,
    state.highQCRegressed,
    state.highQC.type,
    state.highQC.round,
    state.lastVoteSafety,
    state.lockedRound,
    state.lockedBlock,
    state.hasConflictingQC,
    state.proposal,
    state.roundAdvanced,
    state.committedBlocks.length,
  ])

  const dataSnapshot = useMemo(
    () =>
      JSON.stringify(
        {
          currentRound: state.currentRound,
          highQC: state.highQC,
          locked: {
            lockedRound: state.lockedRound,
            lockedBlock: state.lockedBlock,
          },
          proposal: state.proposal ?? null,
          certifiedByRound: state.certifiedByRound,
          timeoutsIssued: state.timeoutIssued,
          staleMessagesIgnored: state.staleMessagesIgnored,
          committedBlocks: state.committedBlocks,
          roundRecords: state.roundRecords,
        },
        null,
        2,
      ),
    [
      state.certifiedByRound,
      state.committedBlocks,
      state.currentRound,
      state.highQC,
      state.lockedBlock,
      state.lockedRound,
      state.proposal,
      state.staleMessagesIgnored,
      state.timeoutIssued,
      state.roundRecords,
    ],
  )

  const selectedRecord =
    state.roundRecords[state.selectedRound] ??
    ({
      round: state.selectedRound,
      notes: ['Round not yet visited.'],
    } as RoundRecord)

  const roundList = Array.from({ length: 6 }).map((_, idx) => idx)

  const modalRecord =
    state.modalRound !== null
      ? state.roundRecords[state.modalRound] ??
        ({
          round: state.modalRound,
          notes: ['Round not yet visited.'],
        } as RoundRecord)
      : null

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">HotStuff • Genesis → Round 5</p>
          <h1>Genesis Round Explorer</h1>
          <p className="lede">
            Walk through the first HotStuff round, see how QCs move, and watch
            the invariants that keep replicas safe before any locks or commits
            exist.
          </p>
          <div className="chips">
            <span className="chip">
              currentRound <strong>{state.currentRound}</strong>
            </span>
            <span className="chip">
              highQC <strong>{state.highQC.label}</strong>
            </span>
            <span className="chip">
              lockedRound <strong>{state.lockedRound}</strong>
            </span>
          </div>
        </div>
        <div className="stage-card">
          <p className="stage-label">Minimal model</p>
          <div className="rail chain-compact">
            {[0, 1, 2, 3, 4, 5].map((r, idx) => (
              <button
                key={r}
                className="rail-item"
                onClick={() => setSelectedRound(r, true)}
              >
                <div className={`rail-dot ${state.currentRound >= r ? 'active' : ''}`} />
                <p className="rail-caption">{r === 0 ? 'Genesis / R0' : `Round ${r}`}</p>
                {idx < 5 && <div className="rail-line short" />}
              </button>
            ))}
          </div>
          <p className="rail-note">
            QC(Genesis) anchors Round 0. A QC(B0) or TC(0) is required to enter
            Round 1; the chain is shown through Round 5.
          </p>
        </div>
      </header>

      <section className="state-grid">
        <div className="card">
          <div className="card-heading">
            <p className="label">Replica state</p>
            <button className="ghost" onClick={reset}>
              Reset
            </button>
          </div>
          <div className="stats">
            <div>
              <p className="stat-label">currentRound</p>
              <p className="stat-value">{state.currentRound}</p>
            </div>
            <div>
              <p className="stat-label">highQC</p>
              <p className="stat-value">{state.highQC.label}</p>
            </div>
            <div>
              <p className="stat-label">lockedRound</p>
              <p className="stat-value">{state.lockedRound}</p>
            </div>
            <div>
              <p className="stat-label">locks</p>
              <p className="stat-value">
                {state.lockedBlock ?? 'none'}
              </p>
            </div>
          </div>
          <p className="note">
            Locks are intentionally absent in the first round—only QC(Genesis)
            exists, so every replica remains flexible.
          </p>
        </div>

        <div className="card actions">
          <div className="card-heading">
            <p className="label">Round controls (0-5)</p>
            <p className="sub">Drive the state machine by hand.</p>
          </div>
          <div className="action-buttons">
            <button onClick={proposeBlock}>
              Propose B{state.currentRound} (extends highQC)
            </button>
            <button onClick={formQCFromVotes}>
              {`Collect 2f+1 votes → QC(${state.proposal?.blockId ?? `B${state.currentRound}`})`}
            </button>
            <button onClick={triggerTimeout}>
              Timeouts → TC(R{state.currentRound})
            </button>
            <button onClick={ignoreStaleMessage}>
              Ignore stale Round {Math.max(state.currentRound - 1, 0)} msg
            </button>
          </div>
          <p className="note">
            Every action re-checks the invariants. Votes are gated by
            justifyQC.round &gt; lockedRound, and QCs cannot conflict.
          </p>
        </div>

        <div className="card">
          <div className="card-heading">
            <p className="label">Data structures</p>
            <p className="sub">Inspect the live JSON backing this view.</p>
          </div>
          <pre className="json-view">{dataSnapshot}</pre>
        </div>

        <div className="card">
          <div className="card-heading">
            <p className="label">Proposal</p>
            <p className="sub">What the leader is broadcasting in Round 0.</p>
          </div>
          {state.proposal ? (
            <div className="proposal">
              <div>
                <p className="stat-label">Block</p>
                <p className="stat-value">{state.proposal.blockId}</p>
              </div>
              <div>
                <p className="stat-label">Parent</p>
                <p className="stat-value">{state.proposal.parent}</p>
              </div>
              <div>
                <p className="stat-label">justifyQC</p>
                <p className="stat-value">{state.proposal.justifyQC.label}</p>
              </div>
            </div>
          ) : (
            <div className="empty">No proposal yet. Click “Propose B0”.</div>
          )}
        </div>
      </section>

      <section>
        <div className="section-heading">
          <h2>First-round invariants</h2>
          <p className="sub">
            These must hold from genesis through Round 0 and when entering Round
            1—no future assumptions.
          </p>
        </div>
        <div className="invariant-grid">
          {invariants.map((inv) => (
            <div
              key={inv.id}
              className={`invariant ${inv.status}`}
            >
              <div className="invariant-top">
                <p className="label">Invariant {inv.id}</p>
                <span className={`pill ${inv.status}`}>
                  {statusLabel[inv.status]}
                </span>
              </div>
              <h3>{inv.title}</h3>
              <p className="detail">{inv.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="chain-row">
        <div className="card round-detail">
          <div className="card-heading">
            <p className="label">Round focus</p>
            <p className="sub">Click the chain to inspect how we got here.</p>
          </div>
          <div className="round-summary">
            <p className="label">Round {selectedRecord.round}</p>
            <h3>
              {selectedRecord.qc
                ? 'Certified via QC'
                : selectedRecord.tc
                  ? 'Timeout collected'
                  : selectedRecord.proposal
                    ? 'Proposed'
                    : 'Not visited yet'}
            </h3>
            <p className="detail">
              {selectedRecord.proposal
                ? `Block ${selectedRecord.proposal.blockId} extends ${selectedRecord.proposal.justifyQC.label}.`
                : 'No proposal observed for this round.'}
            </p>
            <div className="round-grid">
              <div>
                <p className="stat-label">Block</p>
                <p className="stat-value">
                  {selectedRecord.proposal?.blockId ?? '—'}
                </p>
              </div>
              <div>
                <p className="stat-label">Parent</p>
                <p className="stat-value">
                  {selectedRecord.parent ?? selectedRecord.proposal?.parent ?? '—'}
                </p>
              </div>
              <div>
                <p className="stat-label">justifyQC</p>
                <p className="stat-value">
                  {selectedRecord.justifyQC?.label ??
                    selectedRecord.proposal?.justifyQC.label ??
                    '—'}
                </p>
              </div>
              <div>
                <p className="stat-label">QC</p>
                <p className="stat-value">
                  {selectedRecord.qc?.label ?? '—'}
                </p>
              </div>
              <div>
                <p className="stat-label">TC</p>
                <p className="stat-value">
                  {selectedRecord.tc?.label ?? '—'}
                </p>
              </div>
            </div>
            <div className="notes-list">
              {(selectedRecord.notes ?? []).map((note, idx) => (
                <div key={`${note}-${idx}`} className="note-chip">
                  {note}
                </div>
              ))}
            </div>
            <pre className="json-view small">
              {JSON.stringify(selectedRecord, null, 2)}
            </pre>
          </div>
        </div>

        <div className="card round-chain">
          <div className="card-heading">
            <p className="label">Blockchain round chain</p>
            <p className="sub">Genesis → Round 5</p>
          </div>
          <div className="round-items">
            {roundList.map((round) => {
              const reached = Boolean(
                state.roundRecords[round]?.proposal ||
                  state.roundRecords[round]?.qc ||
                  state.roundRecords[round]?.tc ||
                  round === 0,
              )
              return (
                <button
                  key={round}
                  className={`round-item ${
                state.selectedRound === round ? 'active' : ''
              } ${reached ? 'reached' : ''}`}
                  onClick={() => setSelectedRound(round, true)}
                >
                  <span className="round-circle">{round}</span>
                  <div className="round-meta">
                    <p className="round-title">
                      {round === 0 ? 'Genesis / Round 0' : `Round ${round}`}
                    </p>
                    <p className="round-desc">
                      {state.roundRecords[round]?.qc
                        ? state.roundRecords[round]?.qc?.label
                        : state.roundRecords[round]?.tc
                          ? state.roundRecords[round]?.tc?.label
                          : state.roundRecords[round]?.proposal?.blockId
                            ? `Proposal ${state.roundRecords[round]?.proposal?.blockId}`
                            : 'Not reached yet'}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
          <p className="note">
            Click a round to see the chain of justifications (proposal →
            QC/TC) that delivered it. Up to Round 5 is represented here.
          </p>
        </div>
      </section>

      <section className="log">
        <div className="section-heading">
          <h2>Event log</h2>
          <p className="sub">
            Observe how we “stop and pin” safety in the genesis round.
          </p>
        </div>
        <div className="log-entries">
          {state.log.map((entry, idx) => (
            <div key={`${entry.title}-${idx}`} className="log-entry">
              <div className={`tag ${entry.tag ?? 'info'}`}>
                {entry.tag ?? 'info'}
              </div>
              <div>
                <p className="log-title">{entry.title}</p>
                <p className="log-detail">{entry.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {modalRecord && (
        <div className="modal-backdrop" onClick={() => setState((p) => ({ ...p, modalRound: null }))}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="label">Round detail</p>
                <h3>Round {modalRecord.round}</h3>
              </div>
              <button
                className="ghost"
                onClick={() => setState((p) => ({ ...p, modalRound: null }))}
              >
                Close
              </button>
            </div>
            <div className="round-grid">
              <div>
                <p className="stat-label">Block</p>
                <p className="stat-value">
                  {modalRecord.proposal?.blockId ?? '—'}
                </p>
              </div>
              <div>
                <p className="stat-label">Parent</p>
                <p className="stat-value">
                  {modalRecord.parent ?? modalRecord.proposal?.parent ?? '—'}
                </p>
              </div>
              <div>
                <p className="stat-label">justifyQC</p>
                <p className="stat-value">
                  {modalRecord.justifyQC?.label ??
                    modalRecord.proposal?.justifyQC.label ??
                    '—'}
                </p>
              </div>
              <div>
                <p className="stat-label">QC</p>
                <p className="stat-value">{modalRecord.qc?.label ?? '—'}</p>
              </div>
              <div>
                <p className="stat-label">TC</p>
                <p className="stat-value">{modalRecord.tc?.label ?? '—'}</p>
              </div>
            </div>
            <div className="notes-list">
              {(modalRecord.notes ?? []).map((note, idx) => (
                <div key={`${note}-${idx}`} className="note-chip">
                  {note}
                </div>
              ))}
            </div>
            <pre className="json-view small">
              {JSON.stringify(modalRecord, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

function trimOnly(prev: NodeState, entry: LogEntry): NodeState {
  return {
    ...prev,
    log: trimLog(prev.log, entry),
  }
}

export default App
