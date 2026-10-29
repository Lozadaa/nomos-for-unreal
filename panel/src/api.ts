import { markSession } from './session'

export interface Status {
  service: boolean
  listener: boolean
  listenerAgeSec: number | null
  director: string | null
  lastAckSeq: number
  lastAckAt: string | null
  pending: number
  paused: boolean
  project?: { name: string; uproject: string } | null
  /** Hito 24: tokens de entrada medidos en las runs del proyecto, total y por rol. */
  tokens?: { total: number; porRol: Record<string, number> }
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// El servicio abre el panel en /#token=…; se guarda en sessionStorage (como la página del hito 0) y se borra del hash.
function readToken(): string | null {
  try {
    const incoming = new URLSearchParams(location.hash.slice(1)).get('token')
    if (incoming) sessionStorage.setItem('nomos.token', incoming)
    if (location.hash) history.replaceState(null, '', location.pathname + location.search)
    return sessionStorage.getItem('nomos.token')
  } catch {
    return null
  }
}

export const token = readToken()
export const markUnauthorized = () => markSession(!!token)

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: init.method ?? 'GET',
    headers: { Authorization: `Bearer ${token ?? ''}`, ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const data = await response.json().catch(() => ({}))
  if (response.status === 401) markUnauthorized()
  if (!response.ok) throw new ApiError(response.status, (data as { error?: string }).error ?? `http_${response.status}`)
  return data as T
}
