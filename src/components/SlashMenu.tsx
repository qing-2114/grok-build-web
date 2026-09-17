import {
  IconCopy,
  IconFile,
  IconGear,
  IconMonitor,
  IconNewChat,
  IconPencil,
  IconPrompt,
  IconSearch,
  IconShield,
  IconSpark,
  IconTrash,
} from '../icons'
import type { SlashCommand, SlashGroup, SlashIcon } from '../lib/slash'

function Glyph({ icon }: { icon: SlashIcon }) {
  switch (icon) {
    case 'new':
      return <IconNewChat />
    case 'compact':
    case 'model':
    case 'effort':
    case 'image':
    case 'video':
    case 'learn':
      return <IconSpark />
    case 'copy':
      return <IconCopy />
    case 'rename':
      return <IconPencil />
    case 'delete':
      return <IconTrash />
    case 'plan':
    case 'docs':
      return <IconFile />
    case 'shield':
      return <IconShield />
    case 'remember':
    case 'memory':
    case 'aside':
    case 'feedback':
      return <IconPrompt />
    case 'research':
      return <IconSearch />
    case 'workflow':
    case 'loop':
    case 'goal':
      return <IconMonitor />
    case 'settings':
      return <IconGear />
    case 'usage':
      return <IconMonitor />
    default:
      return <IconSpark />
  }
}

export function SlashMenu({
  groups,
  activeId,
  empty = 'No matching commands',
  heads,
  onHover,
  onPick,
}: {
  groups: SlashGroup[]
  activeId: string | null
  empty?: string
  heads?: boolean
  onHover: (id: string) => void
  onPick: (cmd: SlashCommand) => void
}) {
  const showHeads = heads ?? groups.length > 1
  return (
    <div
      id="slash-menu"
      className="slash-menu"
      role="listbox"
      aria-label="Slash commands"
    >
      {groups.map((g) => (
        <div key={g.group} className="slash-group">
          {showHeads ? <div className="slash-head">{g.group}</div> : null}
          {g.commands.map((cmd) => {
            const active = cmd.id === activeId
            return (
              <button
                key={cmd.id}
                id={`slash-${cmd.id}`}
                type="button"
                role="option"
                aria-selected={active}
                className={active ? 'slash-item is-active' : 'slash-item'}
                onMouseEnter={() => onHover(cmd.id)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onPick(cmd)}
              >
                <span className="slash-icon">
                  <Glyph icon={cmd.icon} />
                </span>
                <span className="slash-title">{cmd.title}</span>
                {cmd.argHint ? (
                  <span className="slash-arg">{cmd.argHint}</span>
                ) : null}
                <span className="slash-desc">{cmd.description}</span>
              </button>
            )
          })}
        </div>
      ))}
      {groups.length === 0 ? (
        <div className="slash-empty">{empty}</div>
      ) : null}
    </div>
  )
}
