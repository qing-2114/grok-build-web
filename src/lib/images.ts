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
