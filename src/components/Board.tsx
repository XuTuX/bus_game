import { BusType, BOARD_SIZE, type Coord, type GameState, type Wall } from "@/lib/game";

const FACING_ROTATION: Record<string, number> = {
  N: -90,
  E: 0,
  S: 90,
  W: 180,
};

export default function Board({
  game,
  showFacing = false,
  showFacingFor,
  subwayPreview,
}: {
  game: GameState;
  showFacing?: boolean;
  showFacingFor?: BusType;
  subwayPreview?: {
    path: Coord[];
    finalPositions: Coord[];
  };
}) {
  const tileSize = 56;
  const tileGap = 3;
  const svgWidth = BOARD_SIZE * tileSize + (BOARD_SIZE - 1) * tileGap;
  const svgHeight = svgWidth;

  const scoredTiles = new Set<string>();
  for (const busState of Object.values(game.buses)) {
    for (const region of busState.regions) {
      if (region.scored) {
        for (const tile of region.tiles) {
          scoredTiles.add(`${tile.x},${tile.y}`);
        }
      }
    }
  }

  const allWalls: (Wall & { busType: BusType })[] = [];
  for (const [busType, busState] of Object.entries(game.buses)) {
    for (const wall of busState.walls) {
      allWalls.push({ ...wall, busType: busType as BusType });
    }
  }

  return (
    <div className="board-container">
      <div className="board-grid">
        {game.board.map((row, y) =>
          row.map((tile, x) => {
            const isSwapped = game.swappedTiles?.some(pair =>
              (pair[0].x === x && pair[0].y === y) || (pair[1].x === x && pair[1].y === y)
            );
            const hasObstacle = game.obstacles?.some(o => o.x === x && o.y === y);
            const isCenterBlocked = game.centerRulesActive && x === 4 && y === 4;

            return (
              <div
                key={`${x}-${y}`}
                className={`tile tile-${tile.colour ?? 'gray'}${
                  scoredTiles.has(`${x},${y}`) ? " tile-scored" : ""
                } ${isSwapped ? "tile-swapped" : ""} ${isCenterBlocked ? "tile-center-blocked" : ""}`}
              >
                {tile.scoreBonus ? (
                  <span className="tile-bonus">+{1 + tile.scoreBonus}</span>
                ) : null}
                {hasObstacle ? (
                  <span className="tile-obstacle" style={{ fontSize: "24px", filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.5))" }}>🚧</span>
                ) : null}
                {isCenterBlocked ? (
                  <span className="tile-center-blocked-label">벽</span>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <svg
        className="walls-overlay"
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      >
        {allWalls.map((wall, i) => {
          const step = tileSize + tileGap;
          let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
          const isVertical = wall.from.x === wall.to.x;

          if (isVertical) {
            x1 = wall.from.x * step - 1.5;
            x2 = x1;
            y1 = wall.from.y * step;
            y2 = wall.to.y * step;
          } else {
            y1 = wall.from.y * step - 1.5;
            y2 = y1;
            x1 = wall.from.x * step;
            x2 = wall.to.x * step;
          }

          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              className={
                wall.busType === BusType.BUS1
                  ? "wall-bus1"
                  : "wall-bus2"
              }
            />
          );
        })}
      </svg>

      {Object.entries(game.buses).map(([busType, busState]) => {
        const typedBusType = busType as BusType;
        const shouldShowFacing =
          showFacing && (!showFacingFor || showFacingFor === typedBusType);
        const step = tileSize + tileGap;
        const width = 76;
        const height = shouldShowFacing ? 30 : 30;
        const left = 12 + busState.pos.x * step + tileSize / 2 - width / 2;
        const top = 12 + busState.pos.y * step + tileSize / 2 - height / 2;
        const offset = busType === BusType.BUS1 ? -18 : 18;
        const rotation = FACING_ROTATION[busState.facing] ?? 0;

        return (
          <div
            key={busType}
            className={`bus-marker bus-marker-${busType} ${
              !shouldShowFacing ? "bus-marker-round" : ""
            }`}
            style={{
              left: left + offset,
              top: top + offset,
              transform: shouldShowFacing ? `rotate(${rotation}deg)` : "none",
            }}
          >
            <span
              className="bus-marker-label"
              style={{
                transform: shouldShowFacing ? `rotate(${-rotation}deg)` : undefined,
              }}
            >
              {busType === BusType.BUS1 ? "1번 버스" : "2번 버스"}
            </span>
            {shouldShowFacing && <span className="bus-marker-head" />}
          </div>
        );
      })}

      {subwayPreview?.path?.map((pos, index) => {
        const step = tileSize + tileGap;
        const left = 12 + pos.x * step + tileSize / 2 - 9;
        const top = 12 + pos.y * step + tileSize / 2 - 9;
        return (
          <div
            key={`subway-preview-path-${index}`}
            className="subway-preview-dot"
            style={{
              left,
              top,
              opacity: Math.max(0.35, 1 - index * 0.08),
            }}
          >
            {index + 1}
          </div>
        );
      })}

      {subwayPreview?.finalPositions?.map((pos, index) => {
        const step = tileSize + tileGap;
        const left = 12 + pos.x * step + tileSize / 2 - 14;
        const top = 12 + pos.y * step + tileSize / 2 - 14;
        return (
          <div
            key={`subway-preview-final-${index}`}
            className={`subway-preview-final ${index === 0 ? "subway-preview-final-head" : ""}`}
            style={{ left, top }}
          >
            {index === 0 ? "▶" : ""}
          </div>
        );
      })}

      {game.subways && Object.entries(game.subways)
        .filter(([, subway]) => subway.active && subway.pos.length > 0)
        .map(([busType, subway]) => {
          const isFaded = showFacingFor && showFacingFor !== busType;
          return subway.pos.map((pos, index) => {
            const step = tileSize + tileGap;
            const left = 12 + pos.x * step + tileSize / 2 - 12;
            const top = 12 + pos.y * step + tileSize / 2 - 12;
            const isBus1 = busType === BusType.BUS1;
            return (
              <div
                key={`subway-${busType}-${index}`}
                className={`subway-marker subway-marker-${busType}`}
                style={{
                  width: 24,
                  height: 24,
                  background: index === 0 
                    ? (isBus1 ? "#111" : "#222") 
                    : (isBus1 ? "var(--bus1-color)" : "var(--bus2-color)"),
                  borderRadius: index === 0 ? "6px" : "12px",
                  left,
                  top,
                  zIndex: isFaded ? 5 : 10,
                  opacity: isFaded ? 0.3 : 1,
                  boxShadow: "0 2px 4px rgba(0,0,0,0.5)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontSize: "10px",
                  fontWeight: "bold",
                  border: isFaded ? "none" : "2px solid rgba(255,255,255,0.7)",
                }}
              >
                {index === 0 ? "🚇" : ""}
              </div>
            );
          });
        })}
    </div>
  );
}
