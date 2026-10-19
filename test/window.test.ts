import assert from 'node:assert/strict'
import test from 'node:test'
import { appWindowArgs } from '../server/window.ts'

test('desktop window launches the bundled electron app, not a browser', () => {
  const previous = process.env.GROK_WEB_ELECTRON
  process.env.GROK_WEB_ELECTRON = process.execPath
  try {
    const launch = appWindowArgs('http://127.0.0.1:5173/', 'F:\\grok-build-web\\public\\grok-icon.ico')
    assert.equal(launch.executable, process.execPath)
    assert.equal(launch.args.length, 1)
    assert.match(launch.args[0], /electron[\\/]main\.cjs$/)
    assert.equal(launch.env.GROK_WEB_URL, 'http://127.0.0.1:5173/')
    assert.equal(launch.env.GROK_WEB_ICON, 'F:\\grok-build-web\\public\\grok-icon.ico')
    assert.equal('ELECTRON_RUN_AS_NODE' in launch.env, false)
    assert.equal(launch.args.some((arg) => arg.includes('chrome.exe')), false)
  } finally {
    if (previous == null) delete process.env.GROK_WEB_ELECTRON
    else process.env.GROK_WEB_ELECTRON = previous
  }
})
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import * as path from 'node:path'

test('desktop reveal validates sender and path before calling the native shell', async () => {
  const handlers = new Map<string, (...args: any[]) => Promise<void>>()
  const revealed: string[] = []
  const checked: string[] = []
  vm.runInNewContext(readFileSync('electron/main.cjs', 'utf8'), {
    require: (name: string) => {
      if (name === 'node:path') return path
      if (name === 'node:fs/promises') return { stat: async (target: string) => {
        checked.push(target)
        if (target.includes('missing')) throw new Error('ENOENT')
      } }
      if (name === 'electron') return {
        app: { whenReady: () => ({ then: () => {} }), on: () => {} },
        ipcMain: { handle: (name: string, fn: (...args: any[]) => Promise<void>) => handlers.set(name, fn) },
        shell: { showItemInFolder: (target: string) => revealed.push(target) },
      }
      throw new Error(name)
    },
    process: { env: {} }, URL, __dirname: path.resolve('electron'),
  })
  const reveal = handlers.get('reveal-file')!
  const frame = { url: 'http://127.0.0.1:5173/?demo=1' }
  const event = { senderFrame: frame, sender: { mainFrame: frame } }
  const file = path.resolve('中文 报告.pdf')
  await reveal(event, file)
  assert.deepEqual(revealed, [file])
  await assert.rejects(reveal(event, '../relative.pdf'))
  await assert.rejects(reveal(event, `${file}\0`))
  await assert.rejects(reveal(event, path.resolve('missing.pdf')))
  await assert.rejects(reveal({ ...event, senderFrame: { url: frame.url } }, file))
  frame.url = 'https://example.com/'
  await assert.rejects(reveal(event, file))
  assert.equal(checked.length, 2)
  assert.equal(revealed.length, 1)
})
