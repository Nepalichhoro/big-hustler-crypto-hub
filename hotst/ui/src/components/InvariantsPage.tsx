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
      <InvariantGrid invariants={invariants} />
    </>
  )
}
