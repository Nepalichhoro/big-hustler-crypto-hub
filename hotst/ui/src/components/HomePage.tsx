import type { LogEntry, Proposal, RoundRecord, VoteStatus } from '../types'
import { Hero } from './Hero'
import { ReplicaStateCard } from './ReplicaStateCard'
import { RoundControlsCard } from './RoundControlsCard'
import { DataStructuresCard } from './DataStructuresCard'
import { ProposalCard } from './ProposalCard'
import { RoundFocusCard } from './RoundFocusCard'
import { NodeCluster } from './NodeCluster'

type Props = {
  currentRound: number
  highQCLabel: string
  lockedRound: number
  lockedBlock: string | null
  proposal?: Proposal
  proposeRemaining: number | null
  decisionRemaining: number | null
  newViewRemaining: number | null
  dataSnapshot: string
  selectedRecord: RoundRecord
  selectedLeader: string
  approvalsCount: number
  activeProposalRound?: number
  nodeVotes: Record<string, VoteStatus>
  onSelectRound: (round: number, openModal?: boolean) => void
  onPropose: () => void
  onCollectQC: () => void
  onTimeout: () => void
  onIgnore: () => void
  onReset: () => void
  onVote: (label: string, choice: VoteStatus) => void
  logEntries: LogEntry[]
}

export function HomePage({
  currentRound,
  highQCLabel,
  lockedRound,
  lockedBlock,
  proposal,
  proposeRemaining,
  decisionRemaining,
  dataSnapshot,
  selectedRecord,
  selectedLeader,
  approvalsCount,
  activeProposalRound,
  nodeVotes,
  onSelectRound,
  onPropose,
  onCollectQC,
  onTimeout,
  onIgnore,
  onReset,
  onVote,
  logEntries,
  newViewRemaining,
}: Props) {
  return (
    <>
      <Hero
        currentRound={currentRound}
        highQCLabel={highQCLabel}
        lockedRound={lockedRound}
        proposeRemaining={proposal ? null : proposeRemaining}
        decisionRemaining={proposal ? decisionRemaining : null}
        onSelectRound={onSelectRound}
      />

      <section className="state-grid">
        <ReplicaStateCard
          currentRound={currentRound}
          highQCLabel={highQCLabel}
          lockedRound={lockedRound}
          lockedBlock={lockedBlock}
          onReset={onReset}
        />

        <RoundControlsCard
          currentRound={currentRound}
          proposalId={proposal?.blockId}
          onPropose={onPropose}
          onCollectQC={onCollectQC}
          onTimeout={onTimeout}
          onIgnore={onIgnore}
        />

        <DataStructuresCard dataSnapshot={dataSnapshot} />

        <ProposalCard proposal={proposal} />
      </section>

      <section className="node-row">
        <RoundFocusCard
          record={selectedRecord}
          leader={selectedLeader}
          approvals={approvalsCount}
          decisionRemaining={
            proposal && proposal.round === selectedRecord.round
              ? decisionRemaining
              : null
          }
        />

        <NodeCluster
          record={selectedRecord}
          selectedLeader={selectedLeader}
          nodeVotes={nodeVotes}
          activeProposalRound={activeProposalRound}
          newViewRemaining={newViewRemaining}
          decisionRemaining={decisionRemaining}
          onVote={onVote}
          onOpenModal={(round) => onSelectRound(round, true)}
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
          {logEntries.map((entry, idx) => (
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
    </>
  )
}
