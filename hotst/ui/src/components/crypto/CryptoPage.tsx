import { useEffect, useMemo, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { leaderForRound, nodeCycle } from '../../constants'
import { Toaster } from '../Toaster'
import { HomePage as HotstuffView } from '../hotstuff/HomePage'
import { RoundModal } from '../hotstuff/RoundModal'
import type { AppDispatch, RootState } from '../../store/store'
import {
  buildBlock,
  clearError,
  finalizeBlock,
  removeToast as removeCryptoToast,
  submitTx,
  resetCryptoState,
} from '../../store/cryptoHotstuffSlice'
import {
  collectQCFromVotes,
  ignoreStaleMessage,
  proposeBlock,
  recordVote,
  resetState,
  setModalRound,
  setSelectedRound,
  triggerTimeout,
} from '../../store/hotstuffSlice'
import type { LogEntry, RoundRecord, VoteStatus } from '../../types'

export function CryptoPage() {
  const dispatch = useDispatch<AppDispatch>()
  const crypto = useSelector((s: RootState) => s.cryptoHotstuff)
  const hs = useSelector((s: RootState) => s.hotstuff)
  const [amount, setAmount] = useState(0)
  const [to, setTo] = useState('Replica 1')
  const from = 'Leader'
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    const timers = crypto.toasts.map((t) =>
      setTimeout(() => dispatch(removeCryptoToast(t.id)), 3200),
    )
    return () => timers.forEach((id) => clearTimeout(id))
  }, [crypto.toasts, dispatch])

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    dispatch(clearError())
    dispatch(
      submitTx({
        from,
        to,
        amount: Number(amount),
      }),
    )
  }

  const otherNodes = useMemo(() => nodeCycle.filter((n) => n !== from), [])

  useEffect(() => {
    if (!hs.committedBlocks.length) return
    const latestCommitted = hs.committedBlocks[hs.committedBlocks.length - 1]
    dispatch(finalizeBlock(latestCommitted))
  }, [hs.committedBlocks, dispatch])

  const hsSelectedRecord =
    hs.roundRecords[hs.selectedRound] ??
    ({
      round: hs.selectedRound,
      notes: ['Round not yet visited.'],
    } as RoundRecord)
  const hsSelectedLeader = leaderForRound(hsSelectedRecord.round)
  const roundStatuses = useMemo(() => {
    const status: Record<number, 'accepted' | 'rejected' | 'timeout' | 'idle'> = {}
    Object.values(hs.roundRecords).forEach((rec) => {
      if (rec.qc) status[rec.round] = 'accepted'
      else if (rec.tc) status[rec.round] = 'timeout'
    })
    return status
  }, [hs.roundRecords])
  const approvalsCount = Object.values(hs.nodeVotes).filter((v) => v === 'approve').length
  const proposeRemaining = hs.proposeDeadline
    ? Math.max(0, Math.ceil((hs.proposeDeadline - now) / 1000))
    : null
  const decisionRemaining = hs.decisionDeadline
    ? Math.max(0, Math.ceil((hs.decisionDeadline - now) / 1000))
    : null
  const newViewRemaining = hs.proposal ? null : proposeRemaining
  const dataSnapshot = useMemo(
    () =>
      JSON.stringify(
        {
          currentRound: hs.currentRound,
          highQC: hs.highQC,
          locked: {
            lockedRound: hs.lockedRound,
            lockedBlock: hs.lockedBlock,
          },
          proposal: hs.proposal ?? null,
          certifiedByRound: hs.certifiedByRound,
          timeoutsIssued: hs.timeoutIssued,
          staleMessagesIgnored: hs.staleMessagesIgnored,
          committedBlocks: hs.committedBlocks,
          roundRecords: hs.roundRecords,
          nodeVotes: hs.nodeVotes,
          decisionDeadline: hs.decisionDeadline,
          proposeDeadline: hs.proposeDeadline,
        },
        null,
        2,
      ),
    [hs],
  )

  const modalRecord =
    hs.modalRound !== null
      ? hs.roundRecords[hs.modalRound] ??
        ({
          round: hs.modalRound,
          notes: ['Round not yet visited.'],
        } as RoundRecord)
      : null
  const modalLeader = modalRecord ? leaderForRound(modalRecord.round) : null

  const handlePropose = () =>
    dispatch(
      proposeBlock({
        blockId: crypto.pendingBlock?.id,
        payload: crypto.pendingBlock?.tx,
      }),
    )
  const handleCollectQC = () => dispatch(collectQCFromVotes())
  const handleTimeout = (reason?: string) => dispatch(triggerTimeout(reason))
  const handleIgnore = () => dispatch(ignoreStaleMessage())
  const handleReset = () => dispatch(resetState())
  const handleVote = (label: string, choice: VoteStatus) => dispatch(recordVote({ label, choice }))
  const handleSelectRound = (round: number, openModal?: boolean) =>
    dispatch(setSelectedRound({ round, openModal }))

  return (
    <div className="page">
      <div className="section-heading">
        <h2>Biggie crypto (HotStuff-backed)</h2>
        <p className="sub">
          Total supply 1000 BIGGIE. Leader starts with all coins; send a single-transaction block to
          a replica.
        </p>
      </div>

      <div className="state-grid">
        <div className="card">
          <div className="card-heading">
            <p className="label">Balances</p>
            <p className="sub">Per-node holdings</p>
          </div>
          <div className="stats">
            <div>
              <p className="stat-label">Total supply</p>
              <p className="stat-value">{crypto.totalSupply} BIGGIE</p>
            </div>
            {nodeCycle.map((n) => (
              <div key={n}>
                <p className="stat-label">{n}</p>
                <p className="stat-value">{crypto.balances[n] ?? 0}</p>
              </div>
            ))}
          </div>
          <button className="ghost" onClick={() => dispatch(resetCryptoState())}>
            Reset balances
          </button>
        </div>

        <div className="card">
          <div className="card-heading">
            <p className="label">Send BIGGIE</p>
            <p className="sub">Queue a tx into the mempool</p>
          </div>
          <form className="form-grid" onSubmit={handleSubmit}>
            <label className="form-field">
              <span className="stat-label">From</span>
              <input type="text" value={from} disabled />
            </label>
            <label className="form-field">
              <span className="stat-label">To</span>
              <select value={to} onChange={(e) => setTo(e.target.value)}>
                {otherNodes.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="form-field">
              <span className="stat-label">Amount</span>
              <input
                type="number"
                min={1}
                max={crypto.balances[from]}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
              />
            </label>
            <div className="form-actions">
              <button type="submit">Send (to mempool)</button>
            </div>
            {crypto.error && <p className="note">Error: {crypto.error}</p>}
          </form>
          <p className="note">
            Validation: from ≠ to, amount &gt; 0, and sender must have enough balance (including
            queued tx). Each block will carry exactly one tx.
          </p>
        </div>
      </div>

      <div className="card">
        <div className="card-heading">
          <p className="label">Mempool</p>
          <p className="sub">Tx waiting to be block-built</p>
        </div>
        {crypto.mempool.length ? (
          <div className="log-entries">
            {crypto.mempool.map((tx) => (
              <div key={tx.id} className="log-entry">
                <div className="tag info">mempool</div>
                <div>
                  <p className="log-title">
                    {tx.from} → {tx.to}
                  </p>
                  <p className="log-detail">{tx.amount} BIGGIE</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">Mempool empty. Send a tx to enqueue.</div>
        )}
        <div className="form-actions">
          <button onClick={() => dispatch(buildBlock())} disabled={!crypto.mempool.length}>
            Build block from mempool head
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-heading">
          <p className="label">Pending block</p>
          <p className="sub">Built, ready to propose via HotStuff</p>
        </div>
        {crypto.pendingBlock ? (
          <div className="proposal">
            <div>
              <p className="stat-label">Block</p>
              <p className="stat-value">{crypto.pendingBlock.id}</p>
            </div>
            <div>
              <p className="stat-label">Tx</p>
              <p className="stat-value">
                {crypto.pendingBlock.tx.from} → {crypto.pendingBlock.tx.to}
              </p>
            </div>
            <div>
              <p className="stat-label">Amount</p>
              <p className="stat-value">{crypto.pendingBlock.tx.amount}</p>
            </div>
          </div>
        ) : (
          <div className="empty">No pending block. Build one from the mempool.</div>
        )}
        <div className="form-actions">
          <button onClick={handlePropose} disabled={!crypto.pendingBlock}>
            Propose pending block
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-heading">
          <p className="label">Blocks</p>
          <p className="sub">Finalized via 3-chain HotStuff commits</p>
        </div>
        {crypto.finalizedBlocks.length ? (
          <div className="log-entries">
            {crypto.finalizedBlocks.map((b) => (
              <div key={b.id} className="log-entry">
                <div className="tag round">final</div>
                <div>
                  <p className="log-title">
                    {b.id}: {b.tx.from} → {b.tx.to}
                  </p>
                  <p className="log-detail">
                    {b.tx.amount} BIGGIE • {new Date(b.tx.timestamp).toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty">
            No finalized blocks yet. Propose a built block and let HotStuff finalize it.
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-heading">
          <p className="label">Log</p>
          <p className="sub">Latest events</p>
        </div>
        <ul className="log-list">
          {crypto.log.map((entry, idx) => (
            <li key={`${entry.title}-${idx}`}>
              <p className="log-title">{entry.title}</p>
              <p className="log-detail">{entry.detail}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="section-heading">
        <h2>HotStuff flow (shared simulator)</h2>
        <p className="sub">See how transactions land in blocks, get votes/QCs, and finalize.</p>
      </div>
      <HotstuffView
        currentRound={hs.currentRound}
        highQCLabel={hs.highQC.label}
        lockedRound={hs.lockedRound}
        lockedBlock={hs.lockedBlock}
        proposal={hs.proposal}
        proposeRemaining={proposeRemaining}
        decisionRemaining={decisionRemaining}
        newViewRemaining={newViewRemaining}
        dataSnapshot={dataSnapshot}
        selectedRecord={hsSelectedRecord}
        selectedLeader={hsSelectedLeader}
        committedBlocks={hs.committedBlocks}
        approvalsCount={approvalsCount}
        activeProposalRound={hs.proposal?.round}
        nodeVotes={hs.nodeVotes}
        onSelectRound={handleSelectRound}
        onPropose={handlePropose}
        onCollectQC={handleCollectQC}
        onTimeout={() => handleTimeout(undefined)}
        onIgnore={handleIgnore}
        onReset={handleReset}
        onVote={handleVote}
        roundStatuses={roundStatuses}
        logEntries={hs.log as LogEntry[]}
      />

      <Toaster toasts={crypto.toasts} />
      {modalRecord && (
        <RoundModal
          record={modalRecord}
          leader={modalLeader ?? ''}
          onClose={() => dispatch(setModalRound(null))}
        />
      )}
    </div>
  )
}
