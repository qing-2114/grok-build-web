import { IconFile } from '../icons'

/** `@` 引用文件的候选列表，样式沿用斜杠菜单。 */
export function MentionMenu({
  files,
  activeIndex,
  loading,
  onHover,
  onPick,
}: {
  files: string[]
  activeIndex: number
  loading: boolean
  onHover: (index: number) => void
  onPick: (path: string) => void
}) {
  return (
    <div id="mention-menu" className="slash-menu" role="listbox" aria-label="引用文件">
      <div className="slash-group">
        <div className="slash-head">引用文件</div>
        {files.map((rel, i) => {
          const cut = rel.lastIndexOf('/')
          const name = cut >= 0 ? rel.slice(cut + 1) : rel
          const dir = cut >= 0 ? rel.slice(0, cut) : ''
          return (
            <button
              key={rel}
              id={`mention-${i}`}
              type="button"
              role="option"
              aria-selected={i === activeIndex}
              className={i === activeIndex ? 'slash-item is-active' : 'slash-item'}
              onMouseEnter={() => onHover(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(rel)}
            >
              <span className="slash-icon">
                <IconFile />
              </span>
              <span className="slash-title">{name}</span>
              <span className="slash-desc">{dir}</span>
            </button>
          )
        })}
      </div>
      {files.length === 0 ? (
        <div className="slash-empty">{loading ? '正在查找…' : '没有匹配的文件'}</div>
      ) : null}
    </div>
  )
}
