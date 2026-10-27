import {
  ProductionLineStatus,
  type DowntimeEvent,
  type IngestionHealth,
  type IngestionLogEntry,
  type IngestionMessage,
  type IngestionReason,
  type LogPage,
  type MachineEventLogEntry,
  type MachineEventRequest,
  type MachineEventResponse,
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

/** Converts an API line, accepting either numeric or display-name enum values. */
function mapProductionLine(line: ApiProductionLine): ProductionLine {
  // The API may serialize the enum as either its display name or numeric value.
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

/** Converts the API's downtime event shape to the frontend model. */
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

/** Fetches JSON without caching and turns API error payloads into readable errors. */
async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  // Avoid stale log/status data after recent writes.
  const response = await fetch(url, { signal, cache: 'no-store', headers: { Accept: 'application/json' } })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as
      | { error?: string; title?: string; detail?: string }
      | null
    throw new Error(body?.error ?? body?.detail ?? body?.title ?? `API request failed (${response.status})`)
  }

  return response.json() as Promise<T>
}

/** Sends a JSON POST and reports API failures as exceptions. */
async function sendJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    signal,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const errorBody = await response.json().catch(() => null) as
      | { error?: string; title?: string; detail?: string }
      | null
    throw new Error(errorBody?.error ?? errorBody?.detail ?? errorBody?.title ?? `API request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

/** Loads production lines and maps their wire representation to frontend models. */
export async function fetchProductionLines(signal?: AbortSignal): Promise<ProductionLine[]> {
  const lines = await requestJson<ApiProductionLine[]>('/api/productionlines', signal)
  return lines.map(mapProductionLine)
}

/** Loads one line's downtime events that overlap the requested time range. */
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

/** Resolves the line's open event and returns the timestamp of its status update. */
export async function resolveCurrentEvent(lineId: string, signal?: AbortSignal): Promise<{ statusUpdatedAtUtc: string }> {
  const response = await fetch(`/api/productionlines/${encodeURIComponent(lineId)}/resolve-current-event`, {
    method: 'POST',
    signal,
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null) as
      | { error?: string; title?: string; detail?: string }
      | null
    throw new Error(body?.error ?? body?.detail ?? body?.title ?? `API request failed (${response.status})`)
  }
  return response.json() as Promise<{ statusUpdatedAtUtc: string }>
}

/** Loads accepted event reasons together with their resulting line statuses. */
export async function fetchIngestionReasons(signal?: AbortSignal): Promise<IngestionReason[]> {
  return requestJson<IngestionReason[]>('/api/ingestion/reasons', signal)
}

/** Loads the ingestion queue counts and recent message summary. */
export async function fetchIngestionHealth(signal?: AbortSignal): Promise<IngestionHealth> {
  return requestJson<IngestionHealth>('/api/ingestion/health', signal)
}

/** Submits a machine event, optionally requesting a simulated queue failure. */
export async function submitMachineEvent(
  request: MachineEventRequest,
  failureMode: 'transient' | 'permanent' | 'none',
  signal?: AbortSignal,
): Promise<MachineEventResponse> {
  const query = failureMode === 'none' ? '' : `?failureMode=${failureMode}`
  return sendJson<MachineEventResponse>(`/api/ingestion/submit${query}`, request, signal)
}

/** Retrieves the latest state of a queued ingestion message. */
export async function fetchIngestionMessage(messageId: string, signal?: AbortSignal): Promise<IngestionMessage> {
  return requestJson<IngestionMessage>(`/api/ingestion/messages/${encodeURIComponent(messageId)}`, signal)
}

/** Builds the common pagination query used by log endpoints. */
const logPageQuery = (limit: number, offset: number) =>
  new URLSearchParams({ limit: String(limit), offset: String(offset) })

/** Loads one page of processed and duplicate-recognition machine events. */
export async function fetchMachineEventLogs(
  limit: number,
  offset: number,
  signal?: AbortSignal,
): Promise<LogPage<MachineEventLogEntry>> {
  return requestJson<LogPage<MachineEventLogEntry>>(`/api/logs/events?${logPageQuery(limit, offset)}`, signal)
}

/** Loads one page of ingestion queue messages. */
export async function fetchIngestionLogs(
  limit: number,
  offset: number,
  signal?: AbortSignal,
): Promise<LogPage<IngestionLogEntry>> {
  return requestJson<LogPage<IngestionLogEntry>>(`/api/logs/ingestion-messages?${logPageQuery(limit, offset)}`, signal)
}

/** Loads one page containing failed ingestion messages only. */
export async function fetchFailureLogs(
  limit: number,
  offset: number,
  signal?: AbortSignal,
): Promise<LogPage<IngestionLogEntry>> {
  return requestJson<LogPage<IngestionLogEntry>>(`/api/logs/failures?${logPageQuery(limit, offset)}`, signal)
}
