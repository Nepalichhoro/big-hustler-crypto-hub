export function BtcLayerPage() {
  return (
    <div className="page">
      <div className="section-heading">
        <h2>BTC Layer 2 quick plan</h2>
        <p className="sub">Anchoring HotStuff-style L2 to Bitcoin with rollup-style guarantees.</p>
      </div>

      <table className="info-table">
        <thead>
          <tr>
            <th>Component</th>
            <th>What it does</th>
            <th>Options / notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Security anchor</td>
            <td>Checkpoint L2 roots/headers into Bitcoin.</td>
            <td>OP_RETURN / Taproot spend; choose interval vs cost.</td>
          </tr>
          <tr>
            <td>Proof model</td>
            <td>Show L2 state transitions are correct.</td>
            <td>Optimistic (fraud proofs + challenge) or ZK validity proofs.</td>
          </tr>
          <tr>
            <td>Bridge</td>
            <td>Two-way peg for deposits/withdrawals.</td>
            <td>Federation/multisig today; covenant/Taproot scripts if available.</td>
          </tr>
          <tr>
            <td>BTC light client</td>
            <td>Verify BTC deposits on L2.</td>
            <td>NiPoPoW/Flyclient proofs; SPV headers with succinct proofs.</td>
          </tr>
          <tr>
            <td>L2 consensus</td>
            <td>Order L2 txs and finalize blocks.</td>
            <td>HotStuff/Narwhal-Bullshark or a sequencer set with rotation/slashing.</td>
          </tr>
          <tr>
            <td>Data availability</td>
            <td>Ensure tx data is retrievable.</td>
            <td>External DA (Celestia/EigenDA) or dispersed DA with erasure codes.</td>
          </tr>
          <tr>
            <td>Finality</td>
            <td>User confidence in L2 + BTC anchor.</td>
            <td>L2 deterministic finality + BTC confirmations on checkpoints.</td>
          </tr>
          <tr>
            <td>Withdrawal flow</td>
            <td>Prove withdrawal inclusion and execute on BTC.</td>
            <td>Validity proof or fraud-proof window; executed by bridge scripts/federation.</td>
          </tr>
          <tr>
            <td>Economics</td>
            <td>Incentivize correct behavior.</td>
            <td>Staking/slashing for sequencers; fee model (BTC or L2 token).</td>
          </tr>
        </tbody>
      </table>

      <div className="section-heading">
        <h3>Suggested MVP path</h3>
      </div>
      <ul>
        <li>Add Merkle/state roots to L2 blocks; commit roots to BTC testnet via OP_RETURN.</li>
        <li>Start optimistic: fraud proofs for bad state transitions; challenge window enforced off-chain.</li>
        <li>Deploy a federated multisig bridge for deposits/withdrawals; upgrade to covenant/Taproot when possible.</li>
        <li>Integrate a BTC light-client proof (NiPoPoW) on L2 to verify deposits.</li>
        <li>Use external DA (or simple blob store) for data availability; attest in BTC checkpoints.</li>
        <li>Upgrade to ZK validity proofs once flows work; verify proofs in a sidechain/L2 environment.</li>
      </ul>
    </div>
  )
}
