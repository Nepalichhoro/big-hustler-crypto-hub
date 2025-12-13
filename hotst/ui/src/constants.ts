import type { Certificate, RoundRecord } from './types'

export const nodeCycle = ['Leader', 'Replica 1', 'Replica 2', 'Replica 3', 'Replica 4'] as const
export const leaderForRound = (round: number) => nodeCycle[round % nodeCycle.length]
export const VOTE_THRESHOLD = 3
export const DECISION_WINDOW_MS = 30000
export const PROPOSE_WINDOW_MS = 30000

export const genesisQC: Certificate = {
  round: 0,
  type: 'QC',
  formedBy: 'votes',
  block: 'Genesis',
  label: 'QC(Genesis)',
}

export const initialRoundRecords: Record<number, RoundRecord> = {
  0: {
    round: 0,
    qc: genesisQC,
    justifyQC: genesisQC,
    parent: '⊥',
    notes: ['Genesis QC anchors the chain.'],
  },
}
