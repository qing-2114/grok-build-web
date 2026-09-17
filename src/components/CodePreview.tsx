import { useMemo } from 'react'
import { highlightLines } from '../lib/highlight'

export function CodePreview({
  code,
  language,
  truncated,
}: {
  code: string
  language?: string
  truncated?: boolean
}) {
  const lines = useMemo(
    () => highlightLines(code, language || 'plaintext'),
    [code, language],
  )
  const width = String(Math.max(lines.length, 1)).length

  return (
    <div className="code-preview">
      <table>
        <tbody>
          {lines.map((tokens, i) => (
            <tr key={i}>
              <td className="code-ln" style={{ minWidth: `${width + 2}ch` }}>
                {i + 1}
              </td>
              <td className="code-src">
                {tokens.length
                  ? tokens.map((tok, j) => (
                      <span key={j} className={`tok-${tok.type}`}>
                        {tok.text}
                      </span>
                    ))
                  : '\u00a0'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {truncated ? (
        <p className="file-preview-hint">文件较大，只显示前面一部分。</p>
      ) : null}
    </div>
  )
}
