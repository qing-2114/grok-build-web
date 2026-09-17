import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'
import { gitFileDiff, gitInfo, normalizePath, samePath } from '../server/git.ts'

const execFileAsync = promisify(execFile)

test('normalizePath preserves the platform-native absolute path', () => {
  const expected = resolve('folder', 'child')
  const actual = normalizePath(join('folder', 'child'))

  assert.equal(actual, expected)
  if (sep === '/') assert.equal(actual.includes('\\'), false)
})

test('samePath follows the host file system case semantics', () => {
  const upper = resolve('CaseSensitivePath')
  const lower = resolve('casesensitivepath')

  assert.equal(samePath(upper, upper), true)
  assert.equal(samePath(upper, lower), process.platform === 'win32')
})

test('gitInfo detects a repository through a native POSIX path', async (t) => {
  if (process.platform === 'win32') {
    t.skip('POSIX regression')
    return
  }

  const dir = await mkdtemp(join(tmpdir(), 'grok-build-web-git-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  await execFileAsync('git', ['init', '-b', 'test-branch'], { cwd: dir })
  await writeFile(join(dir, 'tracked.txt'), 'tracked\n', 'utf8')
  await execFileAsync('git', ['add', 'tracked.txt'], { cwd: dir })
  await execFileAsync(
    'git',
    [
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgSign=false',
      'commit',
      '--no-verify',
      '-m',
      'init',
    ],
    { cwd: dir },
  )

  assert.deepEqual(await gitInfo(dir), {
    isRepo: true,
    branch: 'test-branch',
    branches: ['test-branch'],
  })
})

test('gitFileDiff returns a patch for an untracked file on every platform', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'grok-build-web-diff-'))
  try {
    await execFileAsync('git', ['init'], { cwd: dir })
    const file = 'untracked file.txt'
    await writeFile(join(dir, file), 'hello\n', 'utf8')

    const result = await gitFileDiff(dir, file)

    assert.equal(result.path, file)
    assert.match(result.patch, /^--- \/dev\/null$/m)
    assert.match(result.patch, /^\+\+\+ b\/untracked file\.txt(?:\t)?$/m)
    assert.match(result.patch, /^\+hello$/m)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
