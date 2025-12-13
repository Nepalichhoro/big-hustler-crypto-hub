export type CertificateKind = 'QC' | 'TC'

export type Certificate = {
  round: number
  type: CertificateKind
  formedBy: 'votes' | 'timeouts'
  block?: string
  label: string
}

export type Proposal = {
  blockId: string
  round: number
  parent: string
  justifyQC: Certificate
}

export type LogEntry = {
  title: string
  detail: string
  tag?: 'safety' | 'info' | 'ignored' | 'round'
}

export type RoundRecord = {
  round: number
  proposal?: Proposal
  qc?: Certificate
  tc?: Certificate
  justifyQC?: Certificate
  parent?: string
  notes: string[]
}

export type VoteStatus = 'pending' | 'approve' | 'deny' | 'ignored'

export type Toast = {
  id: number
  message: string
  tone: 'success' | 'warn' | 'error' | 'info'
}
