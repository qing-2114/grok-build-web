import assert from 'node:assert/strict'
import test from 'node:test'
import {
  defaultShellId,
  detectShells,
  externalLaunchArgs,
  localHtmlLaunchArgs,
} from '../server/shells.ts'

test('externalLaunchArgs uses the host opener on each platform', () => {
  assert.deepEqual(externalLaunchArgs('https://example.com', 'darwin'), {
    command: 'open',
    args: ['https://example.com'],
  })
  assert.deepEqual(externalLaunchArgs('https://example.com', 'linux'), {
    command: 'xdg-open',
    args: ['https://example.com'],
  })
  // Windows 走 rundll32（普通可执行文件），不再经过 cmd.exe：
  // `cmd /c start "" <url>` 会让 cmd 再解析一次命令行，`&` 既能截断链接，
  // 也能被注入成命令执行。
  assert.deepEqual(externalLaunchArgs('https://example.com', 'win32'), {
    command: 'rundll32.exe',
    args: ['url.dll,FileProtocolHandler', 'https://example.com'],
  })
})

test('externalLaunchArgs never routes through a shell', () => {
  for (const platform of ['win32', 'darwin', 'linux'] as const) {
    const spec = externalLaunchArgs('https://example.com', platform)
    for (const shell of ['cmd.exe', 'sh', 'bash', 'zsh', 'powershell.exe']) {
      assert.notEqual(spec.command, shell)
    }
  }
})

test('externalLaunchArgs keeps & intact as a single argument', () => {
  const spec = externalLaunchArgs('https://www.youtube.com/watch?v=X&t=30', 'win32')
  assert.equal(spec.args.length, 2)
  assert.equal(spec.args[1], 'https://www.youtube.com/watch?v=X&t=30')
})

test('externalLaunchArgs rejects quote, control chars and non-http schemes', () => {
  assert.throws(() => externalLaunchArgs('https://a/"&calc&"', 'win32'))
  assert.throws(() => externalLaunchArgs('https://a/\n calc', 'win32'))
  assert.throws(() => externalLaunchArgs('file:///C:/Windows/System32/calc.exe', 'win32'))
})

test('localHtmlLaunchArgs accepts .html and rejects other extensions', () => {
  assert.deepEqual(localHtmlLaunchArgs('C:\\tmp\\a&b.html', 'win32'), {
    command: 'rundll32.exe',
    args: ['url.dll,FileProtocolHandler', 'C:\\tmp\\a&b.html'],
  })
  assert.throws(() => localHtmlLaunchArgs('C:\\tmp\\a.exe', 'win32'))
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
