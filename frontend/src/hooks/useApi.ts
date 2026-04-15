import useSWR, { mutate } from 'swr'

const CACHE_PREFIX = 'hud-cache:'

const fetcher = async (url: string) => {
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }
  return res.json()
}

function getCached<T>(key: string): T | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    if (!raw) return undefined
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}

function setCache(key: string, data: any) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data))
  } catch {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(CACHE_PREFIX)) keys.push(k)
    }
    keys.slice(0, Math.ceil(keys.length / 2)).forEach(k => localStorage.removeItem(k))
  }
}

export function useApi<T = any>(path: string, refreshInterval = 30000) {
  const key = `/api${path}`

  return useSWR<T>(key, fetcher, {
    refreshInterval,
    revalidateOnFocus: false,
    dedupingInterval: 5000,
    errorRetryCount: 3,
    errorRetryInterval: 2000,
    keepPreviousData: true,
    fallbackData: getCached<T>(key),
    onSuccess: (data) => {
      setCache(key, data)
    },
    onError: (err) => {
      console.warn(`[HUD] ${path}: ${err.message}`)
    },
  })
}

/** Force-revalidate all SWR caches */
export function refreshAll() {
  mutate(
    (key) => typeof key === 'string' && key.startsWith('/api'),
    undefined,
    { revalidate: true }
  )
}
