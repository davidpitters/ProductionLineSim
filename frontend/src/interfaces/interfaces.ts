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
  MessageId: string;
  SourceEventId: string;
  Status: string;
  AttemptCount: number;
  CreatedAtUtc: string;
  LastAttemptedAtUtc: string | null;
  LastError: string | null;
  ProcessedAtUtc: string | null;
  PayloadJson: string | null;
  PayloadHash: string | null;
  FailureMode: string | null;
}

export interface IngestionHealth {
  Pending: number;
  Processing: number;
  Processed: number;
  Failed: number;
  RecentMessages: ReadonlyArray<IngestionMessage>;
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
  MessageId: string;
  SourceEventId: string;
  Status: MessageStatus;
  IsDuplicate: boolean;
}

export interface ReasonBreakdown {
  Reason: string;
  EventCount: number;
  TotalDowntimeSeconds: number;
}