type QueuedSession = { id: string; running: boolean; remote: boolean }

/** Cancel the current turn, then wait for its stream cleanup before sending again. */
export async function prepareQueuedSend(
  read: () => QueuedSession | null,
  cancel: (sessionId: string) => Promise<void>,
  timing = {
    now: () => Date.now(),
    sleep: () => new Promise<void>((resolve) => setTimeout(resolve, 50)),
    timeout: 15_000,
  },
): Promise<string | null> {
  const start = timing.now()
  let cancelledId: string | null = null
  while (true) {
    const session = read()
    if (!session) return null
    if (!session.running) return session.id
    // A draft may still be creating its ACP session. Re-read its remapped ID.
    if (session.remote && cancelledId !== session.id) {
      cancelledId = session.id
      await cancel(session.id)
    }
    if (timing.now() - start >= timing.timeout) {
      throw new Error('暂停尚未完成，消息仍在等候列表，请稍后重试')
    }
    await timing.sleep()
  }
}
