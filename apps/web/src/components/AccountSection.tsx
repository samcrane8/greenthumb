import { Link, useLocation } from 'react-router-dom'
import { Cloud, HardDrive, WifiOff } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useSettings } from '@/settings/store'
import { useServerInfo } from '@/settings/useServerInfo'

/**
 * Account section pinned to the sidebar bottom-left. Local-first: when the
 * effective API is open (local), it shows "Working locally" with no login
 * prompt. When connected to a cloud instance it shows the profile + host; if the
 * target is unreachable it shows an offline state. The whole row links to
 * Settings.
 */
export function AccountSection() {
  const { profile, cloud } = useSettings()
  const { info, error } = useServerInfo()
  const location = useLocation()

  const connected = cloud.connected && !error
  const displayName = profile.name.trim() || (connected ? 'Cloud account' : 'Local')
  const initials = initialsOf(profile.name || profile.email) || (connected ? 'C' : 'L')

  let statusIcon = <HardDrive className="size-3" />
  let statusText = 'Working locally'
  if (error) {
    statusIcon = <WifiOff className="size-3" />
    statusText = 'Offline'
  } else if (cloud.connected) {
    statusIcon = <Cloud className="size-3" />
    statusText = hostOf(cloud.url) ?? 'Connected'
  } else if (info?.mode === 'cloud') {
    statusIcon = <Cloud className="size-3" />
    statusText = 'Sign in'
  }

  return (
    <div className="border-t p-2">
      <Link
        to="/settings"
        className={cn(
          'group relative flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent',
          location.pathname.startsWith('/settings') &&
            "bg-accent before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary before:content-['']"
        )}
      >
        <div className="relative grid size-8 shrink-0 place-items-center rounded-sm bg-primary/12 font-mono text-xs font-semibold uppercase text-primary">
          {initials}
          {connected && (
            <span className="live-dot absolute -right-0.5 -top-0.5 ring-2 ring-card" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{displayName}</div>
          <div className="flex items-center gap-1.5">
            <span className="text-muted-foreground [&_svg]:size-3">{statusIcon}</span>
            <span className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              {statusText}
            </span>
          </div>
        </div>
      </Link>
    </div>
  )
}

function initialsOf(source: string): string {
  const s = source.trim()
  if (!s) return ''
  const parts = s.split(/[\s@._-]+/).filter(Boolean)
  const chars = parts.length >= 2 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)
  return chars.toUpperCase()
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).host
  } catch {
    return null
  }
}
