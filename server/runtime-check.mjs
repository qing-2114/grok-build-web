// Runtime verification against the live dev server on 127.0.0.1:5173
// Run `npm run dev` first, then: node server/runtime-check.mjs
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = 'http://127.0.0.1:5173'
// 用本文件所在位置推导仓库根目录，避免把某台机器的绝对路径写死进来。
const REPO = dirname(dirname(fileURLToPath(import.meta.url)))
let pass = 0
let fail = 0

const check = (name, ok, detail) => {
  if (ok) {
    pass++
    console.log(`ok   ${name}`)
  } else {
    fail++
    console.log(`FAIL ${name} :: ${detail}`)
  }
}

async function req(path, opts = {}) {
  const res = await fetch(BASE + path, opts)
  let body = ''
  try {
    body = await res.text()
  } catch {
    body = '<unreadable>'
  }
  return { status: res.status, body }
}

const json = (obj) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(obj),
})

// --- SEC-01: host / origin / content-type guard -------------------------
{
  const r = await req('/api/status')
  check('same-origin-ish GET /api/status -> 200', r.status === 200, `got ${r.status} ${r.body.slice(0, 120)}`)
}
// NOTE: the Host header cannot be set via fetch (forbidden header name, undici strips it).
// That check is done with curl.exe separately in the shell.
{
  const r = await req('/api/status', { headers: { Origin: 'http://localhost:9999' } })
  check('foreign localhost Origin -> 403', r.status === 403, `got ${r.status} ${r.body.slice(0, 120)}`)
}
{
  const r = await req('/api/status', { headers: { Origin: 'null' } })
  check('Origin: null -> 403', r.status === 403, `got ${r.status} ${r.body.slice(0, 120)}`)
}
{
  const r = await req('/api/status', { headers: { Origin: 'http://127.0.0.1:5173' } })
  check('same-origin Origin -> 200', r.status === 200, `got ${r.status} ${r.body.slice(0, 120)}`)
}
{
  const r = await req('/api/open-external', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ url: 'https://example.com/' }),
  })
  check('text/plain body on POST -> 415', r.status === 415, `got ${r.status} ${r.body.slice(0, 120)}`)
}

// --- SEC-05: session id traversal ---------------------------------------
{
  const r = await req('/api/sessions/..%5C..%5C..%5CWindows/context')
  check('traversal session id -> 400', r.status === 400, `got ${r.status} ${r.body.slice(0, 120)}`)
}
{
  const r = await req('/api/sessions/..%2F..%2F..%2Fetc/title?cwd=x')
  check('posix traversal session id -> 400', r.status === 400, `got ${r.status} ${r.body.slice(0, 120)}`)
}

// --- SEC-02: launcher validation is wired into the HTTP path -------------
{
  const r = await req('/api/open-external', json({ url: 'file:///C:/Windows/System32/calc.exe' }))
  check('non-http scheme -> 400', r.status === 400, `got ${r.status} ${r.body.slice(0, 120)}`)
}
{
  const r = await req('/api/open-external', json({ url: 'https://x/"&calc&"' }))
  check('quote in URL -> 400', r.status === 400, `got ${r.status} ${r.body.slice(0, 120)}`)
}
{
  const r = await req('/api/open-external', json({ url: 'https://x/\u0000\n' }))
  check('control chars in URL -> 400', r.status === 400, `got ${r.status} ${r.body.slice(0, 120)}`)
}

// --- SEC-07: oversized preview is refused, small files still work --------
{
  const r = await req(
    '/api/fs/file?cwd=C%3A%5C&path=' + encodeURIComponent(join(REPO, 'package.json')),
  )
  const parsed = JSON.parse(r.body)
  check('normal text file still previews', r.status === 200 && typeof parsed.text === 'string' && parsed.text.length > 0, `kind=${parsed.kind} status=${r.status}`)
}

// --- SEC-03: git checkout option injection -------------------------------
{
  const before = await req('/api/git?path=' + encodeURIComponent(REPO))
  const beforeBranch = JSON.parse(before.body).branch
  const r = await req('/api/git/checkout', json({ path: REPO, branch: '-f' }))
  check('branch "-f" -> 400', r.status === 400, `got ${r.status} ${r.body.slice(0, 160)}`)
  const after = await req('/api/git?path=' + encodeURIComponent(REPO))
  const afterBranch = JSON.parse(after.body).branch
  check('branch unchanged after -f attempt', beforeBranch === afterBranch, `${beforeBranch} -> ${afterBranch}`)
}
{
  const r = await req('/api/git/checkout', json({ path: REPO, branch: '--force' }))
  check('branch "--force" -> 400', r.status === 400, `got ${r.status} ${r.body.slice(0, 160)}`)
}
{
  const r = await req('/api/git/checkout', json({ path: REPO, branch: 'no-such-branch-xyz' }))
  check('unknown branch -> 400', r.status === 400, `got ${r.status} ${r.body.slice(0, 160)}`)
}

// --- SEC-06: permission validation --------------------------------------
{
  const r = await req('/api/permission', json({ requestId: 'not-a-number', optionId: 'allow_once' }))
  check('bad requestId -> 400', r.status === 400, `got ${r.status} ${r.body.slice(0, 160)}`)
}
{
  const r = await req('/api/permission', json({ requestId: 999999, optionId: 'allow_once' }))
  const parsed = r.status === 200 ? JSON.parse(r.body) : null
  check(
    'unknown requestId approves nothing',
    r.status !== 200 || parsed?.ok === false,
    `got ${r.status} ${r.body.slice(0, 160)}`,
  )
}

// --- BUG-05: terminal lifecycle ----------------------------------------
{
  const created = await req('/api/terminal', json({ cwd: REPO, shellId: '' }))
  const parsed = JSON.parse(created.body)
  check('terminal created', created.status === 200 && typeof parsed.id === 'string', created.body.slice(0, 160))
  if (parsed.id) {
    const killed = await req('/api/terminal/' + encodeURIComponent(parsed.id), { method: 'DELETE' })
    check('terminal killed -> 200', killed.status === 200, `got ${killed.status} ${killed.body.slice(0, 160)}`)
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
