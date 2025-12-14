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

export function InvariantGrid({ invariants }: Props) {
  return (
    <section>
      <div className="section-heading">
        <h2>First-round invariants</h2>
        <p className="sub">
          These must hold from genesis through Round 0 and when entering Round
          1—no future assumptions.
        </p>
      </div>
      <div className="invariant-grid">
        {invariants.map((inv) => (
          <div key={inv.id} className={`invariant ${inv.status}`}>
            <div className="invariant-top">
              <p className="label">Invariant {inv.id}</p>
              <span className={`pill ${inv.status}`}>{inv.label}</span>
            </div>
            <h3>{inv.title}</h3>
            <p className="detail">{inv.detail}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
