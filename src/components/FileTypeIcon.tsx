import { fileIconKind } from '../lib/file-icons'

// Vite embeds only this curated SVG subset; no CDN or runtime fetch is needed.
const assets = import.meta.glob<string>(
  '/node_modules/material-icon-theme/icons/{file,word,pdf,image,svg,table,powerpoint,markdown,document,typescript,javascript,react,python,go,rust,java,html,css,sass,json,yaml,settings,git,lock,zip,console,video,audio,database,folder,folder-open}.svg',
  { eager: true, query: '?url&inline', import: 'default' },
)

export function FileTypeIcon({ name, folder, expanded }: {
  name: string
  folder?: boolean
  expanded?: boolean
}) {
  const kind = folder ? (expanded ? 'folder-open' : 'folder') : fileIconKind(name)
  return <img className="tree-file-icon" src={assets[`/node_modules/material-icon-theme/icons/${kind}.svg`]} alt="" aria-hidden="true" draggable={false} />
}
