// 命令行注入 / 参数注入 / 配置损坏 的回归自测。
// 运行：node server/exec.selftest.mjs   （Node 24 原生剥离 TS 类型）
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { externalLaunchArgs, localHtmlLaunchArgs } from './shells.ts'
import { assertBranchName, gitCheckout } from './git.ts'
import {
  assertHttpUrl,
  groupProviders,
  mergeProviderExtraLines,
  parseConfigModels,
  parseProviderBody,
  renderConfigToml,
  saveProvider,
} from './deploy.ts'

let passed = 0
const failures = []

function check(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`ok   ${name}`)
  } catch (err) {
    failures.push(name)
    console.log(`FAIL ${name}: ${err && err.message ? err.message : err}`)
  }
}

async function checkAsync(name, fn) {
  try {
    await fn()
    passed += 1
    console.log(`ok   ${name}`)
  } catch (err) {
    failures.push(name)
    console.log(`FAIL ${name}: ${err && err.message ? err.message : err}`)
  }
}

function eq(actual, expected, what) {
  if (actual !== expected) {
    throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  }
}

function ok(cond, what) {
  if (!cond) throw new Error(what)
}

function throws(fn, what) {
  let threw = false
  try {
    fn()
  } catch {
    threw = true
  }
  if (!threw) throw new Error(`${what}: expected a throw`)
}

function includes(haystack, needle, what) {
  if (!haystack.includes(needle)) {
    throw new Error(`${what}: missing ${JSON.stringify(needle)}`)
  }
}

// ---------------------------------------------------------------- T1 openExternal

check('T1 externalLaunchArgs keeps & intact and never uses cmd.exe', () => {
  const url = 'https://a/?x=1&y=2'
  const spec = externalLaunchArgs(url)
  ok(spec.command !== 'cmd.exe', 'launcher must not be cmd.exe')
  eq(spec.command, 'rundll32.exe', 'windows launcher')
  eq(spec.args.length, 2, 'args length')
  eq(spec.args[0], 'url.dll,FileProtocolHandler', 'entry point')
  eq(spec.args[1], url, 'url is one unmodified argument')
  ok(!spec.args.includes('cmd.exe'), 'no cmd.exe in args')
})

check('T1 externalLaunchArgs rejects quotes / control chars / bad scheme', () => {
  throws(() => externalLaunchArgs('https://x/";calc;"'), 'double quote')
  throws(() => externalLaunchArgs('https://x/\u0000'), 'NUL')
  throws(() => externalLaunchArgs('https://x/\n'), 'newline')
  throws(() => externalLaunchArgs('https://x/\u007f'), 'DEL')
  throws(() => externalLaunchArgs('ftp://x/'), 'ftp scheme')
  throws(() => externalLaunchArgs('file:///c:/windows/win.ini'), 'file scheme')
  throws(() => externalLaunchArgs('javascript:alert(1)'), 'javascript scheme')
  throws(() => externalLaunchArgs(''), 'empty')
})

check('T1 externalLaunchArgs accepts legit URL characters', () => {
  for (const url of [
    'https://www.youtube.com/watch?v=X&t=30',
    'https://x/#frag?q=a%20b+c&d=e',
    'http://127.0.0.1:8080/v1?k=1&j=2',
  ]) {
    eq(externalLaunchArgs(url).args[1], url, url)
  }
})

check('T1 local html paths with & still work, junk is rejected', () => {
  const file = 'C:\\My Projects\\a&calc.exe&b.html'
  const spec = localHtmlLaunchArgs(file)
  eq(spec.command, 'rundll32.exe', 'windows launcher')
  eq(spec.args[1], file, 'path is one unmodified argument')
  throws(() => localHtmlLaunchArgs('C:\\x\\a.html"'), 'quote in path')
  throws(() => localHtmlLaunchArgs('C:\\x\\a.html\n'), 'newline in path')
  throws(() => localHtmlLaunchArgs('C:\\x\\a.txt'), 'not an html file')
})

await checkAsync('T1 shells.ts no longer launches anything through a shell', async () => {
  const src = await readFile(new URL('./shells.ts', import.meta.url), 'utf8')
  ok(!src.includes("spawn('cmd.exe'"), 'no spawn(cmd.exe) left')
  ok(!src.includes("'/c', 'start'"), 'no cmd /c start left')
  includes(src, "'rundll32.exe'", 'rundll32 launcher present')
})

// ---------------------------------------------------------------- T2 gitCheckout

check('T2 assertBranchName rejects options and metacharacters', () => {
  for (const bad of ['-f', '--force', '..', 'a b', 'a~1', '@{0}', 'a^b', 'a:b', 'a?b', 'a*b', 'a[b', 'a\\b', 'a"b', "a'b", '']) {
    throws(() => assertBranchName(bad), `branch ${JSON.stringify(bad)}`)
  }
  eq(assertBranchName('feature/x-1'), 'feature/x-1', 'normal name')
  eq(assertBranchName('release-2.1'), 'release-2.1', 'dotted name')
  eq(assertBranchName('  main  '), 'main', 'trimmed')
})

async function gitRepoCheck() {
  const git = (args, cwd) =>
    spawnSync(
      'git',
      ['-c', 'user.email=selftest@example.invalid', '-c', 'user.name=selftest', ...args],
      { cwd, encoding: 'utf8', windowsHide: true },
    )
  if (git(['--version']).error) {
    console.log('skip T2 git checkout integration (git not available)')
    return
  }
  const root = await mkdtemp(join(tmpdir(), 'gbw-git-selftest-'))
  try {
    git(['init', '-b', 'main'], root)
    await writeFile(join(root, 'a.txt'), 'one\n', 'utf8')
    git(['add', '.'], root)
    git(['commit', '-m', 'init'], root)
    git(['branch', 'feature/x-1'], root)

    await gitCheckout(root, 'feature/x-1')
    eq(git(['rev-parse', '--abbrev-ref', 'HEAD'], root).stdout.trim(), 'feature/x-1', 'switched')

    // 未提交的改动不能被 `git checkout -f` 之类的选项悄悄丢掉
    await writeFile(join(root, 'a.txt'), 'dirty\n', 'utf8')
    for (const bad of ['-f', '--force', '..', 'a b', '@{0}']) {
      let threw = false
      try {
        await gitCheckout(root, bad)
      } catch {
        threw = true
      }
      ok(threw, `gitCheckout must reject ${JSON.stringify(bad)}`)
    }
    eq(await readFile(join(root, 'a.txt'), 'utf8'), 'dirty\n', 'worktree untouched')
    eq(git(['rev-parse', '--abbrev-ref', 'HEAD'], root).stdout.trim(), 'feature/x-1', 'still on branch')

    let missing = ''
    try {
      await gitCheckout(root, 'no-such-branch')
    } catch (err) {
      missing = err instanceof Error ? err.message : String(err)
    }
    includes(missing, '找不到分支', 'missing branch rejected')

    git(['checkout', '--detach', 'HEAD'], root)
    await gitCheckout(root, 'HEAD')
    eq(git(['rev-parse', '--abbrev-ref', 'HEAD'], root).stdout.trim(), 'HEAD', 'detached HEAD allowed')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

await checkAsync('T2 gitCheckout works on a real repo and blocks options', gitRepoCheck)

// ---------------------------------------------------------------- T5 toml round-trip

const SAMPLE_TOML = `# top level comment

[ui]
theme = "dark"

[model."foo"]
model = "gpt-4o"
base_url = "https://api.example.com/v1"
name = "Foo" # inline comment on a known field
api_backend = "chat_completions"
context_window = 128000
custom_flag = true # extra unrecognised key with inline comment

# a comment inside the model section
[model.foo.sampling]
temperature = 0.7
top_p = 0.9

[[model."foo".reasoning_efforts]]
value = "high"
label = "High"
default = true
`

check('T5 round-trip keeps comments, unknown keys and sub-tables', () => {
  const rows = parseConfigModels(SAMPLE_TOML)
  const out = renderConfigToml(SAMPLE_TOML, rows, groupProviders(rows))

  eq(rows.length, 1, 'parsed model count')
  eq(rows[0].catalogId, 'foo', 'catalog id')
  eq(rows[0].name, 'Foo', 'trailing comment must not leak into the value')
  eq(rows[0].model, 'gpt-4o', 'model field')

  includes(out, 'custom_flag = true # extra unrecognised key with inline comment', 'unknown key')
  includes(out, '# a comment inside the model section', 'comment in model section')
  includes(out, '# inline comment on a known field', 'inline comment on a known field')
  includes(out, '[model.foo.sampling]', 'sub-table header')
  includes(out, 'temperature = 0.7', 'sub-table key')
  includes(out, 'top_p = 0.9', 'sub-table key')
  includes(out, 'theme = "dark"', 'non-model section')
  includes(out, 'value = "high"', 'effort row')
})

check('T5 round-trip is stable on a second pass', () => {
  const rows1 = parseConfigModels(SAMPLE_TOML)
  const out1 = renderConfigToml(SAMPLE_TOML, rows1, groupProviders(rows1))
  const rows2 = parseConfigModels(out1)
  const out2 = renderConfigToml(out1, rows2, groupProviders(rows2))
  if (out1 !== out2) {
    throw new Error(`not idempotent:\n--- first ---\n${out1}\n--- second ---\n${out2}`)
  }
})

check('T5 multi-line string containing a model header survives', () => {
  const toml = `[model."foo"]
model = "gpt-4o"
name = "Foo"
api_backend = "chat_completions"
context_window = 128000
prompt = """
[model.not-a-header]
keep = "me"
"""
tail = 1
`
  const rows = parseConfigModels(toml)
  eq(rows.length, 1, 'only the real model section is parsed')
  const out = renderConfigToml(toml, rows, groupProviders(rows))
  includes(out, '[model.not-a-header]', 'string content kept')
  includes(out, 'keep = "me"', 'string content kept')
  includes(out, 'tail = 1', 'line after the string kept')
  includes(out, 'prompt = """', 'opening delimiter kept')
  includes(out, '"""', 'closing delimiter kept')
  // 字符串里的表头不能变成真的段，也不能被当成空值吃掉
  ok(!out.includes('[model."not-a-header"]'), 'string content is not a real section')
  includes(
    out,
    'prompt = """\n[model.not-a-header]\nkeep = "me"\n"""',
    'multi-line value kept verbatim',
  )
  eq(out.split('tail = 1').length - 1, 1, 'line kept exactly once')
})

// ---------------------------------------------------------------- T3 extraLines

check('T3 mergeProviderExtraLines ignores client-supplied extraLines', () => {
  const clientProvider = {
    id: 'evil',
    name: 'evil',
    enabled: true,
    baseUrl: 'https://api.example.com/v1',
    apiKey: 'sk-test-not-real',
    apiBackend: 'chat_completions',
    models: [
      {
        catalogId: 'foo',
        model: 'gpt-4o',
        name: 'Foo',
        contextWindow: 128000,
        efforts: ['high'],
        extraLines: ['base_url = "http://attacker/"', '[model.evil]'],
      },
    ],
  }
  const onDisk = parseConfigModels(SAMPLE_TOML)
  const merged = mergeProviderExtraLines(clientProvider, onDisk)
  eq(merged[0].extraLines.length, onDisk[0].extraLines.length, 'on-disk extraLines win')
  ok(!merged[0].extraLines.some((l) => l.includes('attacker')), 'client injection dropped')
  includes(merged[0].extraLines.join('\n'), 'custom_flag = true', 'on-disk extra key kept')

  const fresh = mergeProviderExtraLines(
    { ...clientProvider, models: [{ ...clientProvider.models[0], catalogId: 'brand-new' }] },
    onDisk,
  )
  eq(fresh[0].extraLines.length, 0, 'new model gets no extraLines')
})

check('T3 parseProviderBody drops extraLines from the request', () => {
  const parsed = parseProviderBody({
    provider: {
      id: 'evil',
      name: 'Evil',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test-not-real',
      apiBackend: 'chat_completions',
      enabled: true,
      models: [
        {
          catalogId: 'evil-model',
          model: 'gpt-4o',
          name: 'Evil',
          contextWindow: 128000,
          efforts: ['high'],
          extraLines: ['base_url = "http://attacker/"', '[model.evil]'],
        },
      ],
    },
  })
  eq(parsed.models.length, 1, 'model count')
  eq(parsed.models[0].extraLines.length, 0, 'extraLines ignored')
})

// ---------------------------------------------------------------- T7 url validation

check('T7 assertHttpUrl restricts scheme and host', () => {
  eq(assertHttpUrl('https://api.example.com/v1').hostname, 'api.example.com', 'https host')
  eq(assertHttpUrl('http://127.0.0.1:8080/v1').hostname, '127.0.0.1', 'http host')
  throws(() => assertHttpUrl('file:///c:/windows/win.ini'), 'file scheme')
  throws(() => assertHttpUrl('ftp://example.com/'), 'ftp scheme')
  throws(() => assertHttpUrl('not a url'), 'unparseable')
  throws(() => assertHttpUrl('http://'), 'missing host')
  throws(() => assertHttpUrl(''), 'empty')
})

// ---------------------------------------------------------------- T3+T4 end to end

async function endToEnd() {
  const root = await mkdtemp(join(tmpdir(), 'gbw-selftest-'))
  const configFile = join(root, 'config.toml')
  process.env.GROK_HOME = root
  try {
    await writeFile(configFile, SAMPLE_TOML, 'utf8')

    const injection = parseProviderBody({
      provider: {
        id: 'evil',
        name: 'Evil',
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test-not-real',
        apiBackend: 'chat_completions',
        enabled: true,
        models: [
          {
            catalogId: 'evil-model',
            model: 'gpt-4o',
            name: 'Evil',
            contextWindow: 128000,
            efforts: ['high'],
            extraLines: ['base_url = "http://attacker/"', '[model.evil]'],
          },
        ],
      },
    })

    const provider = (id, modelId) => ({
      id,
      name: id.toUpperCase(),
      enabled: true,
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test-not-real',
      apiBackend: 'chat_completions',
      models: [
        {
          catalogId: modelId,
          model: modelId,
          name: modelId,
          contextWindow: 128000,
          efforts: ['high'],
          extraLines: [],
        },
      ],
    })

    // 两次并发保存：串行化之后两边都要在文件里，且注入的 extraLines 不能落盘。
    await Promise.all([
      saveProvider(injection),
      saveProvider(provider('pa', 'pa-model')),
      saveProvider(provider('pb', 'pb-model')),
    ])

    const written = await readFile(configFile, 'utf8')
    ok(!written.includes('attacker'), 'injected base_url must not reach config.toml')
    includes(written, 'evil-model', 'first concurrent save kept')
    includes(written, 'pa-model', 'second concurrent save kept')
    includes(written, 'pb-model', 'third concurrent save kept')
    includes(written, 'custom_flag = true', 'pre-existing keys kept')
    includes(written, '[model.foo.sampling]', 'pre-existing sub-table kept')
    includes(written, 'theme = "dark"', 'pre-existing non-model section kept')

    const leftovers = (await readdir(root)).filter((f) => f.endsWith('.tmp'))
    eq(leftovers.length, 0, `temp files left behind: ${leftovers.join(',')}`)

    // 解析回去也不能丢
    const reparsed = parseConfigModels(written)
    eq(reparsed.length, 4, 'all models still parse')
  } finally {
    delete process.env.GROK_HOME
    await rm(root, { recursive: true, force: true })
  }
}

await checkAsync('T3+T4 concurrent saves are serialized and atomic', endToEnd)

console.log(`\n${passed} passed, ${failures.length} failed`)
if (failures.length) {
  console.log(`failed: ${failures.join(' | ')}`)
  process.exit(1)
}
