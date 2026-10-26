// C# Guid values are represented as UUID strings.
// DateTimeOffset and DateOnly values are represented as ISO strings.
// C# long values are represented as numbers; these values should remain
// within JavaScript's safe integer range.

export enum ProductionLineStatus {
  Running = 0,
  Starved = 1,
  Blocked = 2,
  Down = 3,
}

export enum MessageStatus {
  Pending = 0,
  Processing = 1,
  Processed = 2,
  Failed = 3,
}

export const ProductionLineStatusDisplayNames: Record<
  ProductionLineStatus,
  string
> = {
  [ProductionLineStatus.Running]: "Running",
  [ProductionLineStatus.Starved]: "Starved",
  [ProductionLineStatus.Blocked]: "Blocked",
  [ProductionLineStatus.Down]: "Down",
};

export const MessageStatusDisplayNames: Record<MessageStatus, string> = {
  [MessageStatus.Pending]: "Pending",
  [MessageStatus.Processing]: "Processing",
  [MessageStatus.Processed]: "Processed",
  [MessageStatus.Failed]: "Failed",
};

export function getProductionLineStatusDisplayName(
  status: ProductionLineStatus,
): string {
  return ProductionLineStatusDisplayNames[status];
}

export function parseProductionLineStatusDisplayName(
  displayName: string,
): ProductionLineStatus {
  const entry = Object.entries(ProductionLineStatusDisplayNames).find(
    ([, name]) => name === displayName,
  );

  if (!entry) {
    throw new Error(
      `No ProductionLineStatus value has display name '${displayName}'.`,
    );
  }

  return Number(entry[0]) as ProductionLineStatus;
}

export interface ApiError {
  readonly Error: string;
  readonly Detail: string | null;
}

export interface IngestionMessage {
  messageId: string;
  sourceEventId: string;
  status: IngestionStatus;
  attemptCount: number;
  createdAtUtc: string;
  lastAttemptedAtUtc: string | null;
  lastError: string | null;
  processedAtUtc: string | null;
  payloadJson: string | null;
  payloadHash: string | null;
  failureMode: string | null;
}

export type IngestionStatus = 'Pending' | 'Processing' | 'Processed' | 'Failed';

export interface IngestionHealth {
  pending: number;
  processing: number;
  processed: number;
  failed: number;
  recentMessages: ReadonlyArray<IngestionMessage>;
}

export interface IngestionReason {
  reason: string;
  status: ProductionLineStatus;
}

export interface DowntimeReport {
  LineId: string;
  FromUtc: string;
  ToUtc: string;
  EventCount: number;
  TotalDowntimeSeconds: number;
  Events: ReadonlyArray<DowntimeEvent>;
  Breakdown: ReadonlyArray<ReasonBreakdown>;
}

export interface DowntimeEvent {
  Id: string;
  SourceEventId: string;
  Reason: string;
  Status: ProductionLineStatus;
  StartedAtUtc: string;
  EndedAtUtc: string | null;
  DurationSeconds: number;
  IsOngoing: boolean;
}

export interface ProductionLine {
  Id: string;
  Name: string;
  Status: ProductionLineStatus;
  StatusUpdatedAtUtc: string;
}

export interface MachineEventRequest {
  SourceEventId: string;
  LineId: string;
  Reason: string;
  StartedAtUtc: string;
  EndedAtUtc: string | null;
}

export interface MachineEventResponse {
  messageId: string;
  sourceEventId: string;
  status: number | string;
  isDuplicate: boolean;
}

export interface ReasonBreakdown {
  Reason: string;
  EventCount: number;
  TotalDowntimeSeconds: number;
}

export interface LogPage<T> {
  items: ReadonlyArray<T>
  limit: number
  offset: number
  hasMore: boolean
}

export interface MachineEventLogEntry {
  id: string
  sourceEventId: string
  lineId: string
  lineName: string
  reason: string
  status: string
  startedAtUtc: string
  endedAtUtc: string | null
  receivedAtUtc: string
}

export interface IngestionLogEntry {
  messageId: string
  sourceEventId: string
  status: string
  attemptCount: number
  createdAtUtc: string
  lastAttemptedAtUtc: string | null
  lastError: string | null
  processedAtUtc: string | null
}