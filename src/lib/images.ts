import type { ChatImage } from '../types'
import { isImageFile } from './attach'

export { isImageFile }

export function stripImageTokens(text: string): string {
  return text.replace(/\[Image #\d+\]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

export async function filesToChatImages(files: File[]): Promise<ChatImage[]> {
  const images = files.filter(isImageFile)
  const out: ChatImage[] = []
  for (let i = 0; i < images.length; i++) {
    const file = images[i]
    out.push({
      n: i + 1,
      name: file.name,
      mime: file.type || 'image/png',
      src: await fileToDataUrl(file),
    })
  }
  return out
}

/** 重试 / 编辑重发时把已发出的图片（data URL）还原成 File。 */
export async function chatImagesToFiles(images: ChatImage[] | undefined): Promise<File[]> {
  if (!images?.length) return []
  return Promise.all(
    images.map(async (img) => {
      const blob = await (await fetch(img.src)).blob()
      return new File([blob], img.name || `image-${img.n}.png`, {
        type: img.mime || blob.type,
      })
    }),
  )
}
