import { BusType, BOARD_SIZE, type GameState, type Wall } from "@/lib/game";

const FACING_ARROWS: Record<string, string> = {
  N: "↑",
  E: "→",
  S: "↓",
  W: "←",
};

export default function Board({ game }: { game: GameState }) {
  const tileSize = 56;
  const tileGap = 3;
  const svgWidth = BOARD_SIZE * tileSize + (BOARD_SIZE - 1) * tileGap;
  const svgHeight = svgWidth;

  const allWalls: (Wall & { busType: BusType })[] = [];
  for (const [busType, busState] of Object.entries(game.buses)) {
    for (const wall of busState.walls) {
      allWalls.push({ ...wall, busType: busType as BusType });
    }
  }

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
            />
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
          const x1 = wall.from.x * step + tileSize / 2;
          const y1 = wall.from.y * step + tileSize / 2;
          const x2 = wall.to.x * step + tileSize / 2;
          const y2 = wall.to.y * step + tileSize / 2;

          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              className={
                wall.busType === BusType.PLUS ? "wall-plus" : "wall-minus"
              }
            />
          );
        })}
      </svg>

      {Object.entries(game.buses).map(([busType, busState]) => {
        const step = tileSize + tileGap;
        const left = 12 + busState.pos.x * step + tileSize / 2 - 14;
        const top = 12 + busState.pos.y * step + tileSize / 2 - 14;
        const offset = busType === BusType.PLUS ? -4 : 4;

        return (
          <div
            key={busType}
            className={`bus-marker bus-marker-${busType}`}
            style={{
              left: left + offset,
              top: top + offset,
            }}
          >
            {FACING_ARROWS[busState.facing]}
          </div>
        );
      })}
    </div>
  );
}
