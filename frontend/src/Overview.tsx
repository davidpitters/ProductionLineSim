import { useState, useEffect } from 'react'
import * as Interfaces from './interfaces/interfaces'
import { fetchDowntimeEvents, fetchProductionLines } from './api'
import { StatusTimeline } from './StatusTimeline'
import { LineDetail } from './LineDetail'

/** Converts a Date to a datetime-local string in the user's local timezone. */
const toLocalDateTimeInput = (value: Date): string => {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

/** Parses a local datetime input and rejects invalid calendar dates and times. */
const parseLocalDateTime = (value: string): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  const date = new Date(year, month - 1, day, hour, minute)
  if (
    hour > 23 || minute > 59 ||
    date.getFullYear() !== year || date.getMonth() !== month - 1 ||
    date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute
  ) return null
  return date.getTime()
}

/** Formats elapsed seconds as a zero-padded hours:minutes:seconds value. */
function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
}

/** Maps a status label to its timeline badge CSS class. */
function getStatusClass(reason: string): string {
  switch (reason.toLowerCase()) {
    case 'running': return 'status-running'
    case 'starved': return 'status-starved'
    case 'blocked': return 'status-blocked'
    case 'down': return 'status-down'
    default: return 'status-unknown'
  }
}

/** Maps a status label to its text-color CSS class. */
function getStatusTextClass(reason: string): string {
  switch (reason.toLowerCase()) {
    case 'running': return 'status-running-text'
    case 'starved': return 'status-starved-text'
    case 'blocked': return 'status-blocked-text'
    case 'down': return 'status-down-text'
    default: return 'status-unknown-text'
  }
}

/** Owns line selection, time-range data loading, and the status timeline view. */
export function Overview(){
    const [productionLines, setProductionLines] = useState<Interfaces.ProductionLine[]>([])
    const [eventsByLine, setEventsByLine] = useState<Record<string, Interfaces.DowntimeEvent[]>>({})
    const [selectedLine, setSelectedLine] = useState<Interfaces.ProductionLine | null>(null)
    const [highlightedLineId, setHighlightedLineId] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [now, setNow] = useState(Date.now())
    const [timelineFrom, setTimelineFrom] = useState(() => {
      const current = Date.now()
      return toLocalDateTimeInput(new Date(current - 8 * 60 * 60 * 1000))
    })
    const [timelineTo, setTimelineTo] = useState(() => toLocalDateTimeInput(new Date()))
    const [isLoading, setIsLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [retryToken, setRetryToken] = useState(0)
    const timelineFromMs = parseLocalDateTime(timelineFrom)
    const timelineToMs = parseLocalDateTime(timelineTo)
    const nowLocal = toLocalDateTimeInput(new Date(now))
    const maxFromLocal = toLocalDateTimeInput(new Date(now - 60_000))
    const validTimelineRange = timelineFromMs !== null && timelineToMs !== null &&
      timelineFromMs <= now - 60_000 && timelineFromMs < timelineToMs && timelineToMs <= now

    const normalizedSearchTerm = searchTerm.trim().toLowerCase()
    const visibleLines = normalizedSearchTerm
      ? productionLines.filter((line) => line.Name.toLowerCase().includes(normalizedSearchTerm))
      : productionLines

    /** Updates the line-list search query. */
    function updateSearch(value: string) {
      setSearchTerm(value)
    }

    /** Calculates how long the line has held its current status. */
    function getCurrentStatusSeconds(statusUpdatedAtUtc: string) {
        const statusUpdatedAt = new Date(statusUpdatedAtUtc).getTime()
        return Math.floor((now - statusUpdatedAt) / 1000)
    }

    useEffect(() => {
      // Keep displayed status durations moving even when no API data changes.
        const timer = window.setInterval(() => setNow(Date.now()), 1000)
        return () => window.clearInterval(timer)
    }, [])

    useEffect(() => {
      const controller = new AbortController()

      if (!validTimelineRange || timelineFromMs === null || timelineToMs === null) {
        // Do not show stale timeline data while the user is correcting an invalid range.
        setEventsByLine({})
        setIsLoading(false)
        return () => controller.abort()
      }

      const fromTimestamp = timelineFromMs
      const toTimestamp = timelineToMs

      /** Loads lines and their downtime windows, ignoring results after cancellation. */
      async function loadOverview() {
        try {
          setIsLoading(true)
          setLoadError(null)
          const lines = await fetchProductionLines(controller.signal)
          setProductionLines(lines)

          const from = new Date(fromTimestamp)
          const to = new Date(toTimestamp)
          // Load each line's overlapping events together so the timeline stays in sync with its range.
          const lineEvents = await Promise.all(
            lines.map((line) => fetchDowntimeEvents(line.Id, from, to, controller.signal)),
          )
          setEventsByLine(Object.fromEntries(
            lines.map((line, index) => [line.Id, lineEvents[index]]),
          ))
        } catch (error) {
          if (!controller.signal.aborted) {
            setLoadError(error instanceof Error ? error.message : 'Unable to load production line data.')
          }
        } finally {
          if (!controller.signal.aborted) setIsLoading(false)
        }
      }

      void loadOverview()
      return () => controller.abort()
    }, [retryToken, timelineFromMs, timelineToMs, validTimelineRange])

    return (
        <div className={`overview screen${selectedLine ? ' line-selected' : ''}`}>
          {!selectedLine && <div className="left-content">
                {/* search */}
                <div className="production-line-search">
                  <svg
                    className="production-line-search-icon"
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle cx="10.8" cy="10.8" r="6.8" />
                    <path d="m16 16 4.2 4.2" />
                  </svg>
                  <input
                    type="search"
                    aria-label="Search production lines"
                    placeholder="Search production lines..."
                    value={searchTerm}
                    onChange={(event) => updateSearch(event.target.value)}
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      className="production-line-search-clear"
                      aria-label="Clear search"
                      onClick={() => updateSearch('')}
                    >
                      <span aria-hidden="true">×</span>
                    </button>
                  )}
                </div>
                <div className="production-line-list ">
                    <div className="production-line-list-inner scrollable">
                        {visibleLines.map((line) => (
                          <div
                            key={line.Id}
                            className="production-line-list-item"
                            onMouseEnter={() => setHighlightedLineId(line.Id)}
                            onMouseLeave={() => setHighlightedLineId(null)}
                            onFocus={() => setHighlightedLineId(line.Id)}
                            onBlur={(event) => {
                              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                                setHighlightedLineId(null)
                              }
                            }}
                          >
                            <button onClick={() => setSelectedLine(line)}>
                                    <div className="flex flex-column">
                                        <div className="flex flex-row">
                                            <div>
                                                {line.Name}
                                            </div>
                                            <div>
                                                <span className={getStatusTextClass(Interfaces.getProductionLineStatusDisplayName(line.Status))}>{Interfaces.getProductionLineStatusDisplayName(line.Status)}</span> for {formatDuration(getCurrentStatusSeconds(line.StatusUpdatedAtUtc))}
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            </div>}
            <div className="right-content">
              {/* Resolution callback updates the selected detail and overview state together. */}
              {selectedLine ? (
                <LineDetail
                  line={selectedLine}
                  onBack={() => setSelectedLine(null)}
                  onLineResolved={(statusUpdatedAtUtc) => {
                    const updatedLine = {
                      ...selectedLine,
                      Status: Interfaces.ProductionLineStatus.Running,
                      StatusUpdatedAtUtc: statusUpdatedAtUtc,
                    }
                    setSelectedLine(updatedLine)
                    setProductionLines((current) => current.map((line) => line.Id === updatedLine.Id ? updatedLine : line))
                    setRetryToken((value) => value + 1)
                  }}
                  getStatusClass={getStatusClass}
                />
              ) : isLoading && productionLines.length === 0 ? (
                <p role="status">Loading production lines…</p>
              ) : loadError ? (
                <div className="overview-api-error" role="alert">
                  <p>Could not load production line data: {loadError}</p>
                  <button type="button" onClick={() => {
                    setIsLoading(true)
                    setRetryToken((value) => value + 1)
                  }}>
                    Retry
                  </button>
                </div>
              ) : (
                <StatusTimeline
                  lines={visibleLines}
                  eventsByLine={eventsByLine}
                  highlightedLineId={highlightedLineId}
                  from={timelineFrom}
                  to={timelineTo}
                  nowLocal={nowLocal}
                  nowMs={now}
                  maxFromLocal={maxFromLocal}
                  onFromChange={setTimelineFrom}
                  onToChange={setTimelineTo}
                />
              )}
            </div>
        </div>
    )
}