import { useEffect, useMemo, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import './App.css'
import { HomePage } from './components/hotstuff/HomePage'
import { InvariantsPage } from './components/hotstuff/InvariantsPage'
import { TendermintPage as ComparisonsPage } from './components/tendermint/TendermintPage'
import { TendermintSimPage } from './components/tendermint/TendermintSimPage'
import { FinalityPage } from './components/FinalityPage'
import { CryptoPage } from './components/crypto/CryptoPage'
import { NarwhalPage } from './components/NarwhalPage'
import { BtcLayerPage } from './components/BtcLayerPage'
import { GorkhePage } from './components/GorkhePage'
import { RoundModal } from './components/hotstuff/RoundModal'
import { Toaster } from './components/Toaster'
import { leaderForRound, nodeCycle } from './constants'
import type { LogEntry, RoundRecord, VoteStatus } from './types'
import {
  addToast,
  collectQCFromVotes,
  ignoreStaleMessage,
  proposeBlock,
  recordVote,
  resetState,
  setModalRound,
  setSelectedRound,
  triggerTimeout,
  removeToast,
  replicaTimeout,
} from './store/hotstuffSlice'
import type { RootState, AppDispatch } from './store/store'
import type { InvariantStatus } from './store/hotstuffSlice'

function App() {
  const dispatch = useDispatch<AppDispatch>()
  const state = useSelector((s: RootState) => s.hotstuff)
  const tmState = useSelector((s: RootState) => s.tendermint)
  const cryptoState = useSelector((s: RootState) => s.cryptoHotstuff)
  const [now, setNow] = useState(Date.now())

  const addToastWithTTL = (
    message: string,
    tone: 'success' | 'warn' | 'error' | 'info' | 'newview' = 'info',
    ttlMs = 3600,
  ) => {
    const id = Date.now() + Math.random()
    dispatch(addToast({ id, message, tone }))
    setTimeout(() => dispatch(removeToast(id)), ttlMs)
  }

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!state.proposal || !state.decisionDeadline) return
    const remaining = state.decisionDeadline - Date.now()
    const approvals = Object.values(state.nodeVotes).filter((v) => v === 'approve').length
    if (approvals >= 3) return
    if (remaining <= 0) {
      addToastWithTTL('Decision window expired → TC', 'warn')
      dispatch(triggerTimeout(undefined))
      return
    }
    const timer = setTimeout(() => {
      addToastWithTTL('Decision window expired → TC', 'warn')
      dispatch(triggerTimeout(undefined))
    }, remaining)
    return () => clearTimeout(timer)
  }, [state.proposal?.blockId, state.decisionDeadline, state.nodeVotes, dispatch])

  useEffect(() => {
    if (state.proposal) return
    if (!state.proposeDeadline) return
    const remaining = state.proposeDeadline - Date.now()
    if (remaining <= 0) {
      const senders = nodeCycle.slice(0, 3)
      addToastWithTTL(
        `NewView auto: ${senders.join(', ')} timed out leader`,
        'newview',
        30000,
      )
      senders.forEach((s) => dispatch(replicaTimeout(s)))
      return
    }
    const timer = setTimeout(() => {
      const senders = nodeCycle.slice(0, 3)
      addToastWithTTL(
        `NewView auto: ${senders.join(', ')} timed out leader`,
        'newview',
        30000,
      )
      senders.forEach((s) => dispatch(replicaTimeout(s)))
    }, remaining)
    return () => clearTimeout(timer)
  }, [state.proposeDeadline, state.proposal?.blockId, dispatch])

  const handlePropose = () => {
    dispatch(proposeBlock())
    addToastWithTTL('Leader proposed block', 'info')
  }

  const handleCollectQC = () => dispatch(collectQCFromVotes())

  const handleTimeout = (reason?: string) => {
    dispatch(triggerTimeout(reason))
    addToastWithTTL(reason ?? 'Timeout collected', 'warn')
  }

  const handleIgnore = () => dispatch(ignoreStaleMessage())
  const handleReset = () => dispatch(resetState())
  const handleVote = (label: string, choice: VoteStatus) => dispatch(recordVote({ label, choice }))

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
    return statuses.map((s) => ({ ...s, label: labelForStatus[s.status as keyof typeof labelForStatus] }))
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

  const roundStatuses = useMemo(() => {
    const status: Record<number, 'accepted' | 'rejected' | 'timeout' | 'idle'> = {}
    Object.values(state.roundRecords).forEach((rec) => {
      if (rec.qc) status[rec.round] = 'accepted'
      else if (rec.tc) status[rec.round] = 'timeout'
    })
    return status
  }, [state.roundRecords])

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
  const newViewRemaining = state.proposal ? null : proposeRemaining

  return (
    <div className="app-shell">
      <nav className="top-nav">
        <NavLink to="/" className="brand">
          HotStuff
        </NavLink>
        <div className="nav-links">
          <NavLink to="/invariants" className={({ isActive }) => (isActive ? 'active' : '')}>
            Invariants
          </NavLink>
          <NavLink to="/tendermint" className={({ isActive }) => (isActive ? 'active' : '')}>
            Tendermint
          </NavLink>
          <NavLink to="/comparisons" className={({ isActive }) => (isActive ? 'active' : '')}>
            Comparisons
          </NavLink>
          <NavLink to="/crypto" className={({ isActive }) => (isActive ? 'active' : '')}>
            Crypto
          </NavLink>
          <NavLink to="/finality" className={({ isActive }) => (isActive ? 'active' : '')}>
            Finality
          </NavLink>
          <NavLink to="/narwhal" className={({ isActive }) => (isActive ? 'active' : '')}>
            Narwhal/Bullshark
          </NavLink>
          <NavLink to="/btc-layer" className={({ isActive }) => (isActive ? 'active' : '')}>
            BTC Layer 2
          </NavLink>
          <NavLink to="/gorkhe" className={({ isActive }) => (isActive ? 'active' : '')}>
            Gorkhe
          </NavLink>
        </div>
      </nav>

      <main className="page">
        <Routes>
          <Route
            path="/"
            element={
              <HomePage
                currentRound={state.currentRound}
                highQCLabel={state.highQC.label}
                lockedRound={state.lockedRound}
                lockedBlock={state.lockedBlock}
                proposal={state.proposal}
                proposeRemaining={proposeRemaining}
                decisionRemaining={decisionRemaining}
                dataSnapshot={dataSnapshot}
                selectedRecord={selectedRecord}
                selectedLeader={selectedLeader}
                committedBlocks={state.committedBlocks}
                approvalsCount={approvalsCount}
                activeProposalRound={state.proposal?.round}
                newViewRemaining={newViewRemaining}
                roundStatuses={roundStatuses}
                onSelectRound={(round, openModal) =>
                  dispatch(setSelectedRound({ round, openModal }))
                }
                onPropose={handlePropose}
                onCollectQC={handleCollectQC}
                onTimeout={() => handleTimeout(undefined)}
                onIgnore={handleIgnore}
                onReset={handleReset}
                onVote={handleVote}
                nodeVotes={state.nodeVotes}
                logEntries={state.log as LogEntry[]}
              />
            }
          />
          <Route path="/invariants" element={<InvariantsPage invariants={invariants} />} />
          <Route path="/tendermint" element={<TendermintSimPage />} />
          <Route path="/comparisons" element={<ComparisonsPage />} />
          <Route path="/crypto" element={<CryptoPage />} />
          <Route path="/finality" element={<FinalityPage />} />
          <Route path="/narwhal" element={<NarwhalPage />} />
          <Route path="/btc-layer" element={<BtcLayerPage />} />
          <Route path="/gorkhe" element={<GorkhePage />} />
        </Routes>
      </main>

      <Toaster toasts={[...state.toasts, ...tmState.toasts, ...cryptoState.toasts]} />

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

export default App
