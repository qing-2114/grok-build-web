export type TokenType =
  | 'plain'
  | 'kw'
  | 'str'
  | 'cmt'
  | 'num'
  | 'fn'
  | 'type'
  | 'builtin'
  | 'op'
  | 'punct'

export type Token = { type: TokenType; text: string }

type Lang = {
  lineComment?: string
  blockComment?: [string, string]
  strings: string[]
  triple?: string[]
  keywords: Set<string>
  builtins?: Set<string>
  hexNums?: boolean
}

const JS_KW = set(
  'async await break case catch class const continue debugger default delete do else export extends false finally for from function get if import in instanceof let new null of return set static super switch this throw true try typeof var void while with yield as type interface enum implements package public private protected constructor abstract readonly satisfies keyof infer never unknown any unique',
)
const PY_KW = set(
  'and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield match case',
)
const PY_BI = set(
  'Exception True False None self cls int str float bool list dict tuple set bytes object type super len range print open enumerate zip map filter Exception Error ValueError TypeError KeyError IndexError RuntimeError StopIteration',
)
const RS_KW = set(
  'as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait true type unsafe use where while',
)
const GO_KW = set(
  'break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var true false nil iota',
)
const JAVA_KW = set(
  'abstract assert boolean break byte case catch char class const continue default do double else enum extends final finally float for goto if implements import instanceof int interface long native new package private protected public return short static strictfp super switch synchronized this throw throws transient try void volatile while true false null',
)
const C_KW = set(
  'auto break case char const continue default do double else enum extern float for goto if inline int long register restrict return short signed sizeof static struct switch typedef union unsigned void volatile while true false NULL',
)
const CS_KW = set(
  'abstract as base bool break byte case catch char checked class const continue decimal default delegate do double else enum event explicit extern false finally fixed float for foreach goto if implicit in int interface internal is lock long namespace new null object operator out override params private protected public readonly ref return sbyte sealed short sizeof stackalloc static string struct switch this throw true try typeof uint ulong unchecked unsafe ushort using virtual void volatile while var await async',
)
const SQL_KW = set(
  'select from where insert into values update set delete join left right inner outer on group by order asc desc and or not null as create table alter drop index primary key foreign unique limit offset having distinct union all case when then else end',
)
const SH_KW = set(
  'if then else elif fi for while do done case esac in function return break continue true false then fi',
)
const PS_KW = set(
  'begin break catch class continue data do dynamicparam else elseif end exit filter finally for foreach from function if in param process return switch throw trap try until using while function param',
)

function set(s: string): Set<string> {
  return new Set(s.split(/\s+/).filter(Boolean))
}

const LANGS: Record<string, Lang> = {
  js: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
    strings: ["'", '"', '`'],
    keywords: JS_KW,
    builtins: set('undefined NaN Infinity console document window Array Object String Number Boolean Map Set Promise Date Math JSON Error'),
  },
  ts: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
    strings: ["'", '"', '`'],
    keywords: JS_KW,
    builtins: set('undefined Array Object String Number Boolean Map Set Promise Date Math JSON Error Record Partial Required'),
  },
  jsx: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
    strings: ["'", '"', '`'],
    keywords: JS_KW,
  },
  tsx: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
    strings: ["'", '"', '`'],
    keywords: JS_KW,
  },
  python: {
    lineComment: '#',
    strings: ["'", '"'],
    triple: ['"""', "'''"],
    keywords: PY_KW,
    builtins: PY_BI,
  },
  rust: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
    strings: ['"'],
    keywords: RS_KW,
  },
  go: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
    strings: ['"', '`'],
    keywords: GO_KW,
  },
  java: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
    strings: ['"'],
    keywords: JAVA_KW,
  },
  kotlin: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
    strings: ['"', "'"],
    keywords: set('as break class continue do else false for fun if in interface is null object package return super this throw true try typealias typeof val var when while by catch constructor delegate dynamic field file finally get import init param property receiver set where actual abstract annotation companion const crossinline data enum expect external infix inline inner internal lateinit noinline open operator out override private protected public reified sealed suspend tailrec vararg'),
  },
  c: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
    strings: ['"'],
    keywords: C_KW,
    hexNums: true,
  },
  cpp: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
    strings: ['"'],
    keywords: new Set([...C_KW, 'class', 'namespace', 'template', 'typename', 'public', 'private', 'protected', 'virtual', 'override', 'new', 'delete', 'this', 'using', 'true', 'false']),
  },
  csharp: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
    strings: ['"'],
    keywords: CS_KW,
  },
  sql: {
    lineComment: '--',
    blockComment: ['/*', '*/'],
    strings: ["'", '"'],
    keywords: SQL_KW,
  },
  bash: {
    lineComment: '#',
    strings: ["'", '"'],
    keywords: SH_KW,
  },
  powershell: {
    lineComment: '#',
    blockComment: ['<#', '#>'],
    strings: ["'", '"'],
    keywords: PS_KW,
  },
  php: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
    strings: ["'", '"'],
    keywords: set('echo function class public private protected static return if else elseif foreach for while do switch case break continue try catch finally new instanceof array true false null namespace use as'),
  },
  ruby: {
    lineComment: '#',
    strings: ["'", '"'],
    keywords: set('def class module if unless else elsif end do while until for in begin rescue ensure return yield self super true false nil and or not next break redo retry alias undef case when then'),
  },
  swift: {
    lineComment: '//',
    blockComment: ['/*', '*/'],
    strings: ['"'],
    keywords: set('as associatedtype break case catch class continue default defer deinit do else enum extension fallthrough false fileprivate func guard if import in init inout internal is let nil open operator private protocol public repeat rethrows return self static struct subscript super switch throw throws true try typealias var where while'),
  },
  css: { lineComment: '', blockComment: ['/*', '*/'], strings: ["'", '"'], keywords: set('important from to') },
  json: { strings: ['"'], keywords: set('true false null') },
  yaml: { lineComment: '#', strings: ["'", '"'], keywords: set('true false null yes no on off') },
  toml: { lineComment: '#', strings: ["'", '"'], keywords: set('true false') },
  html: { strings: ["'", '"'], keywords: new Set() },
  xml: { strings: ["'", '"'], keywords: new Set() },
  plaintext: { strings: [], keywords: new Set() },
}

function langOf(id: string): Lang {
  if (id === 'javascript') return LANGS.js
  if (id === 'typescript') return LANGS.ts
  return LANGS[id] ?? LANGS.plaintext
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_$@]/.test(ch)
}

function isIdent(ch: string): boolean {
  return /[A-Za-z0-9_$@]/.test(ch)
}

function push(out: Token[], type: TokenType, text: string): void {
  if (!text) return
  const last = out[out.length - 1]
  if (last && last.type === type) last.text += text
  else out.push({ type, text })
}

function tokenize(source: string, langId: string): Token[] {
  if (langId === 'html' || langId === 'xml') return tokenizeMarkup(source)
  if (langId === 'css') return tokenizeCss(source)
  const lang = langOf(langId)
  const out: Token[] = []
  let i = 0
  const n = source.length
  let prevNonWs = ''

  while (i < n) {
    const rest = source.slice(i)
    const ch = source[i]

    if (lang.triple) {
      let hit = false
      for (const t of lang.triple) {
        if (rest.startsWith(t)) {
          const end = source.indexOf(t, i + t.length)
          const close = end >= 0 ? end + t.length : n
          push(out, 'str', source.slice(i, close))
          i = close
          hit = true
          break
        }
      }
      if (hit) continue
    }

    if (lang.blockComment && rest.startsWith(lang.blockComment[0])) {
      const open = lang.blockComment[0]
      const closeTok = lang.blockComment[1]
      const end = source.indexOf(closeTok, i + open.length)
      const close = end >= 0 ? end + closeTok.length : n
      push(out, 'cmt', source.slice(i, close))
      i = close
      continue
    }

    if (lang.lineComment && rest.startsWith(lang.lineComment)) {
      const nl = source.indexOf('\n', i)
      const close = nl >= 0 ? nl : n
      push(out, 'cmt', source.slice(i, close))
      i = close
      continue
    }

    let strHit = ''
    for (const q of lang.strings) {
      if (ch === q) {
        strHit = q
        break
      }
    }
    if (strHit) {
      let j = i + 1
      while (j < n) {
        if (source[j] === '\\') {
          j += 2
          continue
        }
        if (source[j] === strHit) {
          j += 1
          break
        }
        if (strHit !== '`' && source[j] === '\n') break
        j += 1
      }
      push(out, 'str', source.slice(i, j))
      i = j
      continue
    }

    if (ch === '.' && /[0-9]/.test(source[i + 1] ?? '')) {
      let j = i + 1
      while (j < n && /[0-9]/.test(source[j])) j += 1
      push(out, 'num', source.slice(i, j))
      i = j
      prevNonWs = '0'
      continue
    }

    if (/[0-9]/.test(ch)) {
      let j = i + 1
      if (ch === '0' && lang.hexNums && (source[j] === 'x' || source[j] === 'X')) {
        j += 1
        while (j < n && /[0-9a-fA-F]/.test(source[j])) j += 1
      } else {
        while (j < n && /[0-9_]/.test(source[j])) j += 1
        if (source[j] === '.' && /[0-9]/.test(source[j + 1] ?? '')) {
          j += 1
          while (j < n && /[0-9_]/.test(source[j])) j += 1
        }
      }
      push(out, 'num', source.slice(i, j))
      i = j
      prevNonWs = '0'
      continue
    }

    if (isIdentStart(ch)) {
      let j = i + 1
      while (j < n && isIdent(source[j])) j += 1
      const word = source.slice(i, j)
      let k = j
      while (k < n && /[ \t]/.test(source[k])) k += 1
      const next = source[k] ?? ''
      if (lang.keywords.has(word)) push(out, 'kw', word)
      else if (lang.builtins?.has(word)) push(out, 'builtin', word)
      else if (next === '(') push(out, 'fn', word)
      else if (
        prevNonWs === 'class' ||
        prevNonWs === 'interface' ||
        prevNonWs === 'struct' ||
        prevNonWs === 'enum' ||
        prevNonWs === 'type'
      ) {
        push(out, 'type', word)
      } else if (
        prevNonWs === 'def' ||
        prevNonWs === 'fn' ||
        prevNonWs === 'function' ||
        prevNonWs === 'func'
      ) {
        push(out, 'fn', word)
      } else if (/^[A-Z][A-Za-z0-9_]+$/.test(word)) push(out, 'type', word)
      else push(out, 'plain', word)
      i = j
      prevNonWs = word
      continue
    }

    if ('+-*/%=<>!&|^~?:'.includes(ch)) {
      let j = i + 1
      while (j < n && '+-*/%=<>!&|^~?:'.includes(source[j])) j += 1
      push(out, 'op', source.slice(i, j))
      i = j
      prevNonWs = source[j - 1] ?? ''
      continue
    }

    if ('()[]{},.;'.includes(ch)) {
      push(out, 'punct', ch)
      i += 1
      prevNonWs = ch
      continue
    }

    push(out, 'plain', ch)
    if (!/\s/.test(ch)) prevNonWs = ch
    i += 1
  }
  return out
}

function tokenizeMarkup(source: string): Token[] {
  const out: Token[] = []
  let i = 0
  const n = source.length
  while (i < n) {
    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4)
      const close = end >= 0 ? end + 3 : n
      push(out, 'cmt', source.slice(i, close))
      i = close
      continue
    }
    if (source[i] === '<') {
      const end = source.indexOf('>', i)
      const close = end >= 0 ? end + 1 : n
      const tag = source.slice(i, close)
      highlightTag(out, tag)
      i = close
      continue
    }
    let j = i + 1
    while (j < n && source[j] !== '<' ) j += 1
    push(out, 'plain', source.slice(i, j))
    i = j
  }
  return out
}

function highlightTag(out: Token[], tag: string): void {
  const m = tag.match(/^<\/?([A-Za-z][\w:-]*)/)
  if (!m) {
    push(out, 'punct', tag)
    return
  }
  const prefix = tag.slice(0, m.index! + (tag.startsWith('</') ? 2 : 1))
  push(out, 'punct', prefix)
  push(out, 'kw', m[1])
  let i = prefix.length + m[1].length
  while (i < tag.length) {
    const ch = tag[i]
    if (ch === '"' || ch === "'") {
      let j = i + 1
      while (j < tag.length && tag[j] !== ch) j += 1
      push(out, 'str', tag.slice(i, Math.min(tag.length, j + 1)))
      i = j + 1
      continue
    }
    if (isIdentStart(ch)) {
      let j = i + 1
      while (j < tag.length && /[\w:-]/.test(tag[j])) j += 1
      push(out, 'fn', tag.slice(i, j))
      i = j
      continue
    }
    push(out, 'punct', ch)
    i += 1
  }
}

function tokenizeCss(source: string): Token[] {
  const out: Token[] = []
  let i = 0
  const n = source.length
  while (i < n) {
    if (source.startsWith('/*', i)) {
      const end = source.indexOf('*/', i + 2)
      const close = end >= 0 ? end + 2 : n
      push(out, 'cmt', source.slice(i, close))
      i = close
      continue
    }
    const ch = source[i]
    if (ch === '"' || ch === "'") {
      let j = i + 1
      while (j < n && source[j] !== ch) {
        if (source[j] === '\\') j += 2
        else j += 1
      }
      push(out, 'str', source.slice(i, Math.min(n, j + 1)))
      i = j + 1
      continue
    }
    if (ch === '#') {
      let j = i + 1
      while (j < n && /[0-9A-Fa-f]/.test(source[j])) j += 1
      if (j > i + 2) {
        push(out, 'num', source.slice(i, j))
        i = j
        continue
      }
    }
    if (isIdentStart(ch) || ch === '-') {
      let j = i + 1
      while (j < n && /[A-Za-z0-9_-]/.test(source[j])) j += 1
      const word = source.slice(i, j)
      let k = j
      while (k < n && /\s/.test(source[k])) k += 1
      if (source[k] === '(') push(out, 'fn', word)
      else if (source[k] === ':') push(out, 'kw', word)
      else push(out, 'plain', word)
      i = j
      continue
    }
    if (/[0-9]/.test(ch)) {
      let j = i + 1
      while (j < n && /[0-9.%]/.test(source[j])) j += 1
      push(out, 'num', source.slice(i, j))
      i = j
      continue
    }
    push(out, 'plain', ch)
    i += 1
  }
  return out
}

export function highlightLines(code: string, language: string): Token[][] {
  const lang = language || 'plaintext'
  const known =
    lang !== 'plaintext' &&
    (Boolean(LANGS[lang]) || lang === 'javascript' || lang === 'typescript')
  const tokens = known ? tokenize(code, lang) : tokenizePlain(code)
  const lines: Token[][] = [[]]
  for (const tok of tokens) {
    const parts = tok.text.split('\n')
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) lines.push([])
      if (parts[i].length) lines[lines.length - 1].push({ type: tok.type, text: parts[i] })
    }
  }
  if (code.endsWith('\n') && lines[lines.length - 1].length === 0) {
    // keep trailing empty line
  } else if (lines.length > 1 && lines[lines.length - 1].length === 0 && !code.endsWith('\n')) {
    lines.pop()
  }
  return lines
}

function tokenizePlain(code: string): Token[] {
  return code ? [{ type: 'plain', text: code }] : []
}
