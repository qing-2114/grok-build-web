/**
 * 已完成的一轮里，最后一段助手回复之前若还有过程（更早的回复或工具），
 * 返回这段最终回复的下标，供界面默认折叠。没有过程则返回 null。
 */
export function foldBefore(
  messages: { role: string }[],
  start: number,
  end: number,
): number | null {
  let lastAssistant = -1
  for (let i = start; i < end; i++) {
    if (messages[i].role === 'assistant') lastAssistant = i
  }
  if (lastAssistant <= start) return null
  return lastAssistant
}
