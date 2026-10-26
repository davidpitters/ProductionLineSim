import { useState } from 'react'
import type { DowntimeEvent, ProductionLine } from './interfaces/interfaces'

interface LineDetailProps {
	line: ProductionLine
	events: DowntimeEvent[]
	onBack: () => void
	getStatusClass: (reason: string) => string
}

interface EventRow {
	event: DowntimeEvent
	durationSeconds: number
}

const toLocalDateTimeInput = (value: Date): string => {
	const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
	return local.toISOString().slice(0, 16)
}

const getDatePart = (value: string): string => value.slice(0, 10)

const getTimePart = (value: string): string => value.slice(11, 16)

const updateDateTimePart = (current: string, part: 'date' | 'time', value: string): string => {
	const date = part === 'date' ? value : getDatePart(current)
	const time = part === 'time' ? value : getTimePart(current)
	return `${date}T${time}`
}

const parseLocalDateTime = (value: string): number | null => {
	const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
	if (!match) return null

	const [year, month, day, hour, minute] = match.slice(1).map(Number)
	if (hour > 23 || minute > 59) return null

	const date = new Date(year, month - 1, day, hour, minute)
	if (
		date.getFullYear() !== year ||
		date.getMonth() !== month - 1 ||
		date.getDate() !== day ||
		date.getHours() !== hour ||
		date.getMinutes() !== minute
	) {
		return null
	}

	return date.getTime()
}

const formatDateTime = (value: string): string =>
	new Date(value).toLocaleString([], {
		year: 'numeric',
		month: 'short',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	})

const formatDuration = (totalSeconds: number): string => {
	const seconds = Math.max(0, Math.floor(totalSeconds))
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const remainder = seconds % 60

	return [hours, minutes, remainder]
		.map((value) => String(value).padStart(2, '0'))
		.join(':')
}

export function LineDetail({ line, events, onBack, getStatusClass }: LineDetailProps) {
	const initialTo = new Date()
	const [from, setFrom] = useState(
		toLocalDateTimeInput(new Date(initialTo.getTime() - 8 * 60 * 60 * 1000)),
	)
	const [to, setTo] = useState(toLocalDateTimeInput(initialTo))
	const [now] = useState(Date.now())

	const fromMs = parseLocalDateTime(from)
	const toMs = parseLocalDateTime(to)
	const validRange = fromMs !== null && toMs !== null && fromMs < toMs

	const rows: EventRow[] = fromMs !== null && toMs !== null && fromMs < toMs
		? events
				.map((event) => {
					const start = Date.parse(event.StartedAtUtc)
					const end = event.EndedAtUtc ? Date.parse(event.EndedAtUtc) : now
					const overlapStart = Math.max(start, fromMs)
					const overlapEnd = Math.min(end, toMs, now)

					return {
						event,
						durationSeconds: Math.max(0, Math.floor((overlapEnd - overlapStart) / 1000)),
					}
				})
				.filter(({ event, durationSeconds }) => {
					const startedAt = Date.parse(event.StartedAtUtc)
					return (
						startedAt >= fromMs &&
						startedAt < toMs &&
						(durationSeconds > 0 || startedAt === fromMs)
					)
				})
				.sort((a, b) => Date.parse(b.event.StartedAtUtc) - Date.parse(a.event.StartedAtUtc))
		: []

	const totalDowntimeSeconds = rows.reduce((total, row) => total + row.durationSeconds, 0)

	return (
		<section className="line-detail">
			<div className="line-detail-back-container">
				<button type="button" className="line-detail-back" onClick={onBack}>
					&lt; Back
				</button>
			</div>
			<div className="line-detail-header">
				<h1>{line.Name}</h1>
			</div>

			<div className="line-detail-date-range">
				<div className="line-detail-range-field">
					<span>From</span>
					<div className="line-detail-date-time-inputs">
						<input
							aria-label="From date"
							type="date"
							value={getDatePart(from)}
							onChange={(event) => setFrom((current) => updateDateTimePart(current, 'date', event.target.value))}
						/>
						<input
							aria-label="From time (24-hour, HH:mm)"
							type="text"
							inputMode="numeric"
							maxLength={5}
							placeholder="HH:mm"
							pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
							value={getTimePart(from)}
							onChange={(event) => setFrom((current) => updateDateTimePart(current, 'time', event.target.value))}
						/>
					</div>
				</div>
				<div className="line-detail-range-field">
					<span>To</span>
					<div className="line-detail-date-time-inputs">
						<input
							aria-label="To date"
							type="date"
							value={getDatePart(to)}
							onChange={(event) => setTo((current) => updateDateTimePart(current, 'date', event.target.value))}
						/>
						<input
							aria-label="To time (24-hour, HH:mm)"
							type="text"
							inputMode="numeric"
							maxLength={5}
							placeholder="HH:mm"
							pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
							value={getTimePart(to)}
							onChange={(event) => setTo((current) => updateDateTimePart(current, 'time', event.target.value))}
						/>
					</div>
				</div>
			</div>

			{!validRange ? (
				<p className="line-detail-validation">Enter valid dates and 24-hour times (HH:mm), and make sure From is earlier than To.</p>
			) : (
				<>
					<div className="line-detail-summary">
						<div className="line-detail-stat">
							<span>Total Downtime</span>
							<strong>{formatDuration(totalDowntimeSeconds)}</strong>
						</div>
						<div className="line-detail-stat">
							<span>Event Count</span>
							<strong>{rows.length}</strong>
						</div>
					</div>

					<div className="line-detail-table-container">
						<table className="line-detail-table">
							<thead>
								<tr>
									<th>Event</th>
									<th>Start Time</th>
									<th>Duration</th>
									<th>Reason</th>
								</tr>
							</thead>
							<tbody>
								{rows.map(({ event, durationSeconds }) => (
									<tr key={event.Id}>
										<td>
											<span className={`line-detail-event ${getStatusClass(event.Reason)}`}>
												{event.SourceEventId}
											</span>
										</td>
										<td>{formatDateTime(event.StartedAtUtc)}</td>
										<td>{formatDuration(durationSeconds)}</td>
										<td>{event.Reason}</td>
									</tr>
								))}
								{rows.length === 0 && (
									<tr>
										<td colSpan={4} className="line-detail-empty">No events in this period.</td>
									</tr>
								)}
							</tbody>
						</table>
					</div>
				</>
			)}
		</section>
	)
}