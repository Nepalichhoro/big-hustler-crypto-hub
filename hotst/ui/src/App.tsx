import { useEffect, useMemo, useState } from 'react'
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

type Toast = {
  id: number
  message: string
  tone: 'success' | 'warn' | 'error' | 'info'
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

type VoteStatus = 'pending' | 'approve' | 'deny' | 'ignored'

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
  nodeVotes: Record<string, VoteStatus>
  decisionDeadline?: number
  proposeDeadline?: number
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

const statusLabel: Record<InvariantStatus, string> = {
  ok: 'Holds',
  warn: 'Pending',
  fail: 'Violated',
}

const nodeCycle = ['Leader', 'Replica 1', 'Replica 2', 'Replica 3', 'Replica 4'] as const
const leaderForRound = (round: number) => nodeCycle[round % nodeCycle.length]
const VOTE_THRESHOLD = 3
const DECISION_WINDOW_MS = 30000
const PROPOSE_WINDOW_MS = 30000

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
  nodeVotes: {},
  decisionDeadline: undefined,
  proposeDeadline: Date.now() + PROPOSE_WINDOW_MS,
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

function App() {
  const [state, setState] = useState<NodeState>(initialState)
  const [toasts, setToasts] = useState<Toast[]>([])

  const addToast = (message: string, tone: Toast['tone'] = 'info') => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, message, tone }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3600)
  }

  const markTimeout = (reason?: string) => {
    addToast(reason ?? 'Timeout collected', 'warn')
    setState((prev) => {
      const tcRound = prev.currentRound
      const tc: Certificate = {
        round: tcRound,
        type: 'TC',
        formedBy: 'timeouts',
        label: `TC(R${tcRound})`,
      }

      const nextRound = Math.min(prev.currentRound + 1, 5)
      const roundRegressed = prev.roundRegressed || nextRound < prev.currentRound
      const highQCRegressed =
        prev.highQCRegressed || tc.round < prev.highQC.round

      const nodeVotes = Object.keys(prev.nodeVotes).length
        ? Object.fromEntries(
            Object.entries(prev.nodeVotes).map(([k, v]) => [
              k,
              v === 'pending' ? 'ignored' : v,
            ]),
          )
        : prev.nodeVotes

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
        nodeVotes,
        decisionDeadline: undefined,
        proposeDeadline:
          nextRound <= 5 ? Date.now() + PROPOSE_WINDOW_MS : undefined,
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
          detail:
            reason ??
            'TC pushes replicas forward when QC is slow or leader idle.',
          tag: 'round',
        }),
      }
    })
  }

  const handleVote = (label: string, choice: VoteStatus) => {
    setState((prev) => {
      if (!prev.proposal) {
        return trimOnly(prev, {
          title: 'No proposal to vote on',
          detail: 'Propose a block before casting votes.',
          tag: 'info',
        })
      }

      if (prev.nodeVotes[label] && prev.nodeVotes[label] !== 'pending') {
        return trimOnly(prev, {
          title: 'Vote already recorded',
          detail: `${label} already ${prev.nodeVotes[label]}.`,
          tag: 'info',
        })
      }

      const votes = {
        ...prev.nodeVotes,
        [label]: choice,
      }
      const approvals = Object.values(votes).filter((v) => v === 'approve').length

      if (approvals >= VOTE_THRESHOLD) {
        // Enough approvals—form QC immediately
        return produceQCFromVotes(prev, votes)
      }

      return {
        ...prev,
        nodeVotes: votes,
        log: trimLog(prev.log, {
          title: `${label} chose ${choice}`,
          detail: `Approvals ${approvals}/${VOTE_THRESHOLD}.`,
          tag: 'round',
        }),
      }
    })
  }

  useEffect(() => {
    if (!state.proposal || !state.decisionDeadline) return

    const approvals = Object.values(state.nodeVotes).filter(
      (v) => v === 'approve',
    ).length
    if (approvals >= VOTE_THRESHOLD) return

    const remaining = state.decisionDeadline - Date.now()
    if (remaining <= 0) {
      markTimeout()
      return
    }

    const timer = setTimeout(() => {
      markTimeout()
    }, remaining)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.proposal?.blockId, state.decisionDeadline, state.nodeVotes])

  useEffect(() => {
    if (state.proposal) return
    if (!state.proposeDeadline) return

    const remaining = state.proposeDeadline - Date.now()
    if (remaining <= 0) {
      markTimeout('Leader idle: no proposal within window.')
      return
    }
    const timer = setTimeout(
      () => markTimeout('Leader idle: no proposal within window.'),
      remaining,
    )
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.proposeDeadline, state.proposal?.blockId])

  const proposeBlock = () => {
    const targetRound = Math.min(state.currentRound, 5)
    const blockId = `B${targetRound}`
    setState((prev) => {
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
        nodeVotes: Object.fromEntries(
          nodeCycle.map((label) => [label, 'pending' as VoteStatus]),
        ),
        decisionDeadline: Date.now() + DECISION_WINDOW_MS,
        proposeDeadline: undefined,
        log: trimLog(prev.log, {
          title: `Leader proposes ${blockId}`,
          detail: `Proposal extends ${proposal.justifyQC.label} into Round ${targetRound}.`,
          tag: 'round',
        }),
      }
    })
    addToast(`Leader proposed ${blockId}`, 'info')
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

      const approvals =
        Object.values(prev.nodeVotes).filter((v) => v === 'approve').length
      if (approvals < VOTE_THRESHOLD) {
        return trimOnly(prev, {
          title: 'Not enough approvals',
          detail: `Need ${VOTE_THRESHOLD} approvals; currently ${approvals}.`,
          tag: 'info',
        })
      }

      return produceQCFromVotes(prev, prev.nodeVotes)
    })
  }

  const triggerTimeout = () => {
    markTimeout()
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
          nodeVotes: state.nodeVotes,
          decisionDeadline: state.decisionDeadline,
          proposeDeadline: state.proposeDeadline,
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
      state.nodeVotes,
      state.decisionDeadline,
      state.proposeDeadline,
    ],
  )

  const selectedRecord =
    state.roundRecords[state.selectedRound] ??
    ({
      round: state.selectedRound,
      notes: ['Round not yet visited.'],
    } as RoundRecord)
  const selectedLeader = leaderForRound(selectedRecord.round)

  const modalRecord =
    state.modalRound !== null
      ? state.roundRecords[state.modalRound] ??
        ({
          round: state.modalRound,
          notes: ['Round not yet visited.'],
        } as RoundRecord)
      : null
  const modalLeader = modalRecord ? leaderForRound(modalRecord.round) : null
  const approvalsCount = Object.values(state.nodeVotes).filter(
    (v) => v === 'approve',
  ).length
  const proposeRemaining = state.proposeDeadline
    ? Math.max(0, Math.ceil((state.proposeDeadline - Date.now()) / 1000))
    : null
  const decisionRemaining = state.decisionDeadline
    ? Math.max(0, Math.ceil((state.decisionDeadline - Date.now()) / 1000))
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
          <div className="timer-strip">
            <div>
              <p className="stat-label">Proposal window</p>
              <p className="stat-value">
                {state.proposal
                  ? 'Proposed'
                  : proposeRemaining !== null
                    ? `${proposeRemaining}s`
                    : '—'}
              </p>
              <p className="mini-note">If leader stays idle, TC will form.</p>
            </div>
            <div>
              <p className="stat-label">Vote window</p>
              <p className="stat-value">
                {state.proposal && decisionRemaining !== null
                  ? `${decisionRemaining}s`
                  : '—'}
              </p>
              <p className="mini-note">After expiry, pending votes become ignored.</p>
            </div>
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
                <p className="rail-leader">Leader: {leaderForRound(r)}</p>
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

      <section className="node-row">
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
            {state.proposal && state.proposal.round === selectedRecord.round && (
              <div className="vote-strip">
                <span>
                  Approvals {approvalsCount}/{VOTE_THRESHOLD}
                </span>
                {state.decisionDeadline && (
                  <span>
                    Decision window:{' '}
                    {Math.max(
                      0,
                      Math.ceil((state.decisionDeadline - Date.now()) / 1000),
                    )}{' '}
                    s
                  </span>
                )}
              </div>
            )}
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
              <div>
                <p className="stat-label">Leader</p>
                <p className="stat-value">{selectedLeader}</p>
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

        <div className="card node-cluster">
          <div className="card-heading">
            <p className="label">Nodes</p>
            <p className="sub">Leader + 4 replicas linked to the selected round.</p>
          </div>
          <div className="node-grid">
            {nodeCycle.map((label) => {
              const isLeader = label === selectedLeader
              const vote = state.nodeVotes[label] ?? 'pending'
              const canVote =
                Boolean(state.proposal) && vote === 'pending' && selectedRecord.round === state.proposal?.round
              return (
                <div key={label} className={`node-card ${isLeader ? 'leader' : ''}`}>
                  <div className="node-head">
                    <p className="label">{label}</p>
                    {isLeader && <span className="pill ok tiny">Leader</span>}
                  </div>
                  <h4>Round {selectedRecord.round}</h4>
                  <p className="node-line">
                    Proposal: {selectedRecord.proposal?.blockId ?? '—'}
                  </p>
                  <p className="node-line">
                    QC: {selectedRecord.qc?.label ?? '—'}
                  </p>
                  <p className="node-line">
                    TC: {selectedRecord.tc?.label ?? '—'}
                  </p>
                  <p className={`vote-pill ${vote}`}>Vote: {vote}</p>
                  <div className="node-actions">
                    <button
                      disabled={!canVote}
                      onClick={() => handleVote(label, 'approve')}
                    >
                      Approve
                    </button>
                    <button
                      disabled={!canVote}
                      onClick={() => handleVote(label, 'deny')}
                    >
                      Deny
                    </button>
                    <button
                      className="ghost"
                      disabled={!canVote}
                      onClick={() => handleVote(label, 'ignored')}
                    >
                      Ignore
                    </button>
                  </div>
                  <button
                    className="ghost full"
                    onClick={() => setSelectedRound(selectedRecord.round, true)}
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

      {toasts.length > 0 && (
        <div className="toaster">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.tone}`}>
              <span className="toast-dot" />
              <p className="toast-text">{t.message}</p>
            </div>
          ))}
        </div>
      )}

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
              <div>
                <p className="stat-label">Leader</p>
                <p className="stat-value">{modalLeader}</p>
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

function produceQCFromVotes(
  prev: NodeState,
  votes: Record<string, VoteStatus>,
): NodeState {
  if (!prev.proposal) return prev

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
    (existing && existing !== prev.proposal.blockId) || prev.hasConflictingQC

  const qc: Certificate = {
    round: roundKey,
    type: 'QC',
    formedBy: 'votes',
    block: prev.proposal.blockId,
    label: `QC(${prev.proposal.blockId})`,
  }

  const nextRound = Math.min(Math.max(prev.currentRound, roundKey + 1), 5)
  const roundRegressed = prev.roundRegressed || nextRound < prev.currentRound
  const highQCRegressed = prev.highQCRegressed || qc.round < prev.highQC.round

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
    nodeVotes: votes,
    decisionDeadline: undefined,
    proposeDeadline:
      nextRound <= 5 ? Date.now() + PROPOSE_WINDOW_MS : undefined,
    roundRecords: updatedRecords,
    selectedRound: Math.min(nextRound, 5),
    log: nextLog,
  }
}

function trimOnly(prev: NodeState, entry: LogEntry): NodeState {
  return {
    ...prev,
    log: trimLog(prev.log, entry),
  }
}

export default App
