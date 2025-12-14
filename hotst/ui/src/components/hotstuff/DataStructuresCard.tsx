type Props = {
  dataSnapshot: string
}

export function DataStructuresCard({ dataSnapshot }: Props) {
  return (
    <div className="card">
      <div className="card-heading">
        <p className="label">Data structures</p>
        <p className="sub">Inspect the live JSON backing this view.</p>
      </div>
      <pre className="json-view">{dataSnapshot}</pre>
    </div>
  )
}
