export interface AppSettings {
  pingIntervalSeconds: number;
  pingTimeoutSeconds: number;
  retentionDays: number;
  alertThreshold: number;
  aliasColor: string;
  addressColor: string;
  themeId: string;
  /** 图表视图偏好：忽略单次超时，仅连续 ≥2 次的超时计入图表与统计（应用级配置） */
  ignoreSingleTimeout: boolean;
  /** 实时图表显示的时间窗口（秒），默认 1 小时 */
  chartWindowSeconds: number;
  /** 连续失败 6 次后逐档采用的退避间隔（秒），最后一档封顶 */
  backoffIntervals: number[];
}

export const defaultBackoffIntervals = [10, 60, 180, 600, 1800, 3600];

export interface Target {
  id: string;
  address: string;
  alias: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NewTarget {
  address: string;
  alias: string;
}
export interface TargetSaveData {
  id?: string;
  address: string;
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

/** 全历史统计计数器（Rust 聚合基线 + 前端增量维护） */
export interface FullStats {
  totalCount: number;
  successCount: number;
  latencySum: number;
  latencyMax: number;
  timeoutCount: number;
  /** "忽略单次超时"口径：被非超时样本确认的连续 ≥2 超时 run 之和 */
  filteredTimeoutCount: number;
  /** 尾部未确认的超时 run 长度，随基线传递以延续状态机 */
  pendingTimeoutRun: number;
}

export interface TargetStatsEntry {
  targetId: string;
  stats: FullStats;
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
  targetStats: TargetStatsEntry[];
  pingRunning: boolean;
}

export interface HistoryFilePayload {
  path: string;
  targets: Target[];
  targetStats: TargetStatsEntry[];
}

export interface PingSampleEvent {
  sample: PingSample;
  alerting: boolean;
  notify: boolean;
  notifyAlerting: boolean;
}
