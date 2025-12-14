import { createSlice } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import {
  DECISION_WINDOW_MS,
  PROPOSE_WINDOW_MS,
  VOTE_THRESHOLD,
  nodeCycle,
} from '../constants'
import type {
  LogEntry,
  TendermintPhase,
  TendermintProposal,
  TendermintRoundRecord,
  TendermintVote,
  Toast,
} from '../types'

type TendermintState = {
  height: number
  round: number
  phase: TendermintPhase
  proposal?: TendermintProposal
  prevotes: Record<string, TendermintVote>
  precommits: Record<string, TendermintVote>
  proposeDeadline?: number
  phaseDeadline?: number
  committedBlocks: string[]
  lastCommitted?: string
  roundRecords: Record<string, TendermintRoundRecord>
  selectedKey: string
  modalKey: string | null
  log: LogEntry[]
  toasts: Toast[]
}

const MAX_HEIGHT = 5

const recordKey = (height: number, round: number) => `${height}-${round}`
const proposerForRound = (round: number) => nodeCycle[round % nodeCycle.length]
const trimLog = (log: LogEntry[], entry: LogEntry) => [entry, ...log].slice(0, 18)

const createInitialState = (): TendermintState => ({
  height: 1,
  round: 0,
  phase: 'proposal',
  proposal: undefined,
  prevotes: {},
  precommits: {},
  proposeDeadline: Date.now() + PROPOSE_WINDOW_MS,
  phaseDeadline: undefined,
  committedBlocks: ['Genesis'],
  lastCommitted: 'Genesis',
  roundRecords: {},
  selectedKey: recordKey(1, 0),
  modalKey: null,
  log: [
    {
      title: 'Tendermint bootstrapped',
      detail: 'Genesis is committed; height starts at 1 with rotating proposers.',
      tag: 'info',
    },
  ],
  toasts: [],
})

const initialState: TendermintState = createInitialState()

const ensureRecord = (state: TendermintState, height: number, round: number) => {
  const key = recordKey(height, round)
  if (!state.roundRecords[key]) {
    state.roundRecords[key] = {
      height,
      round,
      proposer: proposerForRound(round),
      notes: [],
    }
  }
  return key
}

const moveToNextRound = (state: TendermintState, reason: string, status: 'timeout' | 'failed') => {
  const key = ensureRecord(state, state.height, state.round)
  const existing = state.roundRecords[key]
  state.roundRecords[key] = {
    ...existing,
    status,
    notes: [...(existing.notes ?? []), reason],
  }
  state.proposal = undefined
  state.prevotes = {}
  state.precommits = {}
  state.phase = 'proposal'
  state.phaseDeadline = undefined
  state.round += 1
  state.proposeDeadline = state.height <= MAX_HEIGHT ? Date.now() + PROPOSE_WINDOW_MS : undefined
  state.log = trimLog(state.log, {
    title: 'Round change',
    detail: `${reason} → Enter Round ${state.round}`,
    tag: 'round',
  })
}

const tendermintSlice = createSlice({
  name: 'tendermint',
  initialState,
  reducers: {
    tmPropose(state) {
      if (state.phase !== 'proposal') {
        state.log = trimLog(state.log, {
          title: 'Already in voting',
          detail: 'Complete prevote/precommit before a new proposal.',
          tag: 'info',
        })
        return
      }
      if (state.height > MAX_HEIGHT) {
        state.log = trimLog(state.log, {
          title: 'Demo limit reached',
          detail: 'Max height reached for this demo run.',
          tag: 'info',
        })
        return
      }
      const proposer = proposerForRound(state.round)
      const blockId = `H${state.height}R${state.round}`
      const proposal: TendermintProposal = {
        blockId,
        height: state.height,
        round: state.round,
        proposer,
        payload: `Txs at height ${state.height}`,
      }
      const key = ensureRecord(state, state.height, state.round)
      state.roundRecords[key] = {
        ...state.roundRecords[key],
        proposal,
        status: 'in-progress',
        notes: [
          ...(state.roundRecords[key].notes ?? []),
          `${proposer} proposed ${blockId}.`,
        ],
      }
      state.proposal = proposal
      state.phase = 'prevote'
      state.prevotes = Object.fromEntries(nodeCycle.map((n) => [n, 'pending' as TendermintVote]))
      state.precommits = {}
      state.phaseDeadline = Date.now() + DECISION_WINDOW_MS
      state.proposeDeadline = undefined
      state.selectedKey = key
      state.log = trimLog(state.log, {
        title: `Proposal ${blockId}`,
        detail: `${proposer} proposed; prevote running.`,
        tag: 'round',
      })
    },
    tmRecordPrevote(state, action: PayloadAction<{ validator: string; vote: TendermintVote }>) {
      if (state.phase !== 'prevote' || !state.proposal) {
        state.log = trimLog(state.log, {
          title: 'No prevote open',
          detail: 'Propose first to open prevote.',
          tag: 'info',
        })
        return
      }
      const { validator, vote } = action.payload
      if (state.prevotes[validator] && state.prevotes[validator] !== 'pending') return
      state.prevotes = { ...state.prevotes, [validator]: vote }
      const approvals = Object.values(state.prevotes).filter((v) => v === 'approve').length
      const denies = Object.values(state.prevotes).filter((v) => v === 'deny').length
      const key = ensureRecord(state, state.height, state.round)
      if (approvals >= VOTE_THRESHOLD) {
        state.roundRecords[key] = {
          ...state.roundRecords[key],
          prevote: 'quorum',
          notes: [
            ...(state.roundRecords[key].notes ?? []),
            `Prevote quorum for ${state.proposal.blockId}.`,
          ],
        }
        state.phase = 'precommit'
        state.phaseDeadline = Date.now() + DECISION_WINDOW_MS
        state.precommits = Object.fromEntries(nodeCycle.map((n) => [n, 'pending' as TendermintVote]))
        state.log = trimLog(state.log, {
          title: 'Prevote quorum',
          detail: `2f+1 prevotes for ${state.proposal.blockId} → precommit stage.`,
          tag: 'round',
        })
        state.toasts.push({
          id: Date.now() + Math.random(),
          message: `Prevote QC for ${state.proposal.blockId}`,
          tone: 'success',
        })
      } else if (denies >= VOTE_THRESHOLD) {
        state.roundRecords[key] = {
          ...state.roundRecords[key],
          prevote: 'rejected',
          status: 'failed',
          notes: [
            ...(state.roundRecords[key].notes ?? []),
            'Prevote nil/reject reached quorum.',
          ],
        }
        state.toasts.push({
          id: Date.now() + Math.random(),
          message: `Prevote rejected ${state.proposal.blockId}`,
          tone: 'error',
        })
        moveToNextRound(state, 'Prevote rejection → new round', 'failed')
      } else {
        state.log = trimLog(state.log, {
          title: `${validator} prevoted ${vote}`,
          detail: `Prevotes ${approvals}/${VOTE_THRESHOLD}.`,
          tag: 'round',
        })
      }
    },
    tmRecordPrecommit(state, action: PayloadAction<{ validator: string; vote: TendermintVote }>) {
      if (state.phase !== 'precommit' || !state.proposal) {
        state.log = trimLog(state.log, {
          title: 'No precommit open',
          detail: 'Prevote must complete first.',
          tag: 'info',
        })
        return
      }
      const { validator, vote } = action.payload
      if (state.precommits[validator] && state.precommits[validator] !== 'pending') return
      state.precommits = { ...state.precommits, [validator]: vote }
      const approvals = Object.values(state.precommits).filter((v) => v === 'approve').length
      const denies = Object.values(state.precommits).filter((v) => v === 'deny').length
      const key = ensureRecord(state, state.height, state.round)
      if (approvals >= VOTE_THRESHOLD) {
        state.roundRecords[key] = {
          ...state.roundRecords[key],
          precommit: 'quorum',
          status: 'committed',
          notes: [
            ...(state.roundRecords[key].notes ?? []),
            `Precommit quorum → committed ${state.proposal.blockId}.`,
          ],
        }
        const blockId = state.proposal.blockId
        state.committedBlocks = [...state.committedBlocks, blockId]
        state.lastCommitted = blockId
        state.log = trimLog(state.log, {
          title: `Commit ${blockId}`,
          detail: `2f+1 precommits → height ${state.height + 1}.`,
          tag: 'round',
        })
        state.toasts.push({
          id: Date.now() + Math.random(),
          message: `Committed ${blockId}`,
          tone: 'success',
        })
        state.height = Math.min(MAX_HEIGHT, state.height + 1)
        state.round = 0
        state.phase = 'proposal'
        state.proposal = undefined
        state.prevotes = {}
        state.precommits = {}
        state.phaseDeadline = undefined
        state.proposeDeadline =
          state.height <= MAX_HEIGHT ? Date.now() + PROPOSE_WINDOW_MS : undefined
      } else if (denies >= VOTE_THRESHOLD) {
        state.roundRecords[key] = {
          ...state.roundRecords[key],
          precommit: 'rejected',
          status: 'failed',
          notes: [
            ...(state.roundRecords[key].notes ?? []),
            'Precommit rejection → new round.',
          ],
        }
        state.toasts.push({
          id: Date.now() + Math.random(),
          message: `Precommit rejected ${state.proposal.blockId}`,
          tone: 'error',
        })
        moveToNextRound(state, 'Precommit rejection → new round', 'failed')
      } else {
        state.log = trimLog(state.log, {
          title: `${validator} precommitted ${vote}`,
          detail: `Precommits ${approvals}/${VOTE_THRESHOLD}.`,
          tag: 'round',
        })
      }
    },
    tmPhaseTimeout(state, action: PayloadAction<TendermintPhase>) {
      if (state.height > MAX_HEIGHT) return
      const phase = action.payload
      const key = ensureRecord(state, state.height, state.round)
      if (phase === 'proposal' && state.phase === 'proposal') {
        state.roundRecords[key] = {
          ...state.roundRecords[key],
          status: 'timeout',
          notes: [
            ...(state.roundRecords[key].notes ?? []),
            'Proposer silent → timeout.',
          ],
        }
        moveToNextRound(state, 'Proposer timeout', 'timeout')
        return
      }
      if (phase === 'prevote' && state.phase === 'prevote') {
        state.roundRecords[key] = {
          ...state.roundRecords[key],
          prevote: 'timeout',
          status: 'timeout',
          notes: [
            ...(state.roundRecords[key].notes ?? []),
            'Prevote timed out.',
          ],
        }
        moveToNextRound(state, 'Prevote timeout', 'timeout')
        return
      }
      if (phase === 'precommit' && state.phase === 'precommit') {
        state.roundRecords[key] = {
          ...state.roundRecords[key],
          precommit: 'timeout',
          status: 'timeout',
          notes: [
            ...(state.roundRecords[key].notes ?? []),
            'Precommit timed out.',
          ],
        }
        moveToNextRound(state, 'Precommit timeout', 'timeout')
      }
    },
    tmReset() {
      return createInitialState()
    },
    tmSetSelected(state, action: PayloadAction<string>) {
      state.selectedKey = action.payload
    },
    tmAddToast(state, action: PayloadAction<Toast>) {
      state.toasts.push(action.payload)
    },
    tmRemoveToast(state, action: PayloadAction<number>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload)
    },
  },
})

export const {
  tmPropose,
  tmRecordPrevote,
  tmRecordPrecommit,
  tmPhaseTimeout,
  tmReset,
  tmSetSelected,
  tmAddToast,
  tmRemoveToast,
} = tendermintSlice.actions

export default tendermintSlice.reducer
