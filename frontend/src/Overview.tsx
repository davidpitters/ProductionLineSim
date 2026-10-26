import { useState, useEffect } from 'react'
import * as Interfaces from './interfaces/interfaces'
import { StatusTimeline } from './StatusTimeline'
import { LineDetail } from './LineDetail'

const mockProductionLines: Interfaces.ProductionLine[] = [
  {
    Id: 'line-1',
    Name: 'Filling Line 01',
    Status: Interfaces.ProductionLineStatus.Running,
    StatusUpdatedAtUtc: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    Id: 'line-2',
    Name: 'Packaging Line 02',
    Status: Interfaces.ProductionLineStatus.Down,
    StatusUpdatedAtUtc: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  },
  {
    Id: 'line-3',
    Name: 'Assembly Line 03',
    Status: Interfaces.ProductionLineStatus.Starved,
    StatusUpdatedAtUtc: new Date(Date.now() - 45 * 1000).toISOString(),
  },
  {
    Id: 'line-4',
    Name: 'Inspection Line 04',
    Status: Interfaces.ProductionLineStatus.Running,
    StatusUpdatedAtUtc: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  },
  {
    Id: 'line-5',
    Name: 'Maintenance Line 05',
    Status: Interfaces.ProductionLineStatus.Down,
    StatusUpdatedAtUtc: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
  {
    Id: 'line-6',
    Name: 'Quality Control Line 06',
    Status: Interfaces.ProductionLineStatus.Running,
    StatusUpdatedAtUtc: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
  }
]

const mockNow = Date.now()

function makeMockEvent(
  id: string,
  reason: string,
  startedMinutesAgo: number,
  durationMinutes: number | null,
): Interfaces.DowntimeEvent {
  const startedAt = mockNow - startedMinutesAgo * 60_000
  const endedAt =
    durationMinutes === null
      ? null
      : startedAt + durationMinutes * 60_000

  return {
    Id: id,
    SourceEventId: `mock-${id}`,
    Reason: reason,
    StartedAtUtc: new Date(startedAt).toISOString(),
    EndedAtUtc: endedAt === null ? null : new Date(endedAt).toISOString(),
    DurationSeconds:
      durationMinutes === null ? 0 : durationMinutes * 60,
    IsOngoing: endedAt === null,
  }
}

const eventsByLine: Record<string, Interfaces.DowntimeEvent[]> = {
  'line-1': [
    makeMockEvent('event-101', 'Down', 465, 18),
    makeMockEvent('event-102', 'Blocked', 446, 7),
    makeMockEvent('event-103', 'Starved', 428, 12),
    makeMockEvent('event-104', 'Down', 405, 24),
    makeMockEvent('event-105', 'Starved', 378, 9),
    makeMockEvent('event-106', 'Blocked', 354, 16),
    makeMockEvent('event-107', 'Down', 330, 11),
    makeMockEvent('event-108', 'Blocked', 306, 6),
    makeMockEvent('event-109', 'Starved', 281, 14),
    makeMockEvent('event-110', 'Down', 258, 21),
    makeMockEvent('event-111', 'Blocked', 232, 8),
    makeMockEvent('event-112', 'Starved', 207, 17),
    makeMockEvent('event-113', 'Down', 183, 10),
    makeMockEvent('event-114', 'Blocked', 158, 13),
    makeMockEvent('event-115', 'Starved', 134, 7),
    makeMockEvent('event-116', 'Down', 110, 19),
    makeMockEvent('event-117', 'Blocked', 86, 5),
    makeMockEvent('event-118', 'Starved', 63, 12),
    makeMockEvent('event-119', 'Down', 42, 9),
    makeMockEvent('event-120', 'Blocked', 24, 6),
    makeMockEvent('event-121', 'Starved', 18, 4),
    makeMockEvent('event-122', 'Down', 14, 7),
    makeMockEvent('event-123', 'Blocked', 9, 3),
    makeMockEvent('event-124', 'Starved', 5, 2),
    makeMockEvent('event-125', 'Down', 1, null), // ongoing
  ],
  'line-2': [
    makeMockEvent('event-201', 'Starved', 390, 25),
    makeMockEvent('event-202', 'Down', 180, 40),
    makeMockEvent('event-203', 'Down', 20, null), // ongoing
  ],
  'line-3': [
    makeMockEvent('event-301', 'Blocked', 350, 30),
    makeMockEvent('event-302', 'Starved', 120, 18),
  ],
  'line-4': [
    makeMockEvent('event-401', 'Down', 300, 12),
    makeMockEvent('event-402', 'Blocked', 100, 22),
  ],
  'line-5': [
    makeMockEvent('event-501', 'Down', 440, 55),
    makeMockEvent('event-502', 'Starved', 210, 30),
  ],
  'line-6': [
    makeMockEvent('event-601', 'Starved', 280, 16),
    makeMockEvent('event-602', 'Blocked', 60, 10),
  ],
}

function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  return [hours, minutes, seconds]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
}

export function Overview(){
    //const [productionLines, setProductionLines] = useState<Interfaces.ProductionLine[]>([])
    const [productionLines, setProductionLines] =
  useState<Interfaces.ProductionLine[]>(mockProductionLines)
    const [selectedLine, setSelectedLine] = useState<Interfaces.ProductionLine | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [now, setNow] = useState(Date.now())

    function updateSearch(value: string) {
      setSearchTerm(value)
      const normalizedSearchTerm = value.trim().toLowerCase()
      setProductionLines(
        normalizedSearchTerm
          ? mockProductionLines.filter((line) =>
            line.Name.toLowerCase().includes(normalizedSearchTerm)
          )
          : mockProductionLines
      )
    }

    function getCurrentStatusSeconds(statusUpdatedAtUtc: string) {
        const statusUpdatedAt = new Date(statusUpdatedAtUtc).getTime()
        return Math.floor((now - statusUpdatedAt) / 1000)
    }

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000)
        return () => window.clearInterval(timer)
    }, [])

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
                        {productionLines.map((line) => (
                          <div key={line.Id} className="production-line-list-item">
                            <button onClick={() => setSelectedLine(line)}>
                                    <div className="flex flex-column">
                                        <div className="flex flex-row">
                                            <div>
                                                {line.Name}
                                            </div>
                                            <div>
                                                Current Status Seconds: {formatDuration(getCurrentStatusSeconds(line.StatusUpdatedAtUtc))}
                                            </div>
                                        </div>
                                        <div className="flex flex-row">
                                            {line.Status}
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
                  events={eventsByLine[selectedLine.Id] ?? []}
                  onBack={() => setSelectedLine(null)}
                />
              ) : (
                <StatusTimeline lines={productionLines} selectedLine={selectedLine} eventsByLine={eventsByLine}/>
              )}
            </div>
        </div>
    )
}