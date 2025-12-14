import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import {
  DECISION_WINDOW_MS,
  PROPOSE_WINDOW_MS,
  VOTE_THRESHOLD,
  genesisQC,
  initialRoundRecords,
  nodeCycle,
} from '../constants'
import type {
  Certificate,
  LogEntry,
  Proposal,
  RoundRecord,
  Toast,
  VoteStatus,
} from '../types'

export type InvariantStatus = 'ok' | 'warn' | 'fail'

export type NodeState = {
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
  timeoutSenders: string[]
  decisionDeadline?: number
  proposeDeadline?: number
  modalRound: number | null
  log: LogEntry[]
  lastVoteSafety: 'unknown' | 'safe' | 'blocked'
  toasts: Toast[]
  blockGraph: Record<string, { parent?: string; qcRound: number }>
}

const createInitialState = (): NodeState => ({
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
  timeoutSenders: [],
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
  toasts: [],
  blockGraph: {
    Genesis: { parent: undefined, qcRound: 0 },
  },
})

const initialState: NodeState = createInitialState()

const trimLog = (log: LogEntry[], entry: LogEntry) =>
  [entry, ...log].slice(0, 18)

function produceQCFromVotes(draft: NodeState, votes: Record<string, VoteStatus>) {
  if (!draft.proposal) return

  const safeToVote =
    draft.proposal.justifyQC.round > draft.lockedRound &&
    draft.lockedRound <= draft.highQC.round

  if (!safeToVote) {
    draft.log = trimLog(draft.log, {
      title: 'Vote blocked',
      detail: 'Safety-to-vote rule refused this proposal.',
      tag: 'safety',
    })
    draft.lastVoteSafety = 'blocked'
    return
  }

  const roundKey = draft.proposal.round
  const existing = draft.certifiedByRound[roundKey]
  const conflictDetected =
    (existing && existing !== draft.proposal.blockId) || draft.hasConflictingQC

  const qc: Certificate = {
    round: roundKey,
    type: 'QC',
    formedBy: 'votes',
    block: draft.proposal.blockId,
    label: `QC(${draft.proposal.blockId})`,
  }

  const nextRound = Math.min(Math.max(draft.currentRound, roundKey + 1), 5)
  draft.roundRegressed = draft.roundRegressed || nextRound < draft.currentRound
  draft.highQCRegressed = draft.highQCRegressed || qc.round < draft.highQC.round

  draft.log = trimLog(
    conflictDetected
      ? trimLog(draft.log, {
          title: 'Conflicting QC avoided',
          detail: 'Duplicate certification attempt was ignored.',
          tag: 'safety',
        })
      : draft.log,
    {
      title: `QC formed for ${draft.proposal.blockId}`,
      detail: `2f+1 votes certify Round ${roundKey} and advance to Round ${nextRound}.`,
      tag: 'round',
    },
  )

  draft.highQC = qc
  draft.currentRound = nextRound
  draft.roundAdvanced = true
  draft.certifiedByRound = { ...draft.certifiedByRound, [roundKey]: qc.block! }
  draft.hasConflictingQC = conflictDetected
  draft.lastVoteSafety = 'safe'
  draft.proposal = { ...draft.proposal, justifyQC: qc }
  draft.nodeVotes = votes
  draft.decisionDeadline = undefined
  if (!draft.roundRecords[roundKey]) {
    draft.roundRecords[roundKey] = { round: roundKey, notes: [] }
  }
  draft.roundRecords[roundKey] = {
    ...draft.roundRecords[roundKey],
    proposal: draft.proposal,
    qc,
    justifyQC: draft.proposal.justifyQC,
    parent: draft.proposal.parent,
    notes: [
      ...(draft.roundRecords[roundKey]?.notes ?? []),
      `QC formed via votes for ${draft.proposal.blockId}.`,
    ],
  }

  // Track QC and check 3-chain commit (grandparent commit rule)
  draft.blockGraph[qc.block!] = {
    parent: draft.proposal.parent,
    qcRound: qc.round,
  }
  const parentId = draft.proposal.parent
  const grandId = parentId ? draft.blockGraph[parentId]?.parent : undefined
  const parentHasQC = parentId && draft.blockGraph[parentId]?.qcRound !== undefined
  const grandHasQC = grandId && draft.blockGraph[grandId]?.qcRound !== undefined
  if (parentHasQC && grandHasQC && grandId && !draft.committedBlocks.includes(grandId)) {
    draft.committedBlocks = [...draft.committedBlocks, grandId]
    draft.log = trimLog(draft.log, {
      title: `Commit ${grandId}`,
      detail: `3-chain QC path committed ${grandId}.`,
      tag: 'round',
    })
    draft.toasts.push({
      id: Date.now() + Math.random(),
      message: `Committed ${grandId} via 3-chain`,
      tone: 'success',
    })
  }
  if (!draft.roundRecords[nextRound]) {
    draft.roundRecords[nextRound] = {
      round: nextRound,
      justifyQC: qc,
      parent: draft.proposal.blockId,
      notes: [`Entered Round ${nextRound} via ${qc.label}.`],
    }
  }
  draft.selectedRound = Math.min(nextRound, 5)
}

function applyTimeout(state: NodeState, reason: string) {
  const tcRound = state.currentRound
  const tc: Certificate = {
    round: tcRound,
    type: 'TC',
    formedBy: 'timeouts',
    label: `TC(R${tcRound})`,
  }
  const nextRound = Math.min(state.currentRound + 1, 5)
  state.roundRegressed = state.roundRegressed || nextRound < state.currentRound
  state.highQCRegressed = state.highQCRegressed || tc.round < state.highQC.round
  state.highQC = tc.round >= state.highQC.round ? tc : state.highQC
  state.timeoutIssued = true
  state.currentRound = nextRound
  state.roundAdvanced = true
  state.roundRegressed = state.roundRegressed
  state.proposal = undefined
  state.lastVoteSafety = 'unknown'
  state.nodeVotes = {}
  state.decisionDeadline = undefined
  state.proposeDeadline = nextRound <= 5 ? Date.now() + PROPOSE_WINDOW_MS : undefined
  state.timeoutSenders = []
  state.roundRecords = (() => {
    const records = { ...state.roundRecords }
    records[tcRound] = {
      ...(records[tcRound] ?? { round: tcRound, notes: [] }),
      tc,
      notes: [
        ...(records[tcRound]?.notes ?? []),
        `TC collected in Round ${tcRound}.`,
      ],
    }
    if (!records[nextRound]) {
      records[nextRound] = {
        round: nextRound,
        justifyQC: tc,
        parent: records[tcRound]?.proposal?.blockId,
        notes: [`Entered Round ${nextRound} via ${tc.label}.`],
      }
    }
    return records
  })()
  state.selectedRound = Math.min(nextRound, 5)
  state.log = trimLog(state.log, {
    title: 'Timeout collected',
    detail: reason,
    tag: 'round',
  })
}

const hotstuffSlice = createSlice({
  name: 'hotstuff',
  initialState,
  reducers: {
    proposeBlock(
      state,
      action: PayloadAction<{ blockId?: string; payload?: unknown } | undefined>,
    ) {
      const targetRound = Math.min(state.currentRound, 5)
      const blockId = action.payload?.blockId ?? `B${targetRound}`
      const proposal: Proposal = {
        blockId,
        round: targetRound,
        parent: state.highQC.block ?? 'Genesis',
        justifyQC: state.highQC,
        payload: action.payload?.payload,
      }
      state.proposal = proposal
      state.lastVoteSafety = 'unknown'
      state.roundRecords = {
        ...state.roundRecords,
        [targetRound]: {
          ...(state.roundRecords[targetRound] ?? { round: targetRound, notes: [] }),
          proposal,
          justifyQC: proposal.justifyQC,
          parent: proposal.parent,
          notes: [
            ...(state.roundRecords[targetRound]?.notes ?? []),
            `Leader proposed ${blockId} extending ${proposal.justifyQC.label}.`,
          ],
        },
      }
      state.nodeVotes = Object.fromEntries(
        nodeCycle.map((label) => [label, 'pending' as VoteStatus]),
      )
      state.timeoutSenders = []
      state.decisionDeadline = Date.now() + DECISION_WINDOW_MS
      state.proposeDeadline = undefined
      state.selectedRound = targetRound
      state.log = trimLog(state.log, {
        title: `Leader proposes ${blockId}`,
        detail: `Proposal extends ${proposal.justifyQC.label} into Round ${targetRound}.`,
        tag: 'round',
      })
    },
    collectQCFromVotes(state) {
      if (!state.proposal) {
        state.log = trimLog(state.log, {
          title: 'No proposal yet',
          detail: 'Propose B0 before collecting votes.',
          tag: 'info',
        })
        return
      }
      const approvals = Object.values(state.nodeVotes).filter(
        (v) => v === 'approve',
      ).length
      if (approvals < VOTE_THRESHOLD) {
        state.log = trimLog(state.log, {
          title: 'Not enough approvals',
          detail: `Need ${VOTE_THRESHOLD} approvals; currently ${approvals}.`,
          tag: 'info',
        })
        return
      }
      produceQCFromVotes(state, state.nodeVotes)
    },
    triggerTimeout(state, action: PayloadAction<string | undefined>) {
      const reason =
        action.payload ??
        'TC pushes replicas forward when QC is slow or leader idle.'
      applyTimeout(state, reason)
    },
    replicaTimeout(state, action: PayloadAction<string>) {
      if (state.proposal) return
      const sender = action.payload
      if (state.timeoutSenders.includes(sender)) return
      state.timeoutSenders = [...state.timeoutSenders, sender]
      state.log = trimLog(state.log, {
        title: `${sender} sent Timeout`,
        detail: `Timeout votes ${state.timeoutSenders.length}/${VOTE_THRESHOLD}.`,
        tag: 'round',
      })
      if (state.timeoutSenders.length >= VOTE_THRESHOLD) {
        applyTimeout(state, `${sender} initiated NewView with TC quorum`)
      }
    },
    ignoreStaleMessage(state) {
      state.staleMessagesIgnored += 1
      state.log = trimLog(state.log, {
        title: 'Stale message ignored',
        detail: `Message from Round ${Math.max(0, state.currentRound - 1)} dropped; currentRound=${state.currentRound}.`,
        tag: 'ignored',
      })
    },
    setSelectedRound(state, action: PayloadAction<{ round: number; openModal?: boolean }>) {
      state.selectedRound = action.payload.round
      state.modalRound = action.payload.openModal ? action.payload.round : state.modalRound
    },
    resetState() {
      return createInitialState()
    },
    recordVote(state, action: PayloadAction<{ label: string; choice: VoteStatus }>) {
      if (!state.proposal) {
        state.log = trimLog(state.log, {
          title: 'No proposal to vote on',
          detail: 'Propose a block before casting votes.',
          tag: 'info',
        })
        return
      }
      const { label, choice } = action.payload
      if (state.nodeVotes[label] && state.nodeVotes[label] !== 'pending') {
        state.log = trimLog(state.log, {
          title: 'Vote already recorded',
          detail: `${label} already ${state.nodeVotes[label]}.`,
          tag: 'info',
        })
        return
      }
      state.nodeVotes = {
        ...state.nodeVotes,
        [label]: choice,
      }
      const approvals = Object.values(state.nodeVotes).filter((v) => v === 'approve').length
      const denies = Object.values(state.nodeVotes).filter((v) => v === 'deny').length
      if (approvals >= VOTE_THRESHOLD) {
        produceQCFromVotes(state, state.nodeVotes)
      } else if (denies >= VOTE_THRESHOLD) {
        state.toasts.push({
          id: Date.now() + Math.random(),
          message: `Proposal ${state.proposal.blockId} rejected by quorum denies`,
          tone: 'error',
        })
        state.lastVoteSafety = 'blocked'
        state.log = trimLog(state.log, {
          title: 'Proposal rejected',
          detail: `2f+1 denies for ${state.proposal.blockId}; waiting for TC to advance.`,
          tag: 'safety',
        })
        state.roundRecords = {
          ...state.roundRecords,
          [state.proposal.round]: {
            ...(state.roundRecords[state.proposal.round] ?? {
              round: state.proposal.round,
              notes: [],
            }),
            proposal: state.proposal,
            notes: [
              ...(state.roundRecords[state.proposal.round]?.notes ?? []),
              `Proposal ${state.proposal.blockId} rejected by 2f+1 denies.`,
            ],
          },
        }
        state.proposal = undefined
        state.nodeVotes = {}
        state.decisionDeadline = undefined
        state.timeoutSenders = []
        state.proposeDeadline = Date.now() + PROPOSE_WINDOW_MS
      } else {
        state.log = trimLog(state.log, {
          title: `${label} chose ${choice}`,
          detail: `Approvals ${approvals}/${VOTE_THRESHOLD}.`,
          tag: 'round',
        })
      }
    },
    setModalRound(state, action: PayloadAction<number | null>) {
      state.modalRound = action.payload
    },
    addToast(state, action: PayloadAction<Toast>) {
      state.toasts.push(action.payload)
    },
  removeToast(state, action: PayloadAction<number>) {
    state.toasts = state.toasts.filter((t) => t.id !== action.payload)
  },
 },
})

export const {
  proposeBlock,
  collectQCFromVotes,
  triggerTimeout,
  replicaTimeout,
  ignoreStaleMessage,
  setSelectedRound,
  resetState,
  recordVote,
  setModalRound,
  addToast,
  removeToast,
} = hotstuffSlice.actions

export default hotstuffSlice.reducer
