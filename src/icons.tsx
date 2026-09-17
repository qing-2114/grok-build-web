import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function Svg({ children, ...props }: IconProps) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export function IconGear(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="8" r="2.1" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M8 2.4v1.6M8 12v1.6M2.4 8h1.6M12 8h1.6M4 4l1.1 1.1M10.9 10.9 12 12M12 4l-1.1 1.1M5.1 10.9 4 12"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function IconGrok(props: IconProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="currentColor"
      aria-hidden="true"
      width="24"
      height="24"
      {...props}
    >
      <path d="M33.2 6.4c-13.2 0-24 10.6-24.1 23.8 0 5.5 1.9 10.5 5.2 14.4L6 55.2l13.4-5.1c3.9 2.1 8.4 3.3 13.2 3.3 13.4 0 24.2-10.8 24.2-24.1S46.6 6.4 33.2 6.4Zm0 10.2c7.8 0 14.1 6.3 14.1 14.1S41 44.8 33.2 44.8c-3 0-5.8-.9-8.1-2.5l-1.9 4.8-2.8-6.6a14 14 0 0 1-5.4-11C15 22.9 22.6 16.6 33.2 16.6Z" />
      <path d="M12.8 9.2 21.2 4.6 57.4 47.2 48.8 51.6Z" />
    </svg>
  )
}

export function IconSpark(props: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width="18" height="18" {...props}>
      <path
        fill="currentColor"
        d="M12 1.4c.28 3.55 1.55 5.72 5.1 6.6-3.55.88-4.82 3.05-5.1 6.6-.28-3.55-1.55-5.72-5.1-6.6 3.55-.88 4.82-3.05 5.1-6.6Z"
      />
    </Svg>
  )
}

export function IconNewChat(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M3.5 4.5h9A1.5 1.5 0 0 1 14 6v4.2a1.5 1.5 0 0 1-1.5 1.5H8.2L5 14.2V11.7H3.5A1.5 1.5 0 0 1 2 10.2V6A1.5 1.5 0 0 1 3.5 4.5Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M6.2 3.2h6.3A1.5 1.5 0 0 1 14 4.7"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function IconFolderPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M2.5 4.8h3.2l1.2 1.4h6.6A1.3 1.3 0 0 1 14.8 7.5v5.2A1.3 1.3 0 0 1 13.5 14H2.5A1.3 1.3 0 0 1 1.2 12.7V6.1A1.3 1.3 0 0 1 2.5 4.8Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M8 8.4v3.6M6.2 10.2h3.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function IconFile(props: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" width="28" height="28" {...props}>
      <path
        d="M7 3.5h7.2L19 8.4V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5H7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M14 3.6V8h4.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconFolder(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M2.5 4.8h3.2l1.2 1.4h6.6A1.3 1.3 0 0 1 14.8 7.5v5.2A1.3 1.3 0 0 1 13.5 14H2.5A1.3 1.3 0 0 1 1.2 12.7V6.1A1.3 1.3 0 0 1 2.5 4.8Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconSearch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="7" cy="7" r="4.2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M10.2 10.2 13.5 13.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function IconBell(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M4.2 10.4V7.4a3.8 3.8 0 0 1 7.6 0v3l1 1.6H3.2l1-1.6Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M6.6 13.2a1.4 1.4 0 0 0 2.8 0"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function IconChevron(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M5 6.5 8 9.5 11 6.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconPlus(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M8 3.4v9.2M3.4 8h9.2"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function IconSend(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M8 12.4V4M4.2 7.6 8 3.8l3.8 3.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconStop(props: IconProps) {
  return (
    <Svg {...props}>
      <rect
        x="5"
        y="5"
        width="6"
        height="6"
        rx="1.2"
        fill="currentColor"
      />
    </Svg>
  )
}

export function IconMic(props: IconProps) {
  return (
    <Svg {...props}>
      <rect
        x="6"
        y="2.4"
        width="4"
        height="7.2"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M4.2 8.2a3.8 3.8 0 0 0 7.6 0M8 12v1.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function IconGitBranch(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="4.4" cy="4.2" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="4.4" cy="11.8" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11.6" cy="6.2" r="1.6" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M4.4 5.8v4.4M4.4 8.2s0-2 3.2-2h2.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function IconMonitor(props: IconProps) {
  return (
    <Svg {...props}>
      <rect
        x="2.2"
        y="3.2"
        width="11.6"
        height="7.6"
        rx="1.4"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M6 13.2h4M8 10.8v2.4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function IconShield(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M8 2.4 13.2 4.4v4.2c0 3.2-2.1 4.8-5.2 5.8-3.1-1-5.2-2.6-5.2-5.8V4.4L8 2.4Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconMenu(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M2.8 4.5h10.4M2.8 8h10.4M2.8 11.5h10.4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function IconCheck(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M3.6 8.2 6.6 11.2 12.4 4.8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconClose(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M4 4 12 12M12 4 4 12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function IconSidebar(props: IconProps) {
  return (
    <Svg {...props}>
      <rect
        x="2.2"
        y="3"
        width="11.6"
        height="10"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M6.2 3v10" stroke="currentColor" strokeWidth="1.4" />
    </Svg>
  )
}

export function IconPrompt(props: IconProps) {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      {...props}
    >
      <rect
        x="4"
        y="6"
        width="32"
        height="24"
        rx="10"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M13 16.5 18 20l-5 3.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20.5 24h8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function IconUser(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="8" cy="5.4" r="2.3" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M3.4 13.4c.7-2.4 2.3-3.6 4.6-3.6s3.9 1.2 4.6 3.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function IconCopy(props: IconProps) {
  return (
    <Svg {...props}>
      <rect
        x="5.2"
        y="5.2"
        width="8.2"
        height="8.2"
        rx="1.4"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M3.4 10.2V3.8A1.4 1.4 0 0 1 4.8 2.4h6.4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function IconShare(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="4.2" cy="8" r="1.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11.6" cy="4.2" r="1.5" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="11.6" cy="11.8" r="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M5.6 7.2 10.2 4.9M5.6 8.8 10.2 11.1"
        stroke="currentColor"
        strokeWidth="1.3"
      />
    </Svg>
  )
}

export function IconDots(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="3.5" cy="8" r="1.1" fill="currentColor" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" />
      <circle cx="12.5" cy="8" r="1.1" fill="currentColor" />
    </Svg>
  )
}

export function IconDown(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M4 6.5 8 10.5 12 6.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconPencil(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M9.6 3.6 12.4 6.4 6 12.8H3.2V10Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <path
        d="M8.4 4.8 11.2 7.6"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function IconTrash(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M3.4 5h9.2M6 5V3.6h4V5M5.2 5l.6 8h4.4l.6-8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconDiff(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M4.2 2.6h5.2L12.8 6v7.4A1.4 1.4 0 0 1 11.4 14.8H4.2A1.4 1.4 0 0 1 2.8 13.4V4A1.4 1.4 0 0 1 4.2 2.6Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M9.2 2.8V6h3.2"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M5.4 9.2h5.2M5.4 11.6h3.4"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </Svg>
  )
}

export function IconTerminal(props: IconProps) {
  return (
    <Svg {...props}>
      <rect
        x="2"
        y="3.2"
        width="12"
        height="9.6"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M4.4 6.4 6.6 8.2 4.4 10M8.2 10.2h3.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconPanelRight(props: IconProps) {
  return (
    <Svg {...props}>
      <rect
        x="2.2"
        y="3"
        width="11.6"
        height="10"
        rx="1.6"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M9.8 3v10" stroke="currentColor" strokeWidth="1.4" />
    </Svg>
  )
}

export function IconFileTree(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M3 3.4h4.2l1.1 1.3H13A1.1 1.1 0 0 1 14.1 5.8v6.6A1.1 1.1 0 0 1 13 13.5H3A1.1 1.1 0 0 1 1.9 12.4V4.5A1.1 1.1 0 0 1 3 3.4Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function IconSliders(props: IconProps) {
  return (
    <Svg {...props}>
      <path
        d="M3 5h10M3 11h10"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="6.2" cy="5" r="1.5" fill="currentColor" />
      <circle cx="10.2" cy="11" r="1.5" fill="currentColor" />
    </Svg>
  )
}
