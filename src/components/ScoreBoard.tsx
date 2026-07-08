import { BusType, COLOURS, type Colour, type GameState } from "@/lib/game";

const COLOUR_LABELS: Record<Colour, string> = {
  Red: "레드",
  Purple: "퍼플",
  Yellow: "옐로",
  Green: "그린",
  Blue: "블루",
};

const FACING_LABELS: Record<string, string> = {
  N: "북",
  E: "동",
  S: "남",
  W: "서",
};

export default function ScoreBoard({
  game,
  showBusStatus = true,
}: {
  game: GameState;
  showBusStatus?: boolean;
}) {
  const sortedColours = [...COLOURS].sort(
    (a, b) => game.teamScores[b] - game.teamScores[a]
  );

  return (
    <div className="status-panel">
      <h2>📊 팀 점수</h2>
      <div className="players-list" style={{ marginBottom: 24 }}>
        {sortedColours.map((colour) => {
          const score = game.teamScores[colour];
          const valueClass =
            score > 0
              ? "score-value-positive"
              : score < 0
              ? "score-value-negative"
              : "score-value-zero";

          return (
            <div className="score-item" key={colour}>
              <div className={`score-dot score-dot-${colour}`} />
              <span className="score-team-name">{COLOUR_LABELS[colour]}</span>
              <span className={`score-value ${valueClass}`}>
                {score > 0 ? `+${score}` : score}
              </span>
            </div>
          );
        })}
      </div>

      {showBusStatus && (
        <>
          <h2>🚌 버스 상태</h2>
          <div className="players-list">
            {([BusType.BUS1, BusType.BUS2] as const).map((busType) => {
              const bus = game.buses[busType];
              return (
                <div className="score-item" key={busType} style={{ gap: 8 }}>
                  <div
                    className={`bus-marker-${busType}`}
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      flexShrink: 0,
                      boxShadow: `var(--shadow-glow-${busType.toLowerCase()})`,
                    }}
                  />
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                      {busType} 버스
                    </div>
                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-secondary)",
                        marginTop: 2,
                      }}
                    >
                      ({bus.pos.x}, {bus.pos.y}) · {FACING_LABELS[bus.facing]} 방향 · 벽 {bus.walls.length}
                    </div>
                  </div>
                </div>
              );
            })}

            {game.subways && Object.entries(game.subways)
              .filter(([, subway]) => subway.active && subway.pos.length > 0)
              .map(([busType, subway]) => (
              <div className="score-item" key={busType} style={{ gap: 8 }}>
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: busType === BusType.BUS1 ? "var(--bus1-color)" : "var(--bus2-color)",
                  }}
                />
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                    지하철 (길이 {subway.pos.length})
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      marginTop: 2,
                    }}
                  >
                    머리: ({subway.pos[0]?.x}, {subway.pos[0]?.y}) · {FACING_LABELS[subway.facing]} 방향
                  </div>
                </div>
              </div>
            ))}
          </div>

          <h2>📝 최근 로그</h2>
          <div className="players-list" style={{ maxHeight: "200px", overflowY: "auto", fontSize: "0.8rem", textAlign: "left" }}>
            {game.logs && game.logs.slice(-10).map((log, index) => (
              <div key={index} style={{ marginBottom: 4, paddingBottom: 4, borderBottom: "1px solid var(--border-color)" }}>
                {log}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
