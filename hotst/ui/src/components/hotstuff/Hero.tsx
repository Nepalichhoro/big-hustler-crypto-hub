import { leaderForRound } from '../../constants'

type Props = {
  currentRound: number
  highQCLabel: string
  lockedRound: number
  proposeRemaining: number | null
  decisionRemaining: number | null
  onSelectRound: (round: number, openModal?: boolean) => void
  roundStatuses: Record<number, 'accepted' | 'rejected' | 'timeout' | 'idle'>
}

const rounds = [0, 1, 2, 3, 4, 5]

export function Hero({
  currentRound,
  highQCLabel,
  lockedRound,
  proposeRemaining,
  decisionRemaining,
  onSelectRound,
  roundStatuses,
}: Props) {
  return (
    <header className="hero">
      <div>
        <section>
  <h3>What the leader actually does (important)</h3>

  <p><strong>The leader:</strong></p>
  <ul>
    <li>proposes blocks</li>
    <li>aggregates votes</li>
    <li>broadcasts QCs</li>
  </ul>

  <p>That’s it.</p>

  <p><strong>Leaders do NOT:</strong></p>
  <ul>
    <li>decide finality</li>
    <li>append committed blocks for others</li>
    <li>announce commits</li>
  </ul>

  <h3>Mental model (this will click)</h3>

  <p>Think of HotStuff like this:</p>
  <ul>
    <li>The blockchain is implicit</li>
    <li>QCs are the real data structure</li>
    <li>Blocks become final as a side effect of QC growth</li>
  </ul>

  <p>
    <strong>HotStuff is a QC-chain protocol, not a “block append” protocol.</strong>
  </p>
</section>

        <p>In HotStuff, no single node adds blocks to the blockchain; every replica independently commits blocks when it locally observes the 3-QC rule, and finality is inferred rather than announced.</p>
        <p className="eyebrow">HotStuff • Genesis → Round 5</p>
        <h1>Genesis Round Explorer</h1>
        <p className="lede">
          Walk through the first HotStuff round, see how QCs move, and watch the
          invariants that keep replicas safe before any locks or commits exist.
        </p>
        <div className="chips">
          <span className="chip">
            currentRound <strong>{currentRound}</strong>
          </span>
          <span className="chip">
            highQC <strong>{highQCLabel}</strong>
          </span>
          <span className="chip">
            lockedRound <strong>{lockedRound}</strong>
          </span><span><i>locks protect safety during voting, not during proposing.</i></span>
          <span>Used by leaders. Attached to proposals as justifyQC. Answers: 👉 “What is the freshest globally safe block to extend?”</span>
          <div>highQC is used by the leader in proposals.
lockedQC / lockedRound is used by replicas to gate voting.</div>
          
        </div>
        <div className="timer-strip">
          <div>
            <p className="stat-label">NewView (leader) window</p>
            <div className="timer-value">
              <span className="timer-clock" />
              <p className="stat-value">
                {proposeRemaining !== null ? `${proposeRemaining}s` : '—'}
              </p>
            </div>
            <p className="mini-note">
              If the leader stays idle, replicas collect timeouts → NewView.
            </p>
          </div>
          <div>
            <p className="stat-label">Vote window</p>
              <div className="timer-value">
                <span className="timer-clock" />
                <p className="stat-value">
                  {decisionRemaining !== null ? `${decisionRemaining}s` : '—'}
                </p>
              </div>
              <p className="mini-note">
                After expiry, pending votes become ignored.
              </p>
            </div>
          </div>
      </div>
      <div className="stage-card">
        <p className="stage-label">Minimal model</p>
        <div className="rail chain-compact">
          {rounds.map((r, idx) => (
            <button
              key={r}
              className={`rail-item ${roundStatuses[r] ?? ''}`}
              onClick={() => onSelectRound(r, true)}
            >
              <div className={`rail-dot ${currentRound >= r ? 'active' : ''}`} />
              <div>
                <p className="rail-caption">
                  {r === 0 ? 'Genesis / R0' : `Round ${r}`}
                </p>
                <p className="rail-leader">Leader: {leaderForRound(r)}</p>
              </div>
              {idx < rounds.length - 1 && <div className="rail-line short" />}
            </button>
          ))}
        </div>
        <p className="rail-note">
          QC(Genesis) anchors Round 0. A QC(B0) or TC(0) is required to enter
          Round 1; the chain is shown through Round 5.
        </p>
      </div>
    </header>
  )
}
