import { useEffect, useState } from 'react'
import { fetchFailureLogs, fetchIngestionLogs, fetchMachineEventLogs } from './api'
import type { IngestionLogEntry, LogPage, MachineEventLogEntry } from './interfaces/interfaces'

type LogTab = 'events' | 'ingestion' | 'failures'
const PAGE_SIZE = 50

const formatDateTime = (value: string | null) => value
  ? new Date(value).toLocaleString([], {
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  })
  : '—'

const formatEventDuration = (event: MachineEventLogEntry) => {
  if (!event.endedAtUtc) return 'Ongoing'
  const seconds = Math.max(0, Math.floor((Date.parse(event.endedAtUtc) - Date.parse(event.startedAtUtc)) / 1000))
  const minutes = Math.floor(seconds / 60)
  const remainder = seconds % 60
  return `${minutes}m ${remainder}s`
}

export function Logs() {
  const [activeTab, setActiveTab] = useState<LogTab>('events')
  const [offset, setOffset] = useState(0)
  const [eventPage, setEventPage] = useState<LogPage<MachineEventLogEntry> | null>(null)
  const [ingestionPage, setIngestionPage] = useState<LogPage<IngestionLogEntry> | null>(null)
  const [failurePage, setFailurePage] = useState<LogPage<IngestionLogEntry> | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    const load = async () => {
      try {
        if (activeTab === 'events') {
          setEventPage(await fetchMachineEventLogs(PAGE_SIZE, offset, controller.signal))
        } else if (activeTab === 'ingestion') {
          setIngestionPage(await fetchIngestionLogs(PAGE_SIZE, offset, controller.signal))
        } else {
          setFailurePage(await fetchFailureLogs(PAGE_SIZE, offset, controller.signal))
        }
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load logs.')
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }

    void load()
    return () => controller.abort()
  }, [activeTab, offset, refreshToken])

  const page = activeTab === 'events' ? eventPage : activeTab === 'ingestion' ? ingestionPage : failurePage
  const startTab = (tab: LogTab) => {
    setActiveTab(tab)
    setOffset(0)
  }

  return (
    <section className="logs-page" aria-labelledby="logs-title">
      <header className="logs-header">
        <div>
          <p className="ingestion-eyebrow">OPERATIONAL HISTORY</p>
          <h1 id="logs-title">Logs</h1>
          <p>Review machine events and ingestion queue activity.</p>
        </div>
        <button type="button" className="ingestion-refresh" disabled={loading} onClick={() => setRefreshToken((value) => value + 1)}>
          {loading ? 'Loading…' : '↻ Refresh'}
        </button>
      </header>

      <div className="logs-tabs" role="tablist" aria-label="Log categories">
        <button type="button" role="tab" aria-selected={activeTab === 'events'} className={activeTab === 'events' ? 'is-active' : ''} onClick={() => startTab('events')}>Machine Events</button>
        <button type="button" role="tab" aria-selected={activeTab === 'ingestion'} className={activeTab === 'ingestion' ? 'is-active' : ''} onClick={() => startTab('ingestion')}>Ingestion Messages</button>
        <button type="button" role="tab" aria-selected={activeTab === 'failures'} className={activeTab === 'failures' ? 'is-active' : ''} onClick={() => startTab('failures')}>Failures</button>
      </div>

      <div className="logs-card" role="tabpanel" aria-label={`${activeTab} log table`}>
        {loading ? <p className="logs-state" role="status">Loading logs…</p> : error ? (
          <div className="logs-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={() => setRefreshToken((value) => value + 1)}>Retry</button>
          </div>
        ) : !page?.items.length ? (
          <p className="logs-state">No {activeTab === 'events' ? 'machine events' : activeTab === 'ingestion' ? 'ingestion messages' : 'failed messages'} found.</p>
        ) : (
          <div className="logs-table-scroll">
            {activeTab === 'events' && eventPage && <table className="logs-table">
              <thead><tr><th>Started</th><th>Line</th><th>Status</th><th>Reason</th><th>Duration</th><th>Ended</th><th>Source Event ID</th><th>Recorded / Original Message</th></tr></thead>
              <tbody>{eventPage.items.map((entry) => <tr key={entry.id}>
                <td>{formatDateTime(entry.startedAtUtc)}</td><td>{entry.lineName}</td>
                <td><span className={`logs-status ${entry.isDuplicate ? 'status-duplicate' : `status-${entry.status.toLowerCase()}`}`}>{entry.isDuplicate ? 'Duplicate recognized' : entry.status}</span></td>
                <td>{entry.reason}</td><td>{formatEventDuration(entry)}</td><td>{formatDateTime(entry.endedAtUtc)}</td>
                <td><code title={entry.sourceEventId}>{entry.sourceEventId}</code></td>
                <td className="logs-detail-cell">{entry.isDuplicate
                  ? <>{formatDateTime(entry.recognizedAtUtc)}<br /><small>Original message: <code title={entry.originalMessageId ?? ''}>{entry.originalMessageId}</code></small></>
                  : formatDateTime(entry.receivedAtUtc)}</td>
              </tr>)}</tbody>
            </table>}
            {activeTab === 'ingestion' && ingestionPage && <IngestionTable page={ingestionPage} />}
            {activeTab === 'failures' && failurePage && <FailuresTable page={failurePage} />}
          </div>
        )}
      </div>

      <footer className="logs-pagination">
        <span>{page?.items.length ? `Showing ${offset + 1}–${offset + page.items.length}` : 'No records on this page'}</span>
        <div>
          <button type="button" disabled={loading || offset === 0} onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}>Previous</button>
          <span>Page {Math.floor(offset / PAGE_SIZE) + 1}</span>
          <button type="button" disabled={loading || !page?.hasMore} onClick={() => setOffset((value) => value + PAGE_SIZE)}>Next</button>
        </div>
      </footer>
    </section>
  )
}

function IngestionTable({ page }: { page: LogPage<IngestionLogEntry> }) {
  return <table className="logs-table">
    <thead><tr><th>Created</th><th>Source Event ID</th><th>Status</th><th>Attempts</th><th>Last Attempt</th><th>Processed</th><th>Details</th></tr></thead>
    <tbody>{page.items.map((message) => <tr key={message.messageId}>
      <td>{formatDateTime(message.createdAtUtc)}</td><td><code title={message.sourceEventId}>{message.sourceEventId}</code></td>
      <td><span className={`logs-status status-text-${message.status.toLowerCase()}`}>{message.status}</span></td>
      <td>{message.attemptCount}</td><td>{formatDateTime(message.lastAttemptedAtUtc)}</td><td>{formatDateTime(message.processedAtUtc)}</td>
      <td className="logs-detail-cell">{message.lastError ?? '—'}</td>
    </tr>)}</tbody>
  </table>
}

function FailuresTable({ page }: { page: LogPage<IngestionLogEntry> }) {
  return <table className="logs-table">
    <thead><tr><th>Failed At</th><th>Source Event ID</th><th>Attempts</th><th>Failure Details</th></tr></thead>
    <tbody>{page.items.map((message) => <tr key={message.messageId}>
      <td>{formatDateTime(message.lastAttemptedAtUtc ?? message.createdAtUtc)}</td>
      <td><code title={message.sourceEventId}>{message.sourceEventId}</code></td><td>{message.attemptCount}</td>
      <td className="logs-detail-cell">{message.lastError ?? 'No failure detail was recorded.'}</td>
    </tr>)}</tbody>
  </table>
}