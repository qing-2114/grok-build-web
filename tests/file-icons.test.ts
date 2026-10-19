import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { describe, it } from 'node:test'
import { fileIconKind, fileIconKinds } from '../src/lib/file-icons.ts'

describe('local file icons', () => {
  it('distinguishes documents, media and source files independent of path case', () => {
    for (const [name, icon] of Object.entries({
      'C:\\Docs\\REPORT.DOCX': 'word', '/docs/report.PDF': 'pdf',
      'photo.png': 'image', 'data.xlsx': 'table', 'slides.pptx': 'powerpoint',
      'main.ts': 'typescript', 'view.tsx': 'react', 'main.js': 'javascript',
      'notes.md': 'markdown', 'schema.sql': 'database',
      '.env.local': 'settings', '.gitignore': 'git', 'package-lock.json': 'lock',
      'unknown.xyz': 'file', 'LICENSE': 'file',
    })) assert.equal(fileIconKind(name), icon, name)
  })

  it('ships every selected SVG and the upstream license locally', () => {
    for (const icon of [...fileIconKinds, 'folder', 'folder-open']) {
      assert.ok(existsSync(new URL(`../node_modules/material-icon-theme/icons/${icon}.svg`, import.meta.url)), icon)
    }
    assert.ok(existsSync(new URL('../public/licenses/material-icon-theme.txt', import.meta.url)))
  })
})
