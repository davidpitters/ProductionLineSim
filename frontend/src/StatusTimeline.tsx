import { useEffect, useState } from 'react';
import * as Interfaces from './interfaces/interfaces';
import { DowntimeEvent, getProductionLineStatusDisplayName } from './interfaces/interfaces';

const WINDOW_MS = 8 * 60 * 60 * 1000


interface Segment {
  start: number
  end: number
  status: string
}

function formatHour(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
}

function getSegments(
  events: DowntimeEvent[],
  rangeStart: number,
  rangeEnd: number,
): Segment[] {
  const segments: Segment[] = []
  let cursor = rangeStart

  const sortedEvents = [...events]
    .map((event) => ({
      event,
      start: Math.max(Date.parse(event.StartedAtUtc), rangeStart),
      end: Math.min(
        event.EndedAtUtc ? Date.parse(event.EndedAtUtc) : rangeEnd,
        rangeEnd,
      ),
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
        status: event.Reason,
      })
      cursor = end
    }
  }

  if (cursor < rangeEnd) {
    segments.push({ start: cursor, end: rangeEnd, status: getProductionLineStatusDisplayName(Interfaces.ProductionLineStatus.Running) })
  }

  return segments
}

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

export function StatusTimeline(
    { lines, eventsByLine }: { selectedLine: any, lines: any[], eventsByLine: any }
) {
  const [now, setNow] = useState(Date.now())
  const [statuses, setStatuses] = useState([]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, []);

  const rangeStart = now - WINDOW_MS
  const hourTicks = Array.from({ length: 9 }, (_, index) => {
    const time = rangeStart + index * 60 * 60 * 1000
    return {
      time,
      label: formatHour(time),
    }
  })
  
  return (
    <>
    <section className="status-timeline">
      <h2>Line status — last 8 hours</h2>

      <div className="timeline-axis">
        <div className="timeline-line-name" />
        <div className="timeline-axis-track">
          {hourTicks.map((tick) => (
            <span key={tick.time}>{tick.label}</span>
          ))}
        </div>
      </div>
      <div className="timeline-rows-container scrollable">
        {lines.map((line) => {
            const segments = getSegments(
            eventsByLine[line.Id] ?? [],
            rangeStart,
            now,
            )

            return (
                <div className="timeline-row" key={line.Id}>
                <span className="timeline-line-name">{line.Name}</span>

                <div
                className="timeline-track"
                aria-label={`${line.Name} status over the last 8 hours`}
                >
                {segments.map((segment, index) => {
                    const left =
                    ((segment.start - rangeStart) / WINDOW_MS) * 100
                    const width =
                    ((segment.end - segment.start) / WINDOW_MS) * 100

                    const alignment =
                        left + width / 2 < 50
                            ? 'popover-align-left'
                            : 'popover-align-right'
                    return (
                    <div
                        key={`${line.Id}-${index}`}
                        className={`timeline-segment ${statusClass(segment.status)} ${alignment}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                        title={`${segment.status}: ${formatHour(segment.start)}–${formatHour(segment.end)}`}
                        >
                        <span className="timeline-popover" role="tooltip">
                            <strong>{segment.status}</strong>
                            <span>Start: {formatHour(segment.start)}</span>
                            <span>End: {formatHour(segment.end)}</span>
                        </span>
                    </div>
                    )
                })}
                    </div>
                </div>
            )
        })}
        </div>
    </section>
    </>
  );
}