export function NarwhalPage() {
  return (
    <div className="page">
      <div className="section-heading">
        <h2>Narwhal + Bullshark vs HotStuff</h2>
        <p className="sub">
          How decoupling data availability (Narwhal) and ordering (Bullshark) changes the HotStuff
          story.
        </p>
      </div>

      <table className="info-table">
        <thead>
          <tr>
            <th>Dimension</th>
            <th>HotStuff</th>
            <th>Narwhal + Bullshark</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Data plane</td>
            <td>Leader ships proposal payloads each round.</td>
            <td>Narwhal DAG gossips/certifies batches; leaders reference digests.</td>
          </tr>
          <tr>
            <td>Ordering plane</td>
            <td>Linear chain with leader-driven QCs.</td>
            <td>Bullshark orders DAG nodes deterministically; less leader dependence.</td>
          </tr>
          <tr>
            <td>Throughput</td>
            <td>Leader bottleneck; per-round blob shipping.</td>
            <td>High throughput; data pre-spread, proposals are light digests.</td>
          </tr>
          <tr>
            <td>Liveness under slow leader</td>
            <td>Timeouts / TC → next leader; payload may be missing.</td>
            <td>Data already certified; ordering proceeds once digests exist.</td>
          </tr>
          <tr>
            <td>Finality</td>
            <td>Deterministic via 3-chain of QCs (grandparent commit).</td>
            <td>Deterministic once DAG nodes are ordered; no 3-chain wait.</td>
          </tr>
          <tr>
            <td>Batching</td>
            <td>Often single-block payload per round.</td>
            <td>Natural batching: certified batches per DAG node.</td>
          </tr>
          <tr>
            <td>Leader role</td>
            <td>Drives both data and votes.</td>
            <td>Ordering leader is lightweight; data comes from DAG certificates.</td>
          </tr>
          <tr>
            <td>DoS surface</td>
            <td>Leader is a throughput chokepoint.</td>
            <td>Less choke: data spread across validators; leader needs only digests.</td>
          </tr>
        </tbody>
      </table>

      <div className="section-heading">
        <h3>TL;DR</h3>
      </div>
      <ul>
        <li>Split data availability (Narwhal) from ordering (Bullshark) to avoid leader bottlenecks.</li>
        <li>Payloads are pre-distributed and certified; proposals carry digests, not blobs.</li>
        <li>Ordering is deterministic; finality remains BFT, typically with lower latency under churn.</li>
        <li>Higher throughput and resilience when leaders are slow or under attack.</li>
      </ul>
    </div>
  )
}
