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

      <div className="section-heading">
        <h2>BTC limitations (DA is the bottleneck)</h2>
        <p className="sub">
          Bitcoin gives settlement and immutability, but no native data availability. An L2 must pick
          a DA strategy.
        </p>
      </div>
      <table className="info-table">
        <thead>
          <tr>
            <th>Option</th>
            <th>Where data lives</th>
            <th>Pros</th>
            <th>Cons</th>
            <th>Trust model</th>
            <th>Who uses it</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>On-BTC DA</td>
            <td>OP_RETURN / witness inscriptions in BTC blocks</td>
            <td>Max security; DA = Bitcoin</td>
            <td>Tiny throughput; very expensive</td>
            <td>Pure Bitcoin full-node security</td>
            <td>Early Lightning, simple anchoring, proto-rollups</td>
          </tr>
          <tr>
            <td>External DA + BTC anchor</td>
            <td>Celestia / EigenDA hold tx data; BTC stores roots</td>
            <td>Scalable, cheap, modular</td>
            <td>Trust shifts to DA layer; need DA light clients</td>
            <td>BTC settlement × DA chain availability/slashing</td>
            <td>Experimental BTC rollups</td>
          </tr>
          <tr>
            <td>Dispersed DA + erasure coding</td>
            <td>Sharded/erasure-coded P2P storage; BTC stores commitments</td>
            <td>No single DA operator; withholding detectable</td>
            <td>Complex, probabilistic DA, slower</td>
            <td>Crypo-economic + probabilistic availability with challenges</td>
            <td>Alpen-like, BitVM-flavored designs</td>
          </tr>
          <tr>
            <td>BitVM-style optimistic DA</td>
            <td>Off-chain P2P; BTC only for disputes</td>
            <td>Safety preserved; minimal on-chain data</td>
            <td>Liveness fragile if data withheld</td>
            <td>Challenge-based safety; liveness is social/cooperative</td>
            <td>BitVM rollup experiments</td>
          </tr>
        </tbody>
      </table>

      <div className="section-heading">
        <h3>Projects and DA guarantees</h3>
      </div>
      <table className="info-table">
        <thead>
          <tr>
            <th>Project / Approach</th>
            <th>Where tx data lives</th>
            <th>DA guarantee</th>
            <th>Trust model</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>On-BTC DA</td>
            <td>Bitcoin blocks (full nodes store raw tx data forever)</td>
            <td>Deterministic</td>
            <td>BTC only</td>
          </tr>
          <tr>
            <td>External DA (Celestia/EigenDA)</td>
            <td>DA chain blobs; BTC stores commitments</td>
            <td>Probabilistic + slashing</td>
            <td>BTC + DA</td>
          </tr>
          <tr>
            <td>Stacks</td>
            <td>Stacks nodes keep tx data; periodic anchors to BTC</td>
            <td>Social</td>
            <td>Federation / social recovery</td>
          </tr>
          <tr>
            <td>Babylon</td>
            <td>N/A (focuses on timestamping/PoS security, not DA)</td>
            <td>N/A</td>
            <td>Security layer, not execution L2</td>
          </tr>
          <tr>
            <td>Alpen Labs</td>
            <td>Erasure-coded P2P shards; BTC stores commitments</td>
            <td>Probabilistic, detectable</td>
            <td>Crypto-economic</td>
          </tr>
          <tr>
            <td>BitVM rollups</td>
            <td>Off-chain P2P data; BTC only for fraud games</td>
            <td>Safety only; liveness weak</td>
            <td>Challenge-based</td>
          </tr>
        </tbody>
      </table>

      <p className="note">
        Core trade-off: Bitcoin gives strong safety, but DA and liveness are costly. BTC L2s choose
        between maximal safety (on-BTC), scalability (external DA), or probabilistic DA (erasure
        coding/BitVM), because Bitcoin lacks blobs/sampling.
      </p>
    </div>
  )
}
