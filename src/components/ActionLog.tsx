import { BusType } from "@/lib/game";
import { type LogEntry } from "@/server/gameStore";

const TEAM_COLOUR_VARS: Record<string, string> = {
  Red: "var(--team-red)",
  Orange: "var(--team-orange)",
  Yellow: "var(--team-yellow)",
  Green: "var(--team-green)",
  Blue: "var(--team-blue)",
};

export default function ActionLog({ logs }: { logs: LogEntry[] }) {
  if (logs.length === 0) {
    return (
      <div className="status-panel">
        <h2>📜 액션 로그</h2>
        <p
          style={{
            fontSize: "0.85rem",
            color: "var(--text-muted)",
            textAlign: "center",
            padding: "20px 0",
          }}
        >
          아직 기록이 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="status-panel">
      <h2>📜 액션 로그</h2>
      <div className="players-list" style={{ maxHeight: 500, overflowY: "auto" }}>
        {logs.map((entry) => (
          <div
            className="score-item"
            key={entry.id}
            style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div
                className="score-dot"
                style={{
                  width: 12,
                  height: 12,
                  background: TEAM_COLOUR_VARS[entry.team] ?? "var(--text-muted)",
                }}
              />
              <span
                style={{
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  color: TEAM_COLOUR_VARS[entry.team] ?? "var(--text-primary)",
                  flex: 1,
                }}
              >
                {entry.playerId}
              </span>
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-secondary)",
                  background: "var(--bg-tertiary)",
                  padding: "2px 8px",
                  borderRadius: 12,
                }}
              >
                R{entry.round} T{entry.turn}
              </span>
            </div>

            <div style={{ paddingLeft: 20 }}>
              {entry.actions.length === 0 ? (
                <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  패스
                </div>
              ) : (
                entry.actions.map((action, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: "0.8rem",
                      color: action.applied
                        ? "var(--text-primary)"
                        : "var(--bus2-color)",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        color:
                          action.bus === BusType.BUS1
                            ? "var(--bus1-color)"
                            : "var(--bus2-color)",
                        fontWeight: "bold",
                      }}
                    >
                      {action.bus === BusType.BUS1 ? "＋" : "ー"}
                    </span>
                    <span style={{ fontWeight: 600 }}>{action.actionLabel}</span>
                    <span>{action.applied ? "✓" : `✗ ${action.reason}`}</span>
                    {action.scoreGained !== 0 && (
                      <span
                        style={{
                          color:
                            action.scoreGained > 0
                              ? "var(--bus1-color)"
                              : "var(--bus2-color)",
                          fontWeight: "bold",
                        }}
                      >
                        {action.scoreGained > 0 ? `+${action.scoreGained}` : action.scoreGained}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
