import assert from 'node:assert/strict'
import test from 'node:test'
import { pickInstallerAsset, tagVersion } from '../server/release.ts'
import { parseGrokVersion } from '../server/grok-cli.ts'
import { cmpVersion } from '../src/lib/semver.ts'
import { versionStatus, type AppVersionInfo } from '../src/lib/app-version.ts'

test('cmpVersion orders dotted versions and ignores a leading v', () => {
  assert.equal(cmpVersion('0.3.0', '0.3.1'), -1)
  assert.equal(cmpVersion('v0.4.0', '0.3.9'), 1)
  assert.equal(cmpVersion('1.2.3', '1.2.3'), 0)
  assert.equal(cmpVersion('nope', '1.0.0'), 0)
})

test('pickInstallerAsset takes the Windows setup and skips source archives', () => {
  const asset = pickInstallerAsset([
    { name: 'source.zip', browser_download_url: 'https://example/source.zip', size: 10 },
    {
      name: 'Grok-Build-Setup-0.3.1.exe',
      browser_download_url: 'https://example/setup.exe',
      size: 90_000_000,
    },
  ])
  assert.equal(asset?.name, 'Grok-Build-Setup-0.3.1.exe')
  assert.equal(asset?.url, 'https://example/setup.exe')
  assert.equal(pickInstallerAsset([{ name: 'notes.txt', browser_download_url: 'https://x' }]), null)
})

test('tagVersion strips a single leading v', () => {
  assert.equal(tagVersion('v0.3.1'), '0.3.1')
  assert.equal(tagVersion('0.3.1'), '0.3.1')
})

test('parseGrokVersion reads the first dotted version from CLI output', () => {
  assert.equal(parseGrokVersion('grok 0.2.141 (abc)\n'), '0.2.141')
  assert.equal(parseGrokVersion(''), '')
})

function info(patch: Partial<AppVersionInfo>): AppVersionInfo {
  return {
    repoUrl: 'https://github.com/qing-2114/grok-build-web',
    trackBranch: 'main',
    localVersion: '0.3.0',
    remoteVersion: '0.3.0',
    local: null,
    remote: null,
    isRepo: false,
    dirty: false,
    behind: 0,
    ahead: 0,
    updateMode: 'installer',
    downloadUrl: '',
    canUpdate: false,
    error: null,
    checkedAt: '',
    ...patch,
  }
}

test('installer status offers an update only when a setup asset exists', () => {
  const ready = versionStatus(
    info({
      remoteVersion: '0.3.1',
      downloadUrl: 'https://example/setup.exe',
      canUpdate: true,
    }),
  )
  assert.equal(ready.kind, 'update')
  assert.match(ready.text, /0\.3\.1/)

  const missing = versionStatus(info({ remoteVersion: '0.3.1' }))
  assert.equal(missing.kind, 'warn')

  const current = versionStatus(info({ remoteVersion: '0.3.0' }))
  assert.equal(current.kind, 'ok')
})

test('git status still explains a dirty worktree', () => {
  const status = versionStatus(
    info({
      updateMode: 'git',
      isRepo: true,
      dirty: true,
      behind: 2,
      remoteVersion: '0.3.1',
    }),
  )
  assert.equal(status.kind, 'warn')
  assert.match(status.text, /未提交/)
})
