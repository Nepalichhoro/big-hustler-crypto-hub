import { createSlice, nanoid } from '@reduxjs/toolkit'
import type { PayloadAction } from '@reduxjs/toolkit'
import type { LogEntry, Toast } from '../types'

export type CryptoTx = {
  id: string
  from: string
  to: string
  amount: number
  blockId: string
  timestamp: number
}

type Block = {
  id: string
  tx: CryptoTx
}

type CryptoHotstuffState = {
  totalSupply: number
  balances: Record<string, number>
  mempool: CryptoTx[]
  builtBlocks: Record<string, Block>
  pendingBlock?: Block
  finalizedBlocks: Block[]
  log: LogEntry[]
  toasts: Toast[]
  error?: string
}

const initialBalances: Record<string, number> = {
  Leader: 1000,
  'Replica 1': 0,
  'Replica 2': 0,
  'Replica 3': 0,
  'Replica 4': 0,
}

const trimLog = (log: LogEntry[], entry: LogEntry) => [entry, ...log].slice(0, 18)

const initialState: CryptoHotstuffState = {
  totalSupply: 1000,
  balances: initialBalances,
  mempool: [],
  builtBlocks: {},
  pendingBlock: undefined,
  finalizedBlocks: [],
  log: [
    {
      title: 'Biggie chain booted',
      detail: 'Leader holds 1000 BIGGIE; replicas start at 0.',
      tag: 'info',
    },
  ],
  toasts: [],
  error: undefined,
}

type SendPayload = {
  from: string
  to: string
  amount: number
}

const cryptoHotstuffSlice = createSlice({
  name: 'cryptoHotstuff',
  initialState,
  reducers: {
    submitTx(state, action: PayloadAction<SendPayload>) {
      const { from, to, amount } = action.payload
      state.error = undefined
      if (!from || !to || from === to) {
        state.error = 'From and To must be distinct and defined.'
        return
      }
      if (amount <= 0 || Number.isNaN(amount)) {
        state.error = 'Amount must be positive.'
        return
      }
      const reservedOut =
        state.mempool
          .filter((tx) => tx.from === from)
          .reduce((acc, tx) => acc + tx.amount, 0) +
        (state.pendingBlock?.tx.from === from ? state.pendingBlock.tx.amount : 0)
      const available = (state.balances[from] ?? 0) - reservedOut
      if (amount > available) {
        state.error = 'Insufficient balance (considering queued tx).'
        return
      }
      const tx: CryptoTx = {
        id: nanoid(),
        from,
        to,
        amount,
        blockId: '',
        timestamp: Date.now(),
      }
      state.mempool = [...state.mempool, tx]
      state.log = trimLog(state.log, {
        title: 'Tx queued',
        detail: `${from} → ${to} (${amount} BIGGIE) enqueued in mempool.`,
        tag: 'info',
      })
    },
    buildBlock(state) {
      state.error = undefined
      if (!state.mempool.length) {
        state.error = 'No transactions in mempool to build a block.'
        return
      }
      const tx = state.mempool[0]
      const blockId = `B${Object.keys(state.builtBlocks).length + 1}`
      const block: Block = { id: blockId, tx: { ...tx, blockId } }
      state.pendingBlock = block
      state.builtBlocks[blockId] = block
      state.mempool = state.mempool.slice(1)
      state.log = trimLog(state.log, {
        title: `Built ${blockId}`,
        detail: `Prepared ${blockId} with tx ${tx.from} → ${tx.to} (${tx.amount}).`,
        tag: 'round',
      })
    },
    finalizeBlock(state, action: PayloadAction<string>) {
      const blockId = action.payload
      const block = state.builtBlocks[blockId] ?? state.pendingBlock
      if (!block) return
      if (!state.finalizedBlocks.find((b) => b.id === blockId)) {
        const { from, to, amount } = block.tx
        state.balances = {
          ...state.balances,
          [from]: (state.balances[from] ?? 0) - amount,
          [to]: (state.balances[to] ?? 0) + amount,
        }
        state.finalizedBlocks = [...state.finalizedBlocks, block]
        state.log = trimLog(state.log, {
          title: `Finalized ${blockId}`,
          detail: `${amount} BIGGIE transferred ${from} → ${to} after HotStuff commit.`,
          tag: 'round',
        })
        state.toasts.push({
          id: Date.now() + Math.random(),
          message: `Committed ${blockId} (tx ${from} → ${to})`,
          tone: 'success',
        })
      }
      if (state.pendingBlock?.id === blockId) state.pendingBlock = undefined
    },
    clearError(state) {
      state.error = undefined
    },
    addToast(state, action: PayloadAction<Toast>) {
      state.toasts.push(action.payload)
    },
    removeToast(state, action: PayloadAction<number>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload)
    },
    resetCryptoState() {
      return initialState
    },
  },
})

export const {
  submitTx,
  buildBlock,
  finalizeBlock,
  clearError,
  addToast,
  removeToast,
  resetCryptoState,
} = cryptoHotstuffSlice.actions

export default cryptoHotstuffSlice.reducer
