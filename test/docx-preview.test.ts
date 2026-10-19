import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { readPreview } from '../server/fs.ts'

test('DOCX files are routed to structural browser rendering without lossy text extraction', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'grok-docx-preview-'))
  try {
    const file = join(dir, 'sample.docx')
    await writeFile(file, Buffer.from('not a valid docx package'))
    const preview = await readPreview(dir, file)
    assert.equal(preview.kind, 'docx')
    assert.equal(preview.text, undefined)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
