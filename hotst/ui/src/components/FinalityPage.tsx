export function FinalityPage() {
  return (
    <div className="page">
      <div className="section-heading">
        <h2>Finality at a glance</h2>
        <p className="sub">
          Deterministic vs probabilistic finality across common protocols. Tendermint finalizes
          blocks immediately and deterministically. HotStuff has eventual deterministic finality
          (needs future blocks).
        </p>
      </div>

      <table className="info-table">
        <thead>
          <tr>
            <th>Protocol</th>
            <th>Finality type</th>
            <th>When it finalizes</th>
            <th>Mechanics</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Tendermint</td>
            <td>Deterministic (immediate)</td>
            <td>Same height when prevote + precommit quorums align</td>
            <td>2-step BFT; precommit quorum seals the block instantly</td>
          </tr>
          <tr>
            <td>HotStuff</td>
            <td>Deterministic (eventual)</td>
            <td>After a 3-chain of QCs (block, child, grandchild)</td>
            <td>Leader-driven QCs; future QCs finalize ancestors</td>
          </tr>
          <tr>
            <td>Bitcoin</td>
            <td>Probabilistic</td>
            <td>After ~6 blocks (risk decays exponentially)</td>
            <td>PoW chain growth; forks resolve via longest/most-work chain</td>
          </tr>
          <tr>
            <td>Ethereum (Gasper)</td>
            <td>Economic / probabilistic → deterministic after checkpoints</td>
            <td>After 2 justified epochs (~12.8 min) under honest majority</td>
            <td>Casper FFG atop LMD-GHOST; finality via supermajority attestations</td>
          </tr>
          <tr>
            <td>Solana (Tower BFT)</td>
            <td>Probabilistic with fast convergence</td>
            <td>After a few confirmed votes; deeper locks raise rollback cost</td>
            <td>PoH for ordering; Tower BFT voting with escalating lockouts</td>
          </tr>
        </tbody>
      </table>

      <div className="section-heading">
        <h3>TL;DR</h3>
      </div>
      <ul>
        <li>Deterministic finality: once committed, can’t be reverted without protocol break.</li>
        <li>Probabilistic finality: reorg risk decays over time/confirmations.</li>
        <li>HotStuff and Tendermint both give deterministic finality; HotStuff requires looking
          ahead, Tendermint seals immediately.</li>
        <li>Bitcoin / Solana rely on probabilistic (or lockout-based) convergence; Ethereum offers
          strong economic finality once checkpoints finalize.</li>
      </ul>
    </div>
  )
}
