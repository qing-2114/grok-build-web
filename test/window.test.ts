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

test('Windows taskbar identity uses the Grok icon and a fresh AUMID cache key', async () => {
  const appIds: string[] = []
  const windows: Array<{ options: Record<string, unknown>; details?: Record<string, unknown> }> = []
  const icon = path.resolve('public/grok-icon.ico')
  vm.runInNewContext(readFileSync('electron/main.cjs', 'utf8'), {
    require: (name: string) => {
      if (name === 'node:path') return path
      if (name === 'node:fs/promises') return { stat: async () => {} }
      if (name === 'electron') return {
        app: {
          setAppUserModelId: (id: string) => appIds.push(id),
          whenReady: () => ({ then: (fn: () => void) => { fn() } }),
          on: () => {},
        },
        BrowserWindow: class {
          options: Record<string, unknown>
          constructor(options: Record<string, unknown>) {
            this.options = options
            Object.assign(this, {
              webContents: { setWindowOpenHandler: () => {}, on: () => {} },
            })
            windows.push(this)
          }
          setMenuBarVisibility() {}
          setAppDetails(details: Record<string, unknown>) { windows[0].details = details }
          loadURL() {}
          static fromWebContents() { return null }
        },
        dialog: {}, ipcMain: { handle: () => {} }, shell: { openExternal: () => {} },
      }
      throw new Error(name)
    },
    process: { platform: 'win32', env: { GROK_WEB_ICON: icon } },
    URL, __dirname: path.resolve('electron'),
  })

  assert.deepEqual(appIds, ['com.grokbuild.web.desktop.v3'])
  assert.equal(windows.length, 1)
  assert.equal(windows[0].options.icon, icon)
  assert.equal(windows[0].details?.appId, appIds[0])
  assert.equal(windows[0].details?.appIconPath, icon)
  assert.equal(windows[0].details?.appIconIndex, 0)
})
