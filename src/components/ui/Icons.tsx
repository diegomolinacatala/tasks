import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

const Icon = ({ size = 20, children, ...props }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.75}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
    {...props}
  >
    {children}
  </svg>
)

export const IconCheck = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4.5 12.5 9.5 17.5 19.5 6.5" />
  </Icon>
)

export const IconPlus = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const IconToday = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h16M4 12h10M4 17h6" />
  </Icon>
)

export const IconWeek = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3.5" y="5" width="17" height="15" rx="3" />
    <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
  </Icon>
)

export const IconInbox = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 13.5 6 5.5h12l2 8" />
    <path d="M4 13.5h4l1.2 2.5h5.6l1.2-2.5h4v3.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
  </Icon>
)

export const IconMore = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconTrash = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4.5 6.5h15M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
    <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
  </Icon>
)

export const IconChevronDown = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6.5 9.5 12 15l5.5-5.5" />
  </Icon>
)

export const IconChevronLeft = (props: IconProps) => (
  <Icon {...props}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </Icon>
)

export const IconChevronRight = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9.5 5.5 16 12l-6.5 6.5" />
  </Icon>
)

export const IconClose = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
)

export const IconGrip = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="9" cy="6" r="1.35" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6" r="1.35" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1.35" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.35" fill="currentColor" stroke="none" />
    <circle cx="9" cy="18" r="1.35" fill="currentColor" stroke="none" />
    <circle cx="15" cy="18" r="1.35" fill="currentColor" stroke="none" />
  </Icon>
)

export const IconDownload = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14" />
  </Icon>
)

export const IconBell = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2H4.5z" />
    <path d="M10 20.5a2.2 2.2 0 0 0 4 0" />
  </Icon>
)

export const IconBellOff = (props: IconProps) => (
  <Icon {...props}>
    <path d="M8.2 6.3A6 6 0 0 1 18 11v4M6 11v5.5l-1.5 2h12" />
    <path d="M10 20.5a2.2 2.2 0 0 0 4 0M4 4l16 16" />
  </Icon>
)

export const IconMic = (props: IconProps) => (
  <Icon {...props}>
    <rect x="9" y="3.5" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5" />
  </Icon>
)

export const IconUpload = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19h14" />
  </Icon>
)

export const IconPin = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.3" />
  </Icon>
)

export const IconLocate = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 4 4 11l7 2 2 7 7-16Z" />
  </Icon>
)

export const IconSearch = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Icon>
)
