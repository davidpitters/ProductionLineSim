import { useState } from 'react'
import type { DowntimeEvent, ProductionLine } from './interfaces/interfaces'

interface LineDetailProps {
	line: ProductionLine
	events: DowntimeEvent[]
}

interface EventRow {
	event: DowntimeEvent
	durationSeconds: number
}

const toLocalDateTimeInput = (value: Date): string => {
	const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
	return local.toISOString().slice(0, 16)
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

const getStatusClass = (reason: string): string => {
	switch (reason.toLowerCase()) {
		case 'running': return 'status-running'
		case 'starved': return 'status-starved'
		case 'blocked': return 'status-blocked'
		case 'down': return 'status-down'
		default: return 'status-unknown'
	}
}

export function LineDetail({ line, events }: LineDetailProps) {
	const initialTo = new Date()
	const [from, setFrom] = useState(
		toLocalDateTimeInput(new Date(initialTo.getTime() - 8 * 60 * 60 * 1000)),
	)
	const [to, setTo] = useState(toLocalDateTimeInput(initialTo))
	const [now] = useState(Date.now())

	const fromMs = new Date(from).getTime()
	const toMs = new Date(to).getTime()
	const validRange = Number.isFinite(fromMs) && Number.isFinite(toMs) && fromMs < toMs

	const rows: EventRow[] = validRange
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
				.filter(({ event, durationSeconds }) =>
					durationSeconds > 0 || Date.parse(event.StartedAtUtc) === fromMs,
				)
				.sort((a, b) => Date.parse(b.event.StartedAtUtc) - Date.parse(a.event.StartedAtUtc))
		: []

	const totalDowntimeSeconds = rows.reduce((total, row) => total + row.durationSeconds, 0)

	return (
		<section className="line-detail">
			<h1>{line.Name}</h1>

			<div className="line-detail-date-range">
				<label>
					From
					<input type="datetime-local" value={from} onChange={(event) => setFrom(event.target.value)} />
				</label>
				<label>
					To
					<input type="datetime-local" value={to} onChange={(event) => setTo(event.target.value)} />
				</label>
			</div>

			{!validRange ? (
				<p className="line-detail-validation">Choose a valid range where From is earlier than To.</p>
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