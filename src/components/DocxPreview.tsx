import { useEffect, useRef, useState } from 'react'
import { rawFileUrl } from '../lib/fs'

export function DocxPreview({ cwd, path, name }: { cwd: string; path: string; name: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const root = host.current
    if (!root) return
    const controller = new AbortController()
    const surface = document.createElement('div')
    setError('')
    root.replaceChildren()
    void (async () => {
      try {
        const response = await fetch(rawFileUrl(cwd, path), { signal: controller.signal })
        if (!response.ok) throw new Error('无法读取 Word 文档')
        const blob = await response.blob()
        if (blob.size > 20 * 1024 * 1024) throw new Error('Word 文件太大，无法预览')
        const { renderAsync } = await import('docx-preview')
        if (controller.signal.aborted) return
        await renderAsync(blob, surface, undefined, {
          className: 'docx-document',
          inWrapper: true,
          breakPages: true,
          ignoreWidth: false,
          ignoreHeight: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
        })
        if (!controller.signal.aborted) root.replaceChildren(surface)
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : '无法预览 Word 文档')
        }
      }
    })()
    return () => controller.abort()
  }, [cwd, path])

  return <div className="file-preview-body docx-preview" aria-label={`${name} Word 文档预览`}>
    {error ? <p className="file-preview-hint">{error}。复杂版式可能与 Microsoft Word 的分页和字体效果不同。</p> : null}
    <div ref={host} />
    {!error ? <p className="file-preview-hint">此预览尽量保留文档样式；分页、字体替代和部分高级版式可能与 Microsoft Word 不同。</p> : null}
  </div>
}
