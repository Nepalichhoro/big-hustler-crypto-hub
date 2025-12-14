import { InvariantGrid } from './InvariantGrid'

type InvariantStatus = 'ok' | 'warn' | 'fail'

type Invariant = {
  id: number
  title: string
  detail: string
  status: InvariantStatus
  label: string
}

type Props = {
  invariants: Invariant[]
}

export function InvariantsPage({ invariants }: Props) {
  return (
    <>
      <div className="section-heading">
        <h2>Round Progress Scenarios</h2>
        <p className="sub">Compact truth table for how the round advances.</p>
      </div>
      <table className="info-table">
        <thead>
          <tr>
            <th>Scenario</th>
            <th>QC formed?</th>
            <th>TC formed?</th>
            <th>Progress</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>All accept</td>
            <td>✅</td>
            <td>❌</td>
            <td>via QC</td>
          </tr>
          <tr>
            <td>Some accept, not enough</td>
            <td>❌</td>
            <td>✅</td>
            <td>via TC</td>
          </tr>
          <tr>
            <td>All reject</td>
            <td>❌</td>
            <td>✅</td>
            <td>via TC</td>
          </tr>
          <tr>
            <td>Leader silent</td>
            <td>❌</td>
            <td>✅</td>
            <td>via TC</td>
          </tr>
        </tbody>
      </table>

      <div className="section-heading">
        <h2>Invariant Quick Scan</h2>
        <p className="sub">Distinct checkpoints for the genesis round.</p>
      </div>
      <table className="info-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Invariant</th>
            <th>Status</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {invariants.map((inv) => (
            <tr key={inv.id}>
              <td>{inv.id}</td>
              <td>{inv.title}</td>
              <td>{inv.label}</td>
              <td>{inv.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <InvariantGrid invariants={invariants} />
    </>
  )
}
