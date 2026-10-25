// 假的 grok agent stdio，给 tests/acp-connect.test.ts 用。
// argv[2]：slow = 隔 600ms 才回 initialize；exit = 收到 initialize 就退出；其它 = 立刻回。
const mode = process.argv[2] || 'ok'
let buf = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (chunk) => {
  buf += chunk
  let nl = buf.indexOf('\n')
  while (nl >= 0) {
    const line = buf.slice(0, nl)
    buf = buf.slice(nl + 1)
    nl = buf.indexOf('\n')
    if (!line.trim()) continue
    const msg = JSON.parse(line)
    if (msg.method !== 'initialize') continue
    if (mode === 'exit') {
      process.stderr.write('fake agent: login required\n')
      process.exit(3)
    }
    const reply = () =>
      process.stdout.write(
        JSON.stringify({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            protocolVersion: 1,
            _meta: {
              agentVersion: '9.9.9',
              modelState: {
                currentModelId: 'm1',
                availableModels: [{ modelId: 'm1', name: 'Model 1' }],
              },
            },
          },
        }) + '\n',
      )
    if (mode === 'slow') setTimeout(reply, 600)
    else reply()
  }
})
