import { inflateRawSync } from 'node:zlib'

const LOCAL = 0x04034b50
const CENTRAL = 0x02014b50
const EOCD = 0x06054b50

function findEocd(buf: Buffer): number {
  const start = Math.max(0, buf.length - 22 - 65535)
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === EOCD) return i
  }
  return -1
}

function inflate(data: Buffer, method: number): Buffer | null {
  if (method === 0) return Buffer.from(data)
  if (method === 8) {
    try {
      return inflateRawSync(data)
    } catch {
      return null
    }
  }
  return null
}

function readLocal(
  buf: Buffer,
  off: number,
  method: number,
  compSize: number,
): Buffer | null {
  if (off < 0 || off + 30 > buf.length) return null
  if (buf.readUInt32LE(off) !== LOCAL) return null
  const nameLen = buf.readUInt16LE(off + 26)
  const extraLen = buf.readUInt16LE(off + 28)
  const start = off + 30 + nameLen + extraLen
  if (start + compSize > buf.length) return null
  return inflate(buf.subarray(start, start + compSize), method)
}

export function zipEntry(buf: Buffer, want: string): Buffer | null {
  const wantN = want.replace(/\\/g, '/')
  const eocd = findEocd(buf)
  if (eocd >= 0) {
    const dirOff = buf.readUInt32LE(eocd + 16)
    const entries = buf.readUInt16LE(eocd + 10)
    let p = dirOff
    for (let n = 0; n < entries && p + 46 <= buf.length; n++) {
      if (buf.readUInt32LE(p) !== CENTRAL) break
      const method = buf.readUInt16LE(p + 10)
      const compSize = buf.readUInt32LE(p + 20)
      const nameLen = buf.readUInt16LE(p + 28)
      const extraLen = buf.readUInt16LE(p + 30)
      const commentLen = buf.readUInt16LE(p + 32)
      const localOff = buf.readUInt32LE(p + 42)
      const name = buf
        .subarray(p + 46, p + 46 + nameLen)
        .toString('utf8')
        .replace(/\\/g, '/')
      if (name === wantN) return readLocal(buf, localOff, method, compSize)
      p += 46 + nameLen + extraLen + commentLen
    }
  }
  return null
}
