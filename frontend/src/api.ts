import {
  ProductionLineStatus,
  type DowntimeEvent,
  type ProductionLine,
} from './interfaces/interfaces'

interface ApiProductionLine {
  id: string
  name: string
  status: number | string
  statusUpdatedAtUtc: string
}

interface ApiDowntimeEvent {
  id: string
  sourceEventId: string
  reason: string
  status: number
  startedAtUtc: string
  endedAtUtc: string | null
  durationSeconds: number
  isOngoing: boolean
}

interface ApiDowntimeReport {
  events: ApiDowntimeEvent[]
}

const statusByName: Record<string, ProductionLineStatus> = {
  running: ProductionLineStatus.Running,
  starved: ProductionLineStatus.Starved,
  blocked: ProductionLineStatus.Blocked,
  down: ProductionLineStatus.Down,
}

function mapProductionLine(line: ApiProductionLine): ProductionLine {
  const status =
    typeof line.status === 'string'
      ? statusByName[line.status.toLowerCase()]
      : line.status

  if (status === undefined || !Object.values(ProductionLineStatus).includes(status as ProductionLineStatus)) {
    throw new Error(`Unsupported production-line status: ${line.status}`)
  }

  return {
    Id: line.id,
    Name: line.name,
    Status: status as ProductionLineStatus,
    StatusUpdatedAtUtc: line.statusUpdatedAtUtc,
  }
}

function mapDowntimeEvent(event: ApiDowntimeEvent): DowntimeEvent {
  return {
    Id: event.id,
    SourceEventId: event.sourceEventId,
    Reason: event.reason,
    Status: event.status as ProductionLineStatus,
    StartedAtUtc: event.startedAtUtc,
    EndedAtUtc: event.endedAtUtc,
    DurationSeconds: event.durationSeconds,
    IsOngoing: event.isOngoing,
  }
}

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as
      | { error?: string; title?: string; detail?: string }
      | null
    throw new Error(body?.error ?? body?.detail ?? body?.title ?? `API request failed (${response.status})`)
  }

  return response.json() as Promise<T>
}

export async function fetchProductionLines(signal?: AbortSignal): Promise<ProductionLine[]> {
  const lines = await requestJson<ApiProductionLine[]>('/api/productionlines', signal)
  return lines.map(mapProductionLine)
}

export async function fetchDowntimeEvents(
  lineId: string,
  from: Date,
  to: Date,
  signal?: AbortSignal,
): Promise<DowntimeEvent[]> {
  const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
  const report = await requestJson<ApiDowntimeReport>(
    `/api/productionlines/${encodeURIComponent(lineId)}/downtime?${query.toString()}`,
    signal,
  )
  return report.events.map(mapDowntimeEvent)
}
