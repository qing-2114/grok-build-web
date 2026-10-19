import assert from 'node:assert/strict'
import test from 'node:test'
import { createServer } from 'node:http'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { streamRaw } from '../server/fs.ts'

test('raw preview streams Unicode filenames with RFC 5987 headers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'grok-preview-'))
  const name = "实验 报告 #1 (修订)'😀.pdf"
  const bytes = Buffer.from('%PDF-1.4\npreview test\n%%EOF')
  await writeFile(join(root, name), bytes)
  const server = createServer((req, res) => {
    void streamRaw(root, name, req, res).catch((error) => {
      res.statusCode = 500
      res.end(String(error))
    })
  })
  try {
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address() as { port: number }
    const response = await fetch(`http://127.0.0.1:${address.port}/`)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'application/pdf')
    const disposition = response.headers.get('content-disposition')!
    assert.match(disposition, /^inline; filename="preview.pdf"; filename\*=UTF-8''/)
    assert.equal(decodeURIComponent(disposition.split("UTF-8''")[1]), name)
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(root, { recursive: true, force: true })
  }
})
