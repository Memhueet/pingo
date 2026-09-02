import { GlassCard } from "./GlassCard";

interface LogEntry {
  id: number;
  time: Date;
  message: string;
  type: "success" | "timeout" | "error" | "info";
}

export function EventLog({ entries }: { entries: LogEntry[] }) {
  return (
    <GlassCard className="eventLog" cornerRadius={0}>
      <div className="eventLogHeader">
        <span>消息动态</span>
      </div>
      <div className="eventLogContent">
        {entries.length === 0 ? (
          <div className="eventLogEmpty">暂无消息</div>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className={`eventLogEntry ${entry.type}`}>
              <span className="eventTime">
                {entry.time.toLocaleTimeString()}
              </span>
              <span className="eventMessage">{entry.message}</span>
            </div>
          ))
        )}
      </div>
    </GlassCard>
  );
}
