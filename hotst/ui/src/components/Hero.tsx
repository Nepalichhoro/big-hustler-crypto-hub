import { leaderForRound } from '../constants'

type Props = {
  currentRound: number
  highQCLabel: string
  lockedRound: number
  proposeRemaining: number | null
  decisionRemaining: number | null
  onSelectRound: (round: number, openModal?: boolean) => void
}

const rounds = [0, 1, 2, 3, 4, 5]

export function Hero({
  currentRound,
  highQCLabel,
  lockedRound,
  proposeRemaining,
  decisionRemaining,
  onSelectRound,
}: Props) {
  return (
    <header className="hero">
      <div>
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
          </span>
        </div>
          <div className="timer-strip">
            <div>
              <p className="stat-label">Proposal window</p>
              <div className="timer-value">
                <span className="timer-clock" />
                <p className="stat-value">
                  {proposeRemaining !== null ? `${proposeRemaining}s` : '—'}
                </p>
              </div>
              <p className="mini-note">If leader stays idle, TC will form.</p>
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
              className="rail-item"
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
