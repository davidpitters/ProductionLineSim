import { useState, useEffect } from 'react'
import * as Interfaces from './interfaces/interfaces'

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
    const [now, setNow] = useState(Date.now())

    function getCurrentStatusSeconds(statusUpdatedAtUtc: string) {
        const statusUpdatedAt = new Date(statusUpdatedAtUtc).getTime()
        return Math.floor((now - statusUpdatedAt) / 1000)
    }

    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000)
        return () => window.clearInterval(timer)
    }, [])

    return (
        <div className="overview screen">
            <div className="left-content">
                {/* search */}
                <input
                    type="text"
                    placeholder="Search production lines..."
                    onChange={(e) => {
                        const searchTerm = e.target.value.toLowerCase()
                        setProductionLines(
                            mockProductionLines.filter((line) =>
                                line.Name.toLowerCase().includes(searchTerm)
                            )
                        )
                    }}
                />
                <div className="production-line-list ">
                    <div className="production-line-list-inner scrollable">
                        {productionLines.map((line) => (
                            <div className="production-line-list-item">
                                <button key={line.Id} onClick={() => setSelectedLine(line)}>
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
            </div>
            <div className="right-content">
                {selectedLine && (
                    <div>
                        <h2>{selectedLine.Name}</h2>
                        <p>ID: {selectedLine.Id}</p>
                        <p>Status: {selectedLine.Status}</p>
                    </div>
                )}
            </div>
        </div>
    )
}