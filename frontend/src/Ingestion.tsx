import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  fetchIngestionHealth,
  fetchIngestionMessage,
  fetchIngestionReasons,
  fetchProductionLines,
  submitMachineEvent,
} from './api'
import {
  getProductionLineStatusDisplayName,
  type IngestionHealth,
  type IngestionMessage,
  type IngestionReason,
  type MachineEventRequest,
  type ProductionLine,
} from './interfaces/interfaces'

const localDateTime = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

const createSourceEventId = () =>
  `sim-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`}`

const wait = (milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(resolve, milliseconds)
  signal.addEventListener('abort', () => {
    window.clearTimeout(timer)
    reject(new DOMException('Polling was cancelled.', 'AbortError'))
  }, { once: true })
})

const formatTime = (value: string | null) => value ? new Date(value).toLocaleString() : '—'

type DemoFailureMode = 'none' | 'transient' | 'permanent'
type DemoInterval = 1 | 5 | 10

interface DemoActivity {
  sourceEventId: string
  messageId: string | null
  lineName: string
  reason: string
  outcome: DemoFailureMode
  status: string
  attemptCount: number
  createdAt: string
  error: string | null
}

const chooseDemoOutcome = (): DemoFailureMode => {
  const value = Math.random()
  return value < 0.6 ? 'none' : value < 0.8 ? 'transient' : 'permanent'
}

const pickRandom = <T,>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)]

export function Ingestion() {
  const [lines, setLines] = useState<ProductionLine[]>([])
  const [reasons, setReasons] = useState<IngestionReason[]>([])
  const [health, setHealth] = useState<IngestionHealth | null>(null)
  const [selectedLineId, setSelectedLineId] = useState('')
  const [reason, setReason] = useState('')
  const [startedAt, setStartedAt] = useState(localDateTime(new Date()))
  const [failureMode, setFailureMode] = useState<'none' | 'transient' | 'permanent'>('none')
  const [sourceEventId, setSourceEventId] = useState('')
  const [lastSubmittedRequest, setLastSubmittedRequest] = useState<MachineEventRequest | null>(null)
  const [message, setMessage] = useState<IngestionMessage | null>(null)
  const [idempotencyResult, setIdempotencyResult] = useState<string | null>(null)
  const [isReplaying, setIsReplaying] = useState(false)
  const [lifecycle, setLifecycle] = useState<'idle' | 'submitting' | 'accepted' | 'processing' | 'processed' | 'failed'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [refreshToken, setRefreshToken] = useState(0)
  const [demoRunning, setDemoRunning] = useState(false)
  const [demoInterval, setDemoInterval] = useState<DemoInterval>(5)
  const [demoActivity, setDemoActivity] = useState<DemoActivity[]>([])
  const abortRef = useRef<AbortController | null>(null)
  const demoTrackedMessageIdsRef = useRef(new Set<string>())
  const pollingMessageIdsRef = useRef(new Set<string>())

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        setError(null)
        const [availableLines, availableReasons, queueHealth] = await Promise.all([
          fetchProductionLines(controller.signal),
          fetchIngestionReasons(controller.signal),
          fetchIngestionHealth(controller.signal),
        ])
        setLines(availableLines)
        setReasons(availableReasons)
        setHealth(queueHealth)
        setSelectedLineId((current) => current || availableLines[0]?.Id || '')
        setReason((current) => current || availableReasons[0]?.reason || '')
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load ingestion data.')
        }
      } finally {
        if (!controller.signal.aborted) setIsLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [refreshToken])

  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      for (const messageId of demoTrackedMessageIdsRef.current) {
        if (pollingMessageIdsRef.current.has(messageId)) continue
        pollingMessageIdsRef.current.add(messageId)
        void fetchIngestionMessage(messageId)
          .then((updated) => {
            if (updated.status === 'Processed' || updated.status === 'Failed') {
              demoTrackedMessageIdsRef.current.delete(messageId)
            }
            setDemoActivity((current) => current.map((activity) => activity.messageId === messageId
              ? { ...activity, status: updated.status, attemptCount: updated.attemptCount, error: updated.lastError }
              : activity))
            void fetchIngestionHealth().then(setHealth).catch(() => undefined)
          })
          .catch((pollError: unknown) => {
            setDemoActivity((current) => current.map((activity) => activity.messageId === messageId
              ? { ...activity, error: pollError instanceof Error ? pollError.message : 'Unable to refresh message status.' }
              : activity))
          })
          .finally(() => pollingMessageIdsRef.current.delete(messageId))
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!demoRunning || !lines.length || !reasons.length) return
    let cancelled = false
    let timer: number | undefined

    const submitDemoEvent = async () => {
      const line = pickRandom(lines)
      const selectedReason = pickRandom(reasons)
      const outcome = chooseDemoOutcome()
      const eventId = createSourceEventId()
      const activity: DemoActivity = {
        sourceEventId: eventId,
        messageId: null,
        lineName: line.Name,
        reason: selectedReason.reason,
        outcome,
        status: 'Submitting',
        attemptCount: 0,
        createdAt: new Date().toISOString(),
        error: null,
      }
      setDemoActivity((current) => [activity, ...current].slice(0, 10))

      try {
        const response = await submitMachineEvent({
          SourceEventId: eventId,
          LineId: line.Id,
          Reason: selectedReason.reason,
          StartedAtUtc: new Date().toISOString(),
          EndedAtUtc: null,
        }, outcome)
        demoTrackedMessageIdsRef.current.add(response.messageId)
        setDemoActivity((current) => current.map((item) => item.sourceEventId === eventId
          ? { ...item, messageId: response.messageId, status: 'Pending' }
          : item))
        void fetchIngestionHealth().then(setHealth).catch(() => undefined)
      } catch (submitError) {
        setDemoActivity((current) => current.map((item) => item.sourceEventId === eventId
          ? { ...item, status: 'Rejected', error: submitError instanceof Error ? submitError.message : 'Submission failed.' }
          : item))
      }
    }

    const scheduleNext = () => {
      timer = window.setTimeout(async () => {
        if (cancelled) return
        await submitDemoEvent()
        if (!cancelled) scheduleNext()
      }, demoInterval * 1000)
    }

    scheduleNext()
    return () => {
      cancelled = true
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [demoInterval, demoRunning, lines, reasons])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const generatedId = createSourceEventId()
    setSourceEventId(generatedId)
    setMessage(null)
    setError(null)
    setLifecycle('submitting')

    const request: MachineEventRequest = {
      SourceEventId: generatedId,
      LineId: selectedLineId,
      Reason: reason,
      StartedAtUtc: new Date(startedAt).toISOString(),
      EndedAtUtc: null,
    }
    setLastSubmittedRequest(request)
    setIdempotencyResult(null)

    try {
      const accepted = await submitMachineEvent(request, failureMode, controller.signal)
      setLifecycle('accepted')
      let latest: IngestionMessage | null = null
      for (let attempt = 0; attempt < 90; attempt += 1) {
        latest = await fetchIngestionMessage(accepted.messageId, controller.signal)
        setMessage(latest)
        if (latest.status === 'Processing' || latest.attemptCount > 0) setLifecycle('processing')
        if (latest.status === 'Processed') {
          setLifecycle('processed')
          setHealth(await fetchIngestionHealth(controller.signal))
          return
        }
        if (latest.status === 'Failed') {
          setLifecycle('failed')
          setHealth(await fetchIngestionHealth(controller.signal))
          return
        }
        await wait(500, controller.signal)
      }
      setError('The message is still queued. Use Refresh status to check it again.')
    } catch (submitError) {
      if (!controller.signal.aborted) {
        setLifecycle('failed')
        setError(submitError instanceof Error ? submitError.message : 'The machine event could not be submitted.')
      }
    }
  }

  async function replayLastRequest() {
    if (!lastSubmittedRequest || isReplaying) return
    setIsReplaying(true)
    setIdempotencyResult(null)
    try {
      const replay = await submitMachineEvent(lastSubmittedRequest, 'none')
      if (!replay.isDuplicate) {
        setIdempotencyResult('The replay was accepted as a new request. It did not match an existing source event.')
        return
      }

      const existingMessage = await fetchIngestionMessage(replay.messageId)
      setMessage(existingMessage)
      setLifecycle(existingMessage.status === 'Processed'
        ? 'processed'
        : existingMessage.status === 'Failed'
          ? 'failed'
          : existingMessage.status === 'Processing'
            ? 'processing'
            : 'accepted')
      setHealth(await fetchIngestionHealth())
      setIdempotencyResult(`Duplicate recognized: the original message ${replay.messageId} was returned. No second event was queued.`)
    } catch (replayError) {
      setIdempotencyResult(replayError instanceof Error ? replayError.message : 'Unable to replay the event.')
    } finally {
      setIsReplaying(false)
    }
  }

  async function refreshMessage() {
    if (!message) {
      setRefreshToken((value) => value + 1)
      return
    }
    try {
      const updated = await fetchIngestionMessage(message.messageId)
      setMessage(updated)
      setLifecycle(updated.status === 'Processed'
        ? 'processed'
        : updated.status === 'Failed'
          ? 'failed'
          : updated.status === 'Processing'
            ? 'processing'
            : 'accepted')
      setHealth(await fetchIngestionHealth())
      setError(null)
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : 'Unable to refresh message status.')
    }
  }

  const selectedLine = lines.find((line) => line.Id === selectedLineId)
  const selectedReason = reasons.find((item) => item.reason === reason)
  const stages = [
    { id: 'submitting', label: 'Request generated' },
    { id: 'accepted', label: 'Validated & accepted' },
    { id: 'processing', label: 'Queue processing' },
    { id: 'processed', label: 'Processed' },
  ] as const
  const stageRank: Record<typeof lifecycle, number> = {
    idle: -1,
    submitting: 0,
    accepted: 1,
    processing: 2,
    processed: 3,
    failed: message?.attemptCount ? 2 : 0,
  }

  return (
    <div className="ingestion-screen screen">
      <header className="ingestion-header">
        <div>
          <p className="ingestion-eyebrow">MACHINE EVENT SIMULATOR</p>
          <h1>Ingestion</h1>
          <p>Send a machine event through validation and the processing queue.</p>
        </div>
        <button type="button" className="ingestion-refresh" onClick={() => void refreshMessage()}>
          Refresh status
        </button>
      </header>

      {error && <div className="ingestion-alert" role="alert">{error}</div>}
      {isLoading ? <p role="status">Loading lines and ingestion service…</p> : (
        <>
        <section className="ingestion-card ingestion-demo-card" aria-labelledby="running-demo-title">
          <div className="ingestion-demo-header">
            <div className="ingestion-demo-title">
              <span className={`ingestion-demo-indicator${demoRunning ? ' is-running' : ''}`} aria-hidden="true" />
              <div>
                <p className="ingestion-eyebrow">AUTOMATED TEST STREAM</p>
                <h2 id="running-demo-title">Running ingestion</h2>
                <p>Generate randomized machine events continuously to exercise the queue.</p>
              </div>
            </div>
            <div className="ingestion-demo-controls">
              <label>
                Submit every
                <select
                  value={demoInterval}
                  disabled={demoRunning}
                  onChange={(event) => setDemoInterval(Number(event.target.value) as DemoInterval)}
                >
                  <option value={1}>1 second</option>
                  <option value={5}>5 seconds</option>
                  <option value={10}>10 seconds</option>
                </select>
              </label>
              {demoRunning ? (
                <button type="button" className="ingestion-demo-stop" onClick={() => setDemoRunning(false)}>
                  <span aria-hidden="true">■</span> Stop demo
                </button>
              ) : (
                <button type="button" className="ingestion-demo-start" disabled={!lines.length || !reasons.length} onClick={() => setDemoRunning(true)}>
                  <span aria-hidden="true">▶</span> Start demo
                </button>
              )}
            </div>
          </div>
          <div className="ingestion-demo-summary">
            <span className="ingestion-demo-running-state"><i className={demoRunning ? 'is-running' : ''} />{demoRunning ? `Running · next event in ${demoInterval}s` : 'Stopped'}</span>
            <span>Outcomes: <strong>60% success</strong> · 20% transient · 20% permanent</span>
            <span>Ongoing events · {demoActivity.length} of 10 shown</span>
          </div>
          {demoActivity.length > 0 ? (
            <div className="ingestion-demo-activity-wrap">
              <div className="ingestion-demo-activity-heading"><h3>Recent demo events</h3><span>Latest 10</span></div>
              <div className="ingestion-demo-activity-list">
                {demoActivity.map((item) => (
                  <article className="ingestion-demo-activity" key={item.sourceEventId}>
                    <div className="ingestion-demo-event-main">
                      <span className={`ingestion-queue-pill status-text-${item.status.toLowerCase()}`}>{item.status}</span>
                      <strong>{item.lineName}</strong>
                      <span>{item.reason}</span>
                      <span className={`ingestion-demo-outcome outcome-${item.outcome}`}>{item.outcome === 'none' ? 'Success path' : `${item.outcome} failure`}</span>
                    </div>
                    <div className="ingestion-demo-event-detail">
                      <code title={item.sourceEventId}>{item.sourceEventId}</code>
                      <span>{item.attemptCount} {item.attemptCount === 1 ? 'attempt' : 'attempts'}</span>
                      <time dateTime={item.createdAt}>{formatTime(item.createdAt)}</time>
                    </div>
                    {item.error && <p className={`ingestion-demo-event-error${item.status === 'Pending' ? ' is-retry' : ''}`}>{item.error}</p>}
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <p className="ingestion-demo-empty">No demo events yet. Start the demo to submit the first randomized event after the selected interval.</p>
          )}
        </section>

        <div className="ingestion-layout">
          <section className="ingestion-card ingestion-form-card">
            <div className="ingestion-card-heading">
              <span className="ingestion-step-number">01</span>
              <div><h2>Compose event</h2><p>Choose what the simulated machine reports.</p></div>
            </div>
            <form className="ingestion-form" onSubmit={(event) => void handleSubmit(event)}>
              <label>
                Production line
                <select required value={selectedLineId} onChange={(event) => setSelectedLineId(event.target.value)}>
                  {lines.map((line) => <option key={line.Id} value={line.Id}>{line.Name}</option>)}
                </select>
              </label>
              <label>
                Event cause
                <select required value={reason} onChange={(event) => setReason(event.target.value)}>
                  {reasons.map((item) => <option key={item.reason} value={item.reason}>{item.reason} · {getProductionLineStatusDisplayName(item.status)}</option>)}
                </select>
              </label>
              <div className="ingestion-impact" aria-live="polite">
                <span className={`ingestion-status-dot status-${selectedReason ? getProductionLineStatusDisplayName(selectedReason.status).toLowerCase() : 'unknown'}`} />
                <span>Expected line impact</span>
                <strong>{selectedReason ? getProductionLineStatusDisplayName(selectedReason.status) : '—'}</strong>
              </div>
              <label>
                Event start time
                <input type="datetime-local" required value={startedAt} onChange={(event) => setStartedAt(event.target.value)} />
              </label>
              <label>
                Processing simulation
                <select value={failureMode} onChange={(event) => setFailureMode(event.target.value as typeof failureMode)}>
                  <option value="none">Normal processing</option>
                  <option value="transient">Transient failure · retry then succeed</option>
                  <option value="permanent">Permanent failure · stop processing</option>
                </select>
                <small>Failure modes are for demonstrating queue behavior; they do not create downtime events.</small>
              </label>
              <div className="ingestion-event-preview">
                <span className="ingestion-preview-icon" aria-hidden="true">↗</span>
                <span><strong>Ongoing event</strong><small>End time is left open until the event is resolved.</small></span>
              </div>
              <button className="ingestion-submit" type="submit" disabled={!lines.length || !reasons.length || lifecycle === 'submitting' || lifecycle === 'accepted' || lifecycle === 'processing'}>
                {lifecycle === 'submitting' ? 'Submitting event…' : 'Spawn machine event'}
                <span aria-hidden="true">→</span>
              </button>
            </form>
          </section>

          <div className="ingestion-side-column">
            <section className="ingestion-card ingestion-lifecycle-card">
              <div className="ingestion-card-heading">
                <span className="ingestion-step-number">02</span>
                <div><h2>Processing lifecycle</h2><p>Live status from the ingestion queue.</p></div>
              </div>
              {sourceEventId ? <div className="ingestion-event-id"><span>Source event ID</span><code>{sourceEventId}</code></div> : (
                <div className="ingestion-empty-state"><span aria-hidden="true">◉</span><p>Spawn an event to watch it move through the system.</p></div>
              )}
              <ol className="ingestion-steps">
                {stages.map((stage, index) => {
                  const complete = stageRank[lifecycle] > index || lifecycle === 'processed'
                  const active = stageRank[lifecycle] === index && lifecycle !== 'failed'
                  return <li key={stage.id} className={`${complete ? 'is-complete' : ''} ${active ? 'is-active' : ''}`}>
                    <span className="ingestion-stage-marker">{complete ? '✓' : index + 1}</span>
                    <span>{stage.label}</span>
                  </li>
                })}
              </ol>
              {lifecycle === 'failed' && <div className="ingestion-failed-note"><strong>{message?.status === 'Failed' ? 'Queue processing failed' : 'Request was not accepted'}</strong><span>{message?.lastError ?? error ?? 'Check the API response and try again.'}</span></div>}
              {message?.lastError && message.status === 'Pending' && <div className="ingestion-retry-note"><strong>Retry scheduled</strong><span>{message.lastError}</span></div>}
              {message && <div className="ingestion-message-meta">
                <div><span>Queue status</span><strong className={`ingestion-message-status status-text-${message.status.toLowerCase()}`}>{message.status}</strong></div>
                <div><span>Attempts</span><strong>{message.attemptCount}</strong></div>
                <div><span>Accepted</span><strong>{formatTime(message.createdAtUtc)}</strong></div>
                <div><span>Last attempt</span><strong>{formatTime(message.lastAttemptedAtUtc)}</strong></div>
                {message.processedAtUtc && <div><span>Processed</span><strong>{formatTime(message.processedAtUtc)}</strong></div>}
              </div>}
              <div className="ingestion-idempotency-demo">
                <button
                  type="button"
                  className="ingestion-idempotency-button"
                  disabled={!lastSubmittedRequest || isReplaying || lifecycle === 'submitting'}
                  onClick={() => void replayLastRequest()}
                >
                  {isReplaying ? 'Replaying same request…' : 'Replay same event (idempotency demo)'}
                </button>
                <small>This resends the last event with the exact same source event ID and payload.</small>
                {idempotencyResult && <p role="status">{idempotencyResult}</p>}
              </div>
              {lifecycle === 'processed' && <div className="ingestion-success-note"><strong>{selectedLine?.Name ?? 'Production line'} updated</strong><span>{reason} was recorded. Open Lines to view the updated timeline and status.</span></div>}
            </section>

            <section className="ingestion-card ingestion-health-card">
              <div className="ingestion-health-heading"><div><h2>Queue overview</h2><p>Current message totals</p></div><span className="ingestion-live-dot">LIVE</span></div>
              <div className="ingestion-health-grid">
                <div><strong>{health?.pending ?? '—'}</strong><span>Pending</span></div>
                <div><strong>{health?.processing ?? '—'}</strong><span>Processing</span></div>
                <div><strong>{health?.processed ?? '—'}</strong><span>Processed</span></div>
                <div><strong>{health?.failed ?? '—'}</strong><span>Failed</span></div>
              </div>
              {health?.recentMessages.length ? <div className="ingestion-recent">
                <h3>Recent messages</h3>
                {health.recentMessages.slice(0, 5).map((item) => <div className="ingestion-recent-row" key={item.messageId}>
                  <span className={`ingestion-queue-pill status-text-${item.status.toLowerCase()}`}>{item.status}</span>
                  <code title={item.sourceEventId}>{item.sourceEventId}</code>
                  <span>{item.attemptCount} {item.attemptCount === 1 ? 'attempt' : 'attempts'}</span>
                </div>)}
              </div> : <p className="ingestion-no-messages">No messages have been submitted yet.</p>}
            </section>
          </div>
        </div>
        </>
      )}
    </div>
  )
}
