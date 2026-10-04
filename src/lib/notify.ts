// 浏览器系统通知 + 标签页标题角标。只在页面不在前台、或者事情发生在
// 别的会话里时才提醒，正在看的会话不打扰。

const BASE_TITLE = 'Grok Build'

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported'
}

/** 需要在用户手势里调用（点击 / 回车发送），否则浏览器可能直接拒绝。 */
export async function requestNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

export function showNotification(
  title: string,
  body: string,
  tag: string,
  onClick: () => void,
): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  try {
    const n = new Notification(title, { body, tag, icon: '/grok-icon.png' })
    n.onclick = () => {
      window.focus()
      onClick()
      n.close()
    }
  } catch {
    // 某些环境（例如没有通知服务）构造会抛错，忽略
  }
}

export function setTitleBadge(count: number): void {
  document.title = count > 0 ? `(${count}) ${BASE_TITLE}` : BASE_TITLE
}
