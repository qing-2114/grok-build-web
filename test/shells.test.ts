import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultShellId, detectShells, openCommand } from '../server/shells.ts'

test('openCommand uses the host opener on each platform', () => {
  assert.deepEqual(openCommand('https://example.com', 'darwin'), {
    command: 'open',
    args: ['https://example.com'],
  })
  assert.deepEqual(openCommand('https://example.com', 'linux'), {
    command: 'xdg-open',
    args: ['https://example.com'],
  })
  assert.deepEqual(openCommand('https://example.com', 'win32'), {
    command: 'cmd.exe',
    args: ['/c', 'start', '', 'https://example.com'],
  })
})

test('defaultShellId prefers the login shell outside Windows', () => {
  const shells = [
    { id: 'zsh', label: 'zsh', command: '/bin/zsh', args: ['-l'], available: true },
    { id: 'bash', label: 'bash', command: '/bin/bash', args: ['-l'], available: true },
  ]
  assert.equal(defaultShellId(shells, 'darwin', '/bin/zsh'), 'zsh')
  assert.equal(defaultShellId(shells, 'linux', '/bin/bash'), 'bash')
  assert.equal(
    defaultShellId(
      [
        { id: 'powershell', label: 'PowerShell', command: 'pwsh', args: [], available: true },
        { id: 'cmd', label: 'Command Prompt', command: 'cmd', args: [], available: true },
      ],
      'win32',
      '',
    ),
    'powershell',
  )
})

test('detectShells lists a POSIX shell on this host', async (t) => {
  if (process.platform === 'win32') {
    t.skip('POSIX regression')
    return
  }

  const shells = await detectShells()
  assert.ok(shells.length > 0)
  assert.equal(
    shells.some((s) => s.id === 'powershell' || s.id === 'cmd' || s.id === 'wsl'),
    false,
  )
  assert.ok(shells.every((s) => s.available && s.command))
  const ids = new Set(shells.map((s) => s.id))
  assert.ok(ids.has('zsh') || ids.has('bash') || ids.has('sh'))
})
