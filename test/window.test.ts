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
