import { useEffect, useState } from 'react'
import { api, type ServerInfo } from '@/lib/api'
import { useSettings } from './store'

/**
 * Fetch the effective API's posture (`GET /api/info`) and re-fetch whenever the
 * cloud connection changes, so the account section and Settings reflect Local
 * vs Cloud (and unreachable) states live.
 */
export function useServerInfo(): { info: ServerInfo | null; error: string | null; loading: boolean } {
  const { cloud } = useSettings()
  const [info, setInfo] = useState<ServerInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    api
      .info()
      .then((i) => {
        if (!active) return
        setInfo(i)
        setError(null)
      })
      .catch((e: unknown) => {
        if (!active) return
        setInfo(null)
        setError(e instanceof Error ? e.message : 'Unreachable')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [cloud.connected, cloud.url, cloud.apiKey])

  return { info, error, loading }
}
