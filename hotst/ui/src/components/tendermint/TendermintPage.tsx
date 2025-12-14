export function TendermintPage() {
  return (
    <div className="page">
      <div className="section-heading">
        <h2>HotStuff vs Tendermint (decentralization lens)</h2>
        <p className="sub">
          Consensus-only comparison—no tokenomics or governance. The question: who drives progress?
        </p>
      </div>

      <table className="info-table">
        <thead>
          <tr>
            <th>Scenario</th>
            <th>HotStuff</th>
            <th>Tendermint</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Leader power</td>
            <td>Leader proposes, aggregates QCs; others mostly reactive.</td>
            <td>Proposer suggests, but prevote/precommit are independent.</td>
          </tr>
          <tr>
            <td>Progress without leader</td>
            <td>Timeouts → TC → next leader (coordination-heavy).</td>
            <td>Prevote(nil) / precommit(nil) → next round naturally.</td>
          </tr>
          <tr>
            <td>Censorship resistance</td>
            <td>Leader selects payload per round; rotation limits window.</td>
            <td>Rotation + nil votes shorten and expose censorship windows.</td>
          </tr>
          <tr>
            <td>Safety artifacts</td>
            <td>Global QCs; aggregation-centric.</td>
            <td>Per-validator locks/votes; safety power more distributed.</td>
          </tr>
          <tr>
            <td>Network assumptions</td>
            <td>Low latency, homogeneous nodes (often permissioned).</td>
            <td>Handles higher latency / heterogeneity better.</td>
          </tr>
        </tbody>
      </table>

      <div className="section-heading">
        <h3>Validator symmetry quick view</h3>
      </div>
      <table className="info-table">
        <thead>
          <tr>
            <th>Property</th>
            <th>HotStuff</th>
            <th>Tendermint</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Instant authority</td>
            <td>Leader</td>
            <td>Collective</td>
          </tr>
          <tr>
            <td>Voting power</td>
            <td>Reactive</td>
            <td>Active</td>
          </tr>
          <tr>
            <td>Failure handling</td>
            <td>Leader-centric</td>
            <td>Validator-centric</td>
          </tr>
          <tr>
            <td>Ease of reasoning</td>
            <td>Harder</td>
            <td>Easier</td>
          </tr>
          <tr>
            <td>Slashing semantics</td>
            <td>Harder</td>
            <td>Natural</td>
          </tr>
        </tbody>
      </table>

      <div className="section-heading">
        <h3>Key notes</h3>
      </div>
      <ul>
        <li>Tendermint is more decentralized in control/coordination/safety enforcement.</li>
        <li>HotStuff centralizes moment-to-moment authority for throughput; leaders rotate.</li>
        <li>Progress still hinges on QC or TC—no third path even with rejections.</li>
        <li>Cosmos chose Tendermint; Libra/Diem chose HotStuff; Ethereum chose neither directly.</li>
        <li>Takeaway: if decentralization means “no single node drives progress,” Tendermint wins; HotStuff wins on throughput.</li>
      </ul>
    </div>
  )
}
