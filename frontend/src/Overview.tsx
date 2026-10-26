import { useState, useEffect } from 'react'
import * as Interfaces from './interfaces/interfaces'
import { fetchDowntimeEvents, fetchProductionLines } from './api'
import { StatusTimeline } from './StatusTimeline'
import { LineDetail } from './LineDetail'

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
}

function getStatusClass(reason: string): string {
  switch (reason.toLowerCase()) {
    case 'running': return 'status-running'
    case 'starved': return 'status-starved'
    case 'blocked': return 'status-blocked'
    case 'down': return 'status-down'
    default: return 'status-unknown'
  }
}

function getStatusTextClass(reason: string): string {
  switch (reason.toLowerCase()) {
    case 'running': return 'status-running-text'
    case 'starved': return 'status-starved-text'
    case 'blocked': return 'status-blocked-text'
    case 'down': return 'status-down-text'
    default: return 'status-unknown-text'
  }
}

export function Overview(){
    const [productionLines, setProductionLines] = useState<Interfaces.ProductionLine[]>([])
    const [eventsByLine, setEventsByLine] = useState<Record<string, Interfaces.DowntimeEvent[]>>({})
    const [selectedLine, setSelectedLine] = useState<Interfaces.ProductionLine | null>(null)
    const [highlightedLineId, setHighlightedLineId] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [now, setNow] = useState(Date.now())
    const [timelineNow, setTimelineNow] = useState(Date.now())
    const [isLoading, setIsLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [retryToken, setRetryToken] = useState(0)

    const normalizedSearchTerm = searchTerm.trim().toLowerCase()
    const visibleLines = normalizedSearchTerm
      ? productionLines.filter((line) => line.Name.toLowerCase().includes(normalizedSearchTerm))
      : productionLines

    function updateSearch(value: string) {
      setSearchTerm(value)
    }

    function getCurrentStatusSeconds(statusUpdatedAtUtc: string) {
        const statusUpdatedAt = new Date(statusUpdatedAtUtc).getTime()
        return Math.floor((now - statusUpdatedAt) / 1000)
    }

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000)
        return () => window.clearInterval(timer)
    }, [])

    useEffect(() => {
      const timer = window.setInterval(() => setTimelineNow(Date.now()), 60_000)
      return () => window.clearInterval(timer)
    }, [])

    useEffect(() => {
      const controller = new AbortController()

      async function loadOverview() {
        try {
          setLoadError(null)
          const lines = await fetchProductionLines(controller.signal)
          setProductionLines(lines)

          const to = new Date(timelineNow)
          const from = new Date(timelineNow - 8 * 60 * 60 * 1000)
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
    }, [retryToken, timelineNow])

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
              {selectedLine ? (
                <LineDetail
                  line={selectedLine}
                  onBack={() => setSelectedLine(null)}
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
                />
              )}
            </div>
        </div>
    )
}