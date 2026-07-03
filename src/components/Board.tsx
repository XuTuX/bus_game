import { BusType, BOARD_SIZE, type GameState, type Wall } from "@/lib/game";

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
}: {
  game: GameState;
  showFacing?: boolean;
  showFacingFor?: BusType;
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
          row.map((tile, x) => (
            <div
              key={`${x}-${y}`}
              className={`tile tile-${tile.colour}${
                scoredTiles.has(`${x},${y}`) ? " tile-scored" : ""
              }`}
            >
              {tile.scoreBonus ? (
                <span className="tile-bonus">+{1 + tile.scoreBonus}</span>
              ) : null}
            </div>
          ))
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
                wall.isObstacle
                  ? "wall-obstacle"
                  : wall.busType === BusType.PLUS
                  ? "wall-plus"
                  : "wall-minus"
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
        const width = shouldShowFacing ? 38 : 28;
        const height = shouldShowFacing ? 26 : 28;
        const left = 12 + busState.pos.x * step + tileSize / 2 - width / 2;
        const top = 12 + busState.pos.y * step + tileSize / 2 - height / 2;
        const offset = busType === BusType.PLUS ? -4 : 4;
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
            <span className="bus-marker-label">
              {busType === BusType.PLUS ? "+" : "-"}
            </span>
            {shouldShowFacing && <span className="bus-marker-head" />}
          </div>
        );
      })}
    </div>
  );
}
