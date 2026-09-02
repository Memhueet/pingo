export interface AppSettings {
  pingIntervalSeconds: number;
  pingTimeoutSeconds: number;
  retentionDays: number;
  alertThreshold: number;
  aliasColor: string;
  ipv4Color: string;
  themeId: string;
}

export interface Target {
  id: string;
  ipv4: string;
  alias: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NewTarget {
  ipv4: string;
  alias: string;
}
export interface TargetSaveData {
  id?: string;
  ipv4: string;
  alias: string;
}


export type PingStatus = "success" | "timeout" | "error";

export interface PingSample {
  id: string;
  targetId: string;
  sentAt: string;
  status: PingStatus;
  latencyMs: number | null;
  errorKind: string | null;
}

export interface TargetStatus {
  target: Target;
  latestSample: PingSample | null;
  consecutiveTimeouts: number;
  alerting: boolean;
  samples: PingSample[];
}

export interface BootstrapPayload {
  settings: AppSettings;
  targets: Target[];
  pingRunning: boolean;
}

export interface HistoryFilePayload {
  path: string;
  targets: Target[];
}

export interface PingSampleEvent {
  sample: PingSample;
  alerting: boolean;
  notify: boolean;
  notifyAlerting: boolean;
}
