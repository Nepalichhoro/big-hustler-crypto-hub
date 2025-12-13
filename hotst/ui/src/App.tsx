import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { Hero } from './components/Hero'
import { ReplicaStateCard } from './components/ReplicaStateCard'
import { RoundControlsCard } from './components/RoundControlsCard'
import { DataStructuresCard } from './components/DataStructuresCard'
import { ProposalCard } from './components/ProposalCard'
import { InvariantGrid } from './components/InvariantGrid'
import { RoundFocusCard } from './components/RoundFocusCard'
import { NodeCluster } from './components/NodeCluster'
import { RoundModal } from './components/RoundModal'
import { Toaster } from './components/Toaster'
import {
  DECISION_WINDOW_MS,
  PROPOSE_WINDOW_MS,
  VOTE_THRESHOLD,
  genesisQC,
  initialRoundRecords,
  leaderForRound,
  nodeCycle,
} from './constants'
import type {
  Certificate,
  LogEntry,
  Proposal,
  RoundRecord,
  Toast,
  VoteStatus,
} from './types'

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
  const [now, setNow] = useState(Date.now())

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

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

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
    const labelForStatus: Record<InvariantStatus, string> = {
      ok: 'Holds',
      warn: 'Pending',
      fail: 'Violated',
    }

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

    return statuses.map((s) => ({ ...s, label: labelForStatus[s.status] }))
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
    ? Math.max(0, Math.ceil((state.proposeDeadline - now) / 1000))
    : null
  const decisionRemaining = state.decisionDeadline
    ? Math.max(0, Math.ceil((state.decisionDeadline - now) / 1000))
    : null

  return (
    <div className="page">
      <Hero
        currentRound={state.currentRound}
        highQCLabel={state.highQC.label}
        lockedRound={state.lockedRound}
        proposeRemaining={state.proposal ? null : proposeRemaining}
        decisionRemaining={state.proposal ? decisionRemaining : null}
        onSelectRound={setSelectedRound}
      />

      <section className="state-grid">
        <ReplicaStateCard
          currentRound={state.currentRound}
          highQCLabel={state.highQC.label}
          lockedRound={state.lockedRound}
          lockedBlock={state.lockedBlock}
          onReset={reset}
        />

        <RoundControlsCard
          currentRound={state.currentRound}
          proposalId={state.proposal?.blockId}
          onPropose={proposeBlock}
          onCollectQC={formQCFromVotes}
          onTimeout={triggerTimeout}
          onIgnore={ignoreStaleMessage}
        />

        <DataStructuresCard dataSnapshot={dataSnapshot} />

        <ProposalCard proposal={state.proposal} />
      </section>

      <InvariantGrid invariants={invariants} />

      <section className="node-row">
        <RoundFocusCard
          record={selectedRecord}
          leader={selectedLeader}
          approvals={approvalsCount}
          decisionRemaining={
            state.proposal && state.proposal.round === selectedRecord.round
              ? decisionRemaining
              : null
          }
        />

        <NodeCluster
          record={selectedRecord}
          selectedLeader={selectedLeader}
          nodeVotes={state.nodeVotes}
          activeProposalRound={state.proposal?.round}
          onVote={handleVote}
          onOpenModal={(round) => setSelectedRound(round, true)}
        />
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

      <Toaster toasts={toasts} />

      {modalRecord && (
        <RoundModal
          record={modalRecord}
          leader={modalLeader ?? ''}
          onClose={() => setState((p) => ({ ...p, modalRound: null }))}
        />
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
