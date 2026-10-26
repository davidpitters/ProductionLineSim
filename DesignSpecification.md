# Project: Production Line Downtime Dashboard

Act as a senior full-stack software engineer and solution architect. Build a complete, runnable take-home project for a Senior Software Developer interview at ZPI / ProMach.

The application is a Production Line Downtime Dashboard. The goal is to demonstrate strong software engineering fundamentals, industrial-system architecture awareness, reliability, testability, and the ability to build a React/TypeScript frontend backed by a .NET API.

Do not merely provide a plan or code snippets. Create the actual project files in the current workspace, build the application, run automated tests, fix errors, and document how to run everything locally.

Work incrementally. Inspect the existing workspace first, then implement and verify the solution in manageable stages. Do not overwrite existing user files without checking them.

## 1. Business requirements

Build a dashboard that lets a user:

- View a list of production lines and their current statuses.
- Select a production line and a start/end time range.
- View total downtime and downtime event count for the selected line and period.
- View downtime events in a table, including reason, start time, end time, and duration.
- View a breakdown of downtime by reason: Down, Starved, and Blocked.
- See ingestion pipeline health, including pending, processing, processed, and failed messages.
- Inspect ingestion failures and understand why messages failed.
- Submit or simulate machine events to demonstrate the ingestion pipeline.

Use deterministic sample data representing several production lines and realistic downtime events.

The dashboard must be functional, not a static mockup.

## 2. Required technology stack

Frontend:
- React
- TypeScript with strict type checking
- Vite
- Functional components and React hooks
- Standard CSS or CSS modules
- Fetch-based typed API client

Backend:
- ASP.NET Core Web API using the installed, supported .NET SDK
- C#
- SQLite for persistent storage
- Entity Framework Core with SQLite, if compatible with the selected SDK
- A hosted BackgroundService for asynchronous queue processing
- Dependency injection
- Built-in logging and structured error handling

Testing:
- xUnit for backend tests
- Appropriate test tooling for the frontend, such as Vitest, where useful

Use stable, compatible package versions. Inspect the installed .NET SDK before selecting the target framework. Do not introduce unnecessary dependencies or external infrastructure.

The project must run locally without requiring Docker, SQL Server, RabbitMQ, Azure, credentials, or external services.

## 3. Architecture

Separate the system into these logical responsibilities:

1. Ingestion API: accepts incoming machine events, validates them, and durably enqueues them.
2. Durable queue: persists messages in SQLite before acknowledging successful acceptance.
3. Background processor: retrieves queued messages and processes them asynchronously.
4. Processed event storage: stores validated downtime events with stable source identifiers.
5. Reporting API: returns production lines, filtered downtime events, summaries, and reason breakdowns.
6. React frontend: consumes the API and presents the dashboard and ingestion health.

Keep the architecture appropriately small for an interview exercise. Use clear separation of concerns without unnecessary abstractions, microservices, repositories, or generic frameworks.

Include a concise Mermaid architecture diagram in the README.

## 4. Ingestion API and event contract

Create an endpoint such as:

POST /api/ingestion/events

Accept a payload containing:

- sourceEventId: stable unique identifier assigned by the originating machine or integration.
- lineId: production line identifier.
- reason: Down, Starved, or Blocked.
- startedAtUtc: event start timestamp.
- endedAtUtc: nullable event end timestamp, where null means the event is still ongoing.
- receivedAtUtc: assigned by the server rather than trusted from the client.

Validate required fields, known lines, valid reasons, and timestamps. Reject invalid payloads with useful validation responses.

Use UTC consistently. Document the timestamp format and reporting interval semantics.

An event with an end timestamp must have an end later than its start. Handle ongoing events explicitly.

If the API accepts a message for asynchronous processing, return HTTP 202 Accepted only after the message has been durably persisted in the queue. Include a message or event identifier that lets the client correlate the submission with its processing status.

## 5. Durable queue

Implement a SQLite-backed queue rather than an in-memory Channel as the sole storage mechanism. The queue must survive application restarts.

A queue message should include fields equivalent to:

- Internal message ID
- Source event ID
- Serialized payload
- Processing status
- Attempt count
- Created timestamp
- Last attempted timestamp
- Last error
- Processed timestamp, if applicable

Support these states:

- Pending
- Processing
- Processed
- Failed

The ingestion endpoint should validate and persist a message transactionally before acknowledging it.

Implement a BackgroundService that:

- Claims pending messages safely.
- Processes messages asynchronously.
- Updates queue state.
- Logs useful processing information.
- Retries transient failures with a bounded retry policy and a small delay.
- Marks permanently invalid messages as failed.
- Makes failures inspectable through an API endpoint.
- Does not busy-spin when the queue is empty.

Do not use unbounded retries. Do not silently discard failed messages.

For a single-instance local application, keep concurrency management simple but correct. Explain how queue claiming and locking would need to evolve for multiple application instances.

## 6. Idempotency and duplicate handling

This is a major evaluation criterion.

Implement idempotency using sourceEventId as the stable identity of an incoming event.

Enforce uniqueness in SQLite using database constraints. Do not rely solely on an in-memory dictionary or a preliminary lookup.

Required behavior:

1. First submission of a new sourceEventId:
   - Persist the message.
   - Return an accepted response.
   - Process it into exactly one downtime event.

2. Resubmission of the same sourceEventId with the same logical payload:
   - Do not create another queue item or downtime record.
   - Return a documented duplicate response that lets the client identify the original message.

3. Resubmission of the same sourceEventId with a different payload:
   - Do not overwrite the original event.
   - Return a clear conflict response, such as HTTP 409 Conflict.

4. Concurrent duplicate submissions:
   - Database uniqueness constraints must prevent duplicates even if requests arrive simultaneously.
   - Handle uniqueness violations gracefully rather than returning an unhandled server error.

5. Duplicate processing:
   - If a worker retries a message that has already been committed, the event must not be inserted again.

Use a canonical representation or stable payload fingerprint to compare duplicate submissions. Normalize timestamps to UTC and ensure logically equivalent representations are handled consistently.

Do not confuse message delivery with exactly-once processing. Explain that the design uses at-least-once processing with idempotent effects and transactional safeguards.

Ensure the transaction boundary is correct: processing an event and marking its queue message as processed must be atomic, so a crash cannot leave a committed event paired with a misleading queue state.

## 7. Failure recovery and reliability

Demonstrate failure handling rather than merely documenting it.

Implement or provide a controlled development/test mechanism for simulating a transient processing failure. Do not make the normal happy path unreliable.

Verify that:

- A queued message survives an application restart.
- A transient processing failure is retried.
- A message is not processed twice into separate event records.
- A permanently failing message becomes inspectable in the failed state.
- An application restart can recover messages left in Processing by a previous process.
- The UI distinguishes accepted, pending, processed, and failed messages.

If a queue message is left in Processing after a crash, implement a safe recovery strategy appropriate for a single-instance application, such as reclaiming stale Processing messages on startup.

Avoid claiming guarantees that the implementation does not actually provide.

## 8. Reporting API

Implement endpoints equivalent to:

GET /api/lines

GET /api/lines/{lineId}/downtime?from={utcTimestamp}&to={utcTimestamp}

GET /api/ingestion/health

GET /api/ingestion/messages/{messageId}

GET /api/ingestion/failed

POST /api/ingestion/events

You may add a small endpoint for demonstrating or resetting deterministic sample data if useful, but do not add unnecessary endpoints.

The downtime reporting response should include:

- Matching downtime events
- Total downtime in seconds
- Event count
- Downtime total and event count grouped by reason

Use consistent DTOs and meaningful HTTP status codes. Validate the selected line and time range. Return appropriate responses for unknown lines and invalid ranges.

The UI should retrieve summary calculations from the API rather than reimplementing business logic in React.

## 9. Downtime calculation rules

Implement and test these rules carefully.

- Use UTC internally.
- Treat reporting intervals as half-open: [from, to). The start is inclusive and the end is exclusive.
- Reject a reporting range where from is greater than or equal to to.
- Include events that overlap the reporting interval.
- Calculate each event's contribution using its overlap with the selected reporting interval.
- An event that begins before the reporting period contributes only the overlapping portion.
- An event that ends after the reporting period contributes only the overlapping portion.
- For ongoing events, use the earlier of the reporting period end and the current UTC time as the effective end.
- Do not count future time as downtime.
- Document whether event count represents distinct events overlapping the period, rather than a count of event fragments.
- Aggregate by reason using the clipped duration.
- Ensure the reason breakdown's durations sum to the overall total, allowing only the documented rounding behavior.
- Do not silently double-count overlapping events when claiming to measure unique production-line unavailability. For this exercise, event downtime may be summed per event, but clearly document that this is not necessarily unique unavailable wall-clock time.

Keep calculation logic independently testable.

## 10. Current production line status

Provide deterministic current status for each production line.

Do not derive current status solely from whether any historical downtime event overlaps the selected reporting period.

Clearly distinguish:
- Current line status.
- Historical downtime event data.
- Reporting-period aggregates.

Use simple, documented sample data. Do not build a complex real-time state machine unless needed.

## 11. React dashboard

Build a clean, professional industrial monitoring dashboard.

Prioritize information hierarchy, clarity, and functional behavior over elaborate styling.

Include:

### Production line list
- Several production lines.
- Current status indicators.
- Selection of the active line.
- A clear indication of which line is selected.

### Reporting controls
- Start and end date/time controls.
- Validation for invalid ranges.
- Loading, error, and empty states.
- Refresh behavior.

### Summary cards
- Total downtime.
- Number of downtime events.
- Current selected line status.

### Downtime event table
- Reason.
- Event start and end.
- Duration within the selected period.
- Clear formatting for ongoing events.

### Reason breakdown
- Totals for Down, Starved, and Blocked.
- Event counts.
- A simple chart or clear visual comparison, with an accessible alternative.

### Ingestion health
- Pending, Processing, Processed, and Failed counts.
- A list of recent messages and their states.
- A clear view of failure reasons.
- A way to submit deterministic demonstration events.
- A way to resubmit an event with the same ID to demonstrate idempotency.
- An explicit way to trigger the controlled failure scenario in development mode, if implemented.

Make API calls through a small typed client. Use appropriate loading and error handling. Avoid unnecessary state-management libraries.

The application should be responsive and accessible. Do not prioritize animation or decorative visual effects over usability.

## 12. Sample data and demo workflow

Seed a small deterministic dataset containing several production lines and a range of downtime reasons and timestamps.

Provide a straightforward demonstration workflow:

1. Start the API and frontend.
2. Open the dashboard.
3. Select a line and a reporting period.
4. Review the summary and downtime breakdown.
5. Submit a new machine event.
6. Observe the event move through the ingestion queue.
7. Submit the same event again and demonstrate that it is not counted twice.
8. Submit a conflicting payload with the same sourceEventId and demonstrate the conflict response.
9. Trigger a transient failure, if supported, and observe a retry.
10. Demonstrate that queued data survives an API restart.

Make the demo reproducible. Explain any startup seeding behavior and ensure restarts do not unintentionally duplicate seeded events.

## 13. Automated tests

Create meaningful automated tests and run them.

At minimum, cover:

### Downtime calculation
- Normal event entirely within the selected period.
- Event overlapping the start boundary.
- Event overlapping the end boundary.
- Event completely outside the selected period.
- Ongoing event.
- Invalid reporting interval.
- Aggregation totals by reason.

### Idempotency
- First submission is accepted.
- Same ID and same payload does not create a duplicate.
- Same ID and conflicting payload is rejected.
- Concurrent duplicate submissions do not create multiple events.
- Reprocessing a message does not create another event.

### Queue reliability
- Pending message is processed.
- Transient failure is retried.
- Permanent failure becomes inspectable.
- Pending messages survive restart.
- Stale Processing messages are recovered after restart.

Use integration tests with a temporary SQLite database for database-specific guarantees. Do not rely only on EF Core's InMemory provider to test uniqueness constraints or SQLite transactions.

Keep tests deterministic and avoid fragile timing-based assertions. Use controllable delays, injected clocks, or test hooks where appropriate.

Also add frontend tests for important rendering and interaction behavior if time permits.

## 14. Logging, errors, and operational quality

Use structured logging for:

- Message accepted.
- Duplicate detected.
- Processing started and completed.
- Retry scheduled.
- Message permanently failed.
- Invalid payload.
- Reporting request failures.

Never log secrets or unnecessarily dump entire payloads.

Provide clear error responses. Avoid swallowing exceptions silently. Keep development-only diagnostic features disabled in production configuration.

Use configuration for database paths, retry limits, and worker polling intervals where practical. Choose safe defaults.

## 15. README and interview documentation

Create a polished README that includes:

1. Project purpose and scope.
2. Architecture diagram.
3. Technology choices and justification.
4. How to run the application locally.
5. How to run the tests.
6. API endpoint overview with example requests and responses.
7. Data model.
8. Downtime calculation and time-range semantics.
9. Queue states and retry behavior.
10. Idempotency strategy and database constraints.
11. Failure recovery and transaction boundaries.
12. Limitations and future production improvements.
13. A short demonstration walkthrough.
14. A section explaining what was deliberately kept out of scope.

Clearly distinguish implemented behavior from future recommendations.

Discuss potential production extensions such as:
- Industrial protocol adapters or OPC UA integrations.
- A dedicated message broker such as Azure Service Bus or RabbitMQ.
- SQL Server for larger-scale operational and historical reporting.
- Monitoring, metrics, alerting, and queue-depth monitoring.
- Authentication and authorization.
- Retention policies and historical aggregation.
- SignalR for genuinely real-time dashboard updates.
- Multi-instance queue coordination.

Do not claim that these features have been implemented if they have not.

## 16. Implementation and verification workflow

Follow this sequence:

Phase 1: Inspect the workspace, available SDKs, and installed tools. Create a concise implementation plan.

Phase 2: Scaffold the backend, database schema, ingestion endpoint, durable queue, and reporting logic.

Phase 3: Implement the background worker, idempotency, transactions, retries, and recovery.

Phase 4: Implement and run backend unit and integration tests. Fix failures before moving on.

Phase 5: Create the React/TypeScript frontend and connect it to the actual API.

Phase 6: Run the frontend tests and production build. Verify the complete user flow.

Phase 7: Write the README, check the run instructions, and summarize remaining limitations.

After each phase:
- Build or run the relevant tests.
- Fix errors before proceeding.
- Keep the solution compiling.
- Avoid unrelated refactoring.
- Explain significant design decisions in short comments or documentation where useful.

Do not stop after generating files. Run the available build and test commands, inspect the results, and fix the issues you can reproduce.

If a command fails because of a missing SDK, package, or environment limitation, report the exact issue and provide the narrowest practical workaround rather than pretending verification succeeded.

Do not invent successful test results.

## 17. Constraints and priorities

The project should be impressive because it is correct, understandable, and thoughtfully designed—not because it has the most files or the most infrastructure.

Prioritize in this order:

1. Correctness of downtime reporting.
2. Durable ingestion.
3. Database-enforced idempotency.
4. Correct transaction boundaries and recovery.
5. Automated tests.
6. Functional React dashboard.
7. Documentation and a clear demonstration.
8. Visual polish and optional enhancements.

Keep the solution simple enough that a senior developer can understand it quickly and that I can explain every significant decision during an in-person technical interview.

Use AI to accelerate implementation, but do not obscure the architecture with unnecessary abstractions or generated boilerplate.

Start by inspecting the workspace and available SDKs, then implement the project end to end.