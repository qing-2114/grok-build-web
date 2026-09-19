import assert from 'node:assert/strict'
import test from 'node:test'
import { assertSafeSessionId, checkApiRequest, HttpError } from './guard.ts'

function pass(name) {
  console.log(`PASS ${name}`)
}

function decide(method, host, origin, contentType, hasBody) {
  return checkApiRequest(method, host, origin, contentType, hasBody)
}

test('loopback hosts pass', () => {
  assert.deepEqual(decide('GET', '127.0.0.1:5173'), { ok: true })
  assert.deepEqual(decide('GET', 'localhost:5173'), { ok: true })
  assert.deepEqual(decide('GET', 'LOCALHOST:5173'), { ok: true })
  assert.deepEqual(decide('GET', '[::1]:5173'), { ok: true })
  pass('loopback hosts pass')
})

test('missing host rejected', () => {
  assert.equal(decide('GET', undefined).ok, false)
  assert.equal(decide('GET', undefined).status, 403)
  assert.equal(decide('GET', '').ok, false)
  pass('missing host rejected')
})

test('lan host rejected', () => {
  const d = decide('GET', '192.168.1.50:5173')
  assert.equal(d.ok, false)
  assert.equal(d.status, 403)
  assert.equal(d.error, '只允许从本机访问')
  assert.equal(decide('GET', 'evil.example.com').ok, false)
  assert.equal(decide('GET', '10.0.0.7').ok, false)
  pass('lan host rejected')
})

test('same-origin request passes', () => {
  assert.deepEqual(decide('GET', '127.0.0.1:5173', 'http://127.0.0.1:5173'), {
    ok: true,
  })
  assert.deepEqual(decide('GET', 'localhost:5173', 'http://localhost:5173'), {
    ok: true,
  })
  assert.deepEqual(
    decide('POST', '127.0.0.1:5173', 'http://127.0.0.1:5173', 'application/json', true),
    { ok: true },
  )
  pass('same-origin request passes')
})

test('cross-origin rejected', () => {
  for (const origin of [
    'http://localhost:9999',
    'http://127.0.0.1:9999',
    'https://evil.example.com',
    'null',
    'file:///C:/tmp/x.html',
    'not a url',
    '',
  ]) {
    const d = decide('GET', '127.0.0.1:5173', origin)
    assert.equal(d.ok, false, `origin ${origin} should be rejected`)
    assert.equal(d.status, 403)
  }
  pass('cross-origin rejected')
})

test('scheme must be http(s)', () => {
  const d = decide('GET', '127.0.0.1:5173', 'ftp://127.0.0.1:5173')
  assert.equal(d.ok, false)
  assert.equal(d.status, 403)
  pass('scheme must be http(s)')
})

test('bodied write needs json content-type', () => {
  const bad = decide('POST', '127.0.0.1:5173', undefined, 'text/plain', true)
  assert.equal(bad.ok, false)
  assert.equal(bad.status, 415)
  assert.equal(
    decide('POST', '127.0.0.1:5173', undefined, 'application/x-www-form-urlencoded', true).ok,
    false,
  )
  assert.equal(decide('POST', '127.0.0.1:5173', undefined, undefined, true).ok, false)
  assert.deepEqual(
    decide('POST', '127.0.0.1:5173', undefined, 'application/json; charset=utf-8', true),
    { ok: true },
  )
  assert.deepEqual(
    decide('PUT', '127.0.0.1:5173', undefined, 'APPLICATION/JSON', true),
    { ok: true },
  )
  pass('bodied write needs json content-type')
})

test('bodyless writes still pass', () => {
  assert.deepEqual(decide('POST', '127.0.0.1:5173', undefined, undefined, false), {
    ok: true,
  })
  assert.deepEqual(decide('DELETE', '127.0.0.1:5173', undefined, undefined, false), {
    ok: true,
  })
  assert.deepEqual(decide('GET', '127.0.0.1:5173', undefined, undefined, false), {
    ok: true,
  })
  pass('bodyless writes still pass')
})

test('GET with a body is not content-type checked', () => {
  assert.deepEqual(decide('GET', '127.0.0.1:5173', undefined, 'text/plain', true), {
    ok: true,
  })
  pass('GET with a body is not content-type checked')
})

test('GROK_WEB_ALLOWED_HOSTS extends the allowlist', () => {
  const before = decide('GET', 'workstation.local:5173')
  assert.equal(before.ok, false)
  process.env.GROK_WEB_ALLOWED_HOSTS = 'workstation.local, 10.1.2.3:5173'
  try {
    assert.deepEqual(decide('GET', 'workstation.local:5173'), { ok: true })
    assert.deepEqual(decide('GET', '10.1.2.3:5173'), { ok: true })
    assert.equal(decide('GET', '10.1.2.4:5173').ok, false)
  } finally {
    delete process.env.GROK_WEB_ALLOWED_HOSTS
  }
  pass('GROK_WEB_ALLOWED_HOSTS extends the allowlist')
})

test('GROK_WEB_HOST adds its host but not wildcard binds', () => {
  process.env.GROK_WEB_HOST = '192.168.1.50'
  try {
    assert.deepEqual(decide('GET', '192.168.1.50:5173'), { ok: true })
  } finally {
    delete process.env.GROK_WEB_HOST
  }
  for (const value of ['0.0.0.0', 'true', '::']) {
    process.env.GROK_WEB_HOST = value
    try {
      assert.equal(
        decide('GET', '192.168.1.50:5173').ok,
        false,
        `GROK_WEB_HOST=${value} must not widen the allowlist`,
      )
    } finally {
      delete process.env.GROK_WEB_HOST
    }
  }
  pass('GROK_WEB_HOST adds its host but not wildcard binds')
})

test('session ids must be safe', () => {
  for (const id of [
    '5f3c1a72-9b1e-4a44-8f3e-1c2d3e4f5a6b',
    'abc.DEF_123-456',
    'a',
  ]) {
    assert.equal(assertSafeSessionId(id), id)
  }
  for (const id of [
    '..\\..\\..\\Users\\me\\.ssh',
    '../../../etc/passwd',
    '..',
    'a/../b',
    'a/b',
    'a\\b',
    'a b',
    'x'.repeat(129),
    '',
    'a:b',
    'a%2Fb',
  ]) {
    assert.throws(
      () => assertSafeSessionId(id),
      (err) => err instanceof HttpError && err.status === 400,
      `id ${JSON.stringify(id)} should be rejected`,
    )
  }
  pass('session ids must be safe')
})
