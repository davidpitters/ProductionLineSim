import { useEffect, useState } from 'react';
import * as Interfaces from './interfaces/interfaces';
import { DowntimeEvent, getProductionLineStatusDisplayName } from './interfaces/interfaces';

interface Segment {
  start: number
  end: number
  status: string
}

/** Parses a local YYYY-MM-DDTHH:mm value without accepting normalized invalid dates. */
function parseLocalDateTime(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return null
  const [year, month, day, hour, minute] = match.slice(1).map(Number)
  if (hour > 23 || minute > 59) return null
  const date = new Date(year, month - 1, day, hour, minute)
  if (
    date.getFullYear() !== year || date.getMonth() !== month - 1 ||
    date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute
  ) return null
  return date.getTime()
}

/** Formats a timeline tick, adding a date label for ranges longer than one day. */
function formatAxisTick(timestamp: number, showDate: boolean): string {
  return new Date(timestamp).toLocaleString([], {
    ...(showDate ? { month: 'short', day: 'numeric' } : {}),
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
}

/** Builds ordered status intervals, filling gaps as Running and clipping to now. */
function getSegments(
  events: DowntimeEvent[],
  rangeStart: number,
  rangeEnd: number,
  now: number,
): Segment[] {
  // The selected range can extend past now; only render the elapsed portion.
  const visibleEnd = Math.min(rangeEnd, now)
  const segments: Segment[] = []
  let cursor = rangeStart

  const sortedEvents = [...events]
    // Clip events to the visible window before filling gaps and ordering segments.
    .map((event) => ({
      event,
      start: Math.max(Date.parse(event.StartedAtUtc), rangeStart),
      end: Math.min(event.EndedAtUtc ? Date.parse(event.EndedAtUtc) : visibleEnd, visibleEnd),
    }))
    .filter(({ start, end }) => end > start)
    .sort((a, b) => a.start - b.start)

  for (const { event, start, end } of sortedEvents) {
    // Fill the time between recorded downtime events as Running.
    if (start > cursor) {
      segments.push({ start: cursor, end: start, status: getProductionLineStatusDisplayName(Interfaces.ProductionLineStatus.Running) })
    }

    const segmentStart = Math.max(start, cursor)
    if (end > segmentStart) {
      segments.push({
        start: segmentStart,
        end,
        status: getProductionLineStatusDisplayName(event.Status),
      })
      cursor = end
    }
  }

  if (cursor < visibleEnd) {
    segments.push({ start: cursor, end: visibleEnd, status: getProductionLineStatusDisplayName(Interfaces.ProductionLineStatus.Running) })
  }

  return segments
}

/** Maps a line status label to its timeline segment CSS class. */
function statusClass(status: string): string {
  switch (status.toLowerCase()) {
    case getProductionLineStatusDisplayName(Interfaces.ProductionLineStatus.Running).toLocaleLowerCase():
      return 'status-running'
    case getProductionLineStatusDisplayName(Interfaces.ProductionLineStatus.Starved).toLocaleLowerCase():
      return 'status-starved'
    case getProductionLineStatusDisplayName(Interfaces.ProductionLineStatus.Blocked).toLocaleLowerCase():
      return 'status-blocked'
    case getProductionLineStatusDisplayName(Interfaces.ProductionLineStatus.Down).toLocaleLowerCase():
      return 'status-down'
    default:
      return 'status-unknown'
  }
}

/** Renders validated time controls and per-line status intervals for the selected range. */
export function StatusTimeline(
    { lines, eventsByLine, highlightedLineId, from, to, nowLocal, nowMs, maxFromLocal, onFromChange, onToChange }: {
      lines: Interfaces.ProductionLine[]
      eventsByLine: Record<string, DowntimeEvent[]>
      highlightedLineId?: string | null
      from: string
      to: string
      nowLocal: string
      nowMs: number
      maxFromLocal: string
      onFromChange: (value: string) => void
      onToChange: (value: string) => void
    }
) {
  const [now, setNow] = useState(Date.now())

  useEffect(() => {
    // Refresh the visible end of ongoing timeline segments without reloading event history.
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, []);

  const rangeStart = parseLocalDateTime(from)
  const rangeEnd = parseLocalDateTime(to)
  const currentTime = nowMs
  const maxFromTime = parseLocalDateTime(maxFromLocal) ?? currentTime - 60_000
  const isFutureTo = rangeEnd !== null && rangeEnd > currentTime
  const isFromTooRecent = rangeStart !== null && rangeStart > maxFromTime
  // Keep the start at least one minute behind now so the timeline has a stable past interval.
  const validRange = rangeStart !== null && rangeEnd !== null && rangeStart <= maxFromTime &&
    rangeStart < rangeEnd && rangeEnd <= currentTime
  const safeRangeStart = rangeStart ?? 0
  const safeRangeEnd = rangeEnd ?? 0
  const rangeDuration = validRange ? safeRangeEnd - safeRangeStart : 0
  const showDate = rangeDuration > 24 * 60 * 60 * 1000
  const ticks = validRange
    ? Array.from({ length: 9 }, (_, index) => {
      const time = safeRangeStart + rangeDuration * index / 8
      return { time, label: formatAxisTick(time, showDate) }
    })
    : []
  const maxToDate = nowLocal.slice(0, 10)
  
  return (
    <>
    <section className="status-timeline">
      <div className="status-timeline-header">
        <div className="line-status-header">
          <h2>Line Status</h2>
          <p>Status history over the selected period</p>
        </div>
        <div className="status-timeline-range-controls" aria-label="Timeline time range">
          <label className="line-detail-range-field">
            <span>From</span>
            <div className="line-detail-date-time-inputs">
              <input
                aria-label="Timeline from date"
                type="date"
                max={maxFromLocal.slice(0, 10)}
                value={from.slice(0, 10)}
                onChange={(event) => onFromChange(`${event.target.value}T${from.slice(11, 16)}`)}
              />
              <input
                aria-label="Timeline from time (24-hour, HH:mm)"
                type="text"
                inputMode="numeric"
                maxLength={5}
                placeholder="HH:mm"
                pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                value={from.slice(11, 16)}
                onChange={(event) => onFromChange(`${from.slice(0, 10)}T${event.target.value}`)}
              />
            </div>
          </label>
          <label className="line-detail-range-field">
            <span>To</span>
            <div className="line-detail-date-time-inputs">
              <input
                aria-label="Timeline to date"
                type="date"
                max={maxToDate}
                value={to.slice(0, 10)}
                onChange={(event) => onToChange(`${event.target.value}T${to.slice(11, 16)}`)}
              />
              <input
                aria-label="Timeline to time (24-hour, HH:mm)"
                type="text"
                inputMode="numeric"
                maxLength={5}
                placeholder="HH:mm"
                pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
                value={to.slice(11, 16)}
                onChange={(event) => onToChange(`${to.slice(0, 10)}T${event.target.value}`)}
              />
              <button type="button" className="line-detail-now-button" onClick={() => onToChange(nowLocal)}>Now</button>
            </div>
          </label>
        </div>
      </div>

      {!validRange ? (
        <p className="line-detail-validation" role="alert">
          {isFromTooRecent
            ? 'From must be at least one minute before Now.'
            : isFutureTo
              ? 'To cannot be later than Now.'
              : 'Enter valid dates and 24-hour times (HH:mm), and make sure From is earlier than To.'}
        </p>
      ) : (
      <>

      <div className="timeline-axis">
        <div className="timeline-line-name" />
        <div className="timeline-axis-track">
          {ticks.map((tick) => (
            <span key={tick.time}>{tick.label}</span>
          ))}
        </div>
      </div>
      <div className="timeline-rows-container scrollable">
        {lines.map((line) => {
            const segments = getSegments(
            eventsByLine[line.Id] ?? [],
          safeRangeStart,
          safeRangeEnd,
            now,
            )

            return (
                <div
                  className={`timeline-row${highlightedLineId === line.Id ? ' timeline-row-highlighted' : ''}`}
                  key={line.Id}
                >
                    <span className="timeline-line-name">{line.Name}</span>

                    <div
                    className="timeline-track"
                    aria-label={`${line.Name} status from ${formatAxisTick(safeRangeStart, showDate)} to ${formatAxisTick(safeRangeEnd, showDate)}`}
                    >
                    {segments.map((segment, index) => {
                        const left =
                        ((segment.start - safeRangeStart) / rangeDuration) * 100
                        const width =
                        ((segment.end - segment.start) / rangeDuration) * 100

                        const alignment =
                            left + width / 2 < 50
                                ? 'popover-align-left'
                                : 'popover-align-right'
                        return (
                        <div
                            key={`${line.Id}-${index}`}
                            className={`timeline-segment ${statusClass(segment.status)} ${alignment}`}
                            style={{ left: `${left}%`, width: `${width}%` }}
                            title={`${segment.status}: ${formatAxisTick(segment.start, showDate)}–${formatAxisTick(segment.end, showDate)}`}
                            >
                            <span className="timeline-popover" role="tooltip">
                                <strong>{segment.status}</strong>
                              <span>Start: {formatAxisTick(segment.start, showDate)}</span>
                              <span>End: {formatAxisTick(segment.end, showDate)}</span>
                            </span>
                        </div>
                        )
                    })}
                    </div>
                </div>
            )
        })}
        </div>
      </>
      )}
    </section>
    </>
  );
}