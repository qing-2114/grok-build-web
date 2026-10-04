import { useState } from 'react'
import { IconCheck, IconChevron, IconList } from '../icons'
import type { PlanEntry } from '../types'

/** agent 推送的计划清单。进行中默认展开，全部完成后收起成一行。 */
export function PlanCard({ entries, live }: { entries: PlanEntry[]; live: boolean }) {
  const done = entries.filter((e) => e.status === 'completed').length
  const finished = done === entries.length
  const [open, setOpen] = useState<boolean | null>(null)
  const expanded = open ?? (live || !finished)
  return (
    <section className={finished ? 'plan-card is-done' : 'plan-card'}>
      <button
        type="button"
        className="plan-head"
        onClick={() => setOpen(!expanded)}
        aria-expanded={expanded}
      >
        <IconList />
        <span>{finished ? '计划已完成' : '计划'}</span>
        <span className="plan-count">
          {done}/{entries.length}
        </span>
        <IconChevron className={expanded ? 'is-open' : ''} />
      </button>
      {expanded ? (
        <ol className="plan-list">
          {entries.map((e, i) => (
            <li key={i} className={`plan-item is-${e.status}`}>
              <span className="plan-mark" aria-hidden="true">
                {e.status === 'completed' ? <IconCheck /> : null}
              </span>
              <span className="plan-text">{e.content}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  )
}
