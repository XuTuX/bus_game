export enum Colour {
  Red = "Red",
  Purple = "Purple",
  Yellow = "Yellow",
  Green = "Green",
  Blue = "Blue",
}

export enum Facing {
  N = "N",
  E = "E",
  S = "S",
  W = "W",
}

export enum BusType {
  BUS1 = "BUS1",
  BUS2 = "BUS2",
}

export type Coord = { x: number; y: number };
export type CardKind = "STRAIGHT1" | "STRAIGHT2" | "STRAIGHT3" | "LEFT" | "RIGHT";
export type Rng = () => number;

export interface Tile {
  colour: Colour | null;
  scoreBonus?: number;
}

export interface Card {
  kind: CardKind;
}

export interface Wall {
  from: Coord;
  to: Coord;
  bus: BusType;
}

export interface Region {
  id: string;
  tiles: Coord[];
  bus: BusType;
  scored: boolean;
}

export interface BusState {
  pos: Coord;
  facing: Facing;
  walls: Wall[];
  regions: Region[];
}

export interface Player {
  id: string;
  name?: string;
  team: Colour;
  hand: Card[];
}

export type PlayerSeed = Pick<Player, "id" | "team" | "name">;

export interface SubwayState {
  pos: Coord[];
  facing: Facing;
  active: boolean;
}

export interface GameState {
  board: Tile[][];
  buses: Record<BusType, BusState>;
  subways: Record<BusType, SubwayState>;
  players: Player[];
  turnIndex: number;
  roundIndex: number;
  teamScores: Record<Colour, number>;
  centerRulesActive: boolean;
  colorArrivals: Record<BusType, Colour[]>;
  logs: string[];
  swappedTiles: [Coord, Coord][];
  obstacles: Coord[];
}

export type TurnActionKind = "MOVE" | "SWAP_TILE";

export interface MoveTurnAction {
  type?: "MOVE";
  bus?: BusType;
  subway?: boolean;
  cardIndex: number;
}

export interface SwapTileTurnAction {
  type: "SWAP_TILE";
  bus: BusType;
  target: Coord;
}

export type TurnAction = MoveTurnAction | SwapTileTurnAction;

export interface StepResult {
  applied: boolean;
  reason?: string;
  regions: Region[];
  path?: Coord[];
  scoreGained?: number;
  scoreChanges?: Partial<Record<Colour, number>>;
  logs?: string[];
  collisionPenalty?: boolean;
}

export const BOARD_SIZE = 9;
export const COLOURS = [
  Colour.Red,
  Colour.Purple,
  Colour.Yellow,
  Colour.Green,
  Colour.Blue,
] as const;

export function getRoundColourOrder(roundIndex: number): Colour[] {
  const orders: Colour[][] = [
    // 1R (index 0): 노랑, 보라(퍼플), 파랑, 빨강, 초록
    [Colour.Yellow, Colour.Purple, Colour.Blue, Colour.Red, Colour.Green],
    // 2R (index 1): 빨강, 노랑, 초록, 파랑, 보라(퍼플)
    [Colour.Red, Colour.Yellow, Colour.Green, Colour.Blue, Colour.Purple],
    // 3R (index 2): 노랑, 파랑, 초록, 빨강, 보라(퍼플)
    [Colour.Yellow, Colour.Blue, Colour.Green, Colour.Red, Colour.Purple],
    // 4R (index 3): 초록, 노랑, 보라(퍼플), 빨강, 파랑
    [Colour.Green, Colour.Yellow, Colour.Purple, Colour.Red, Colour.Blue],
    // 5R (index 4): 초록, 보라(퍼플), 파랑, 노랑, 빨강
    [Colour.Green, Colour.Purple, Colour.Blue, Colour.Yellow, Colour.Red],
    // 6R (index 5): 빨강, 보라(퍼플), 초록, 파랑, 노랑
    [Colour.Red, Colour.Purple, Colour.Green, Colour.Blue, Colour.Yellow],
    // 7R (index 6): 파랑, 빨강, 초록, 보라(퍼플), 노랑
    [Colour.Blue, Colour.Red, Colour.Green, Colour.Purple, Colour.Yellow],
    // 8R (index 7): 보라(퍼플), 파랑, 빨강, 노랑, 초록
    [Colour.Purple, Colour.Blue, Colour.Red, Colour.Yellow, Colour.Green],
  ];
  return orders[roundIndex % orders.length];
}

export const MAX_PLAYERS_PER_COLOUR = 2;
export const MAX_PLAYERS = COLOURS.length * MAX_PLAYERS_PER_COLOUR;

const TEAM_IDS = ["A", "B", "C", "D", "E"] as const;

export function rotate(facing: Facing, direction: "L" | "R"): Facing {
  const order = [Facing.N, Facing.E, Facing.S, Facing.W];
  const index = order.indexOf(facing);
  const next = direction === "L" ? index + 3 : index + 1;
  return order[next % order.length];
}

export function move(coord: Coord, facing: Facing, distance: 1 | 2 | 3): Coord[] {
  const path: Coord[] = [];
  let current = { ...coord };
  for (let i = 0; i < distance; i += 1) {
    current = stepCoord(current, facing);
    path.push({ ...current });
  }
  return path;
}

export function legalMovePath(path: Coord[], boardSize = BOARD_SIZE): boolean {
  return path.every(
    (coord) =>
      coord.x >= 0 &&
      coord.x < boardSize &&
      coord.y >= 0 &&
      coord.y < boardSize
  );
}

export function addWallSegment(
  bus: BusState,
  from: Coord,
  to: Coord,
  busType = BusType.BUS1,
  otherWalls: Wall[] = []
): boolean {
  const candidate: Wall = {
    from: normalizeCoord(from),
    to: normalizeCoord(to),
    bus: busType,
  };
  const walls = [...bus.walls, ...otherWalls];
  if (walls.some((wall) => wallKey(wall) === wallKey(candidate))) {
    return false;
  }
  if (walls.some((wall) => segmentsCrossInside(wall, candidate))) {
    return false;
  }
  bus.walls.push(candidate);
  return true;
}

export function step(
  bus: BusState,
  card: Card,
  game: GameState,
  busType: BusType
): StepResult {
  const logs: string[] = [];
  if (card.kind === "LEFT" || card.kind === "RIGHT") {
    bus.facing = rotate(bus.facing, card.kind === "LEFT" ? "L" : "R");
    logs.push(`${busType}가 ${card.kind === "LEFT" ? "왼쪽" : "오른쪽"}으로 회전했습니다.`);
    return { applied: true, regions: [], path: [], logs };
  }

  const distance = straightDistance(card.kind);
  const path: Coord[] = [];
  let current = { ...bus.pos };
  const existing = Object.values(game.buses).flatMap(b => b.walls);
  let collisionOccurred = false;

  for (let i = 0; i < distance; i++) {
    const next = stepCoord(current, bus.facing);

    // 1. Check off-board
    if (next.x < 0 || next.x >= game.board.length || next.y < 0 || next.y >= game.board.length) {
      collisionOccurred = true;
      logs.push(`${busType}이(가) 보드 밖으로 벗어나려다 충돌했습니다.`);
      break;
    }

    // 2. Check center gray cell collision. Buses start on the center, but may not enter it again.
    if (next.x === 4 && next.y === 4) {
      collisionOccurred = true;
      logs.push(`중앙 회색 벽에 ${busType}이(가) 충돌했습니다.`);
      break;
    }

    // 3. Check other bus occupancy
    const otherBusType = busType === BusType.BUS1 ? BusType.BUS2 : BusType.BUS1;
    const otherBus = game.buses[otherBusType];
    if (coordsEqual(otherBus.pos, next)) {
      collisionOccurred = true;
      logs.push(`${busType}이(가) ${otherBusType}와(과) 충돌했습니다.`);
      break;
    }

    // 4. Check wall conflict
    const segment = wallBetweenTiles(current, next);
    const hitWall = existing.find(w => wallConflicts(segment, [w]));
    if (hitWall) {
      collisionOccurred = true;
      logs.push(`${busType}이(가) 벽에 충돌했습니다.`);
      break;
    }

    path.push(next);
    current = next;
  }

  bus.pos = current;
  return { applied: true, regions: [], path, logs, collisionPenalty: collisionOccurred };
}

export function stepSubway(subway: SubwayState, card: Card): StepResult {
  const logs: string[] = [];
  if (card.kind === "LEFT" || card.kind === "RIGHT") {
    subway.facing = rotate(subway.facing, card.kind === "LEFT" ? "L" : "R");
    logs.push(`지하철이 ${card.kind === "LEFT" ? "왼쪽" : "오른쪽"}으로 회전했습니다.`);
    return { applied: true, regions: [], path: [], logs };
  }

  const distance = straightDistance(card.kind);
  const path: Coord[] = [];

  for (let i = 0; i < distance; i++) {
    const next = stepCoord(subway.pos[0], subway.facing);
    if (next.x < 0 || next.x >= BOARD_SIZE || next.y < 0 || next.y >= BOARD_SIZE) {
      logs.push(`지하철이 보드 밖으로 나갈 수 없어 멈췄습니다.`);
      break;
    }
    if (next.x === 4 && next.y === 4) {
      logs.push(`지하철이 중앙 회색 벽에 부딪혀 멈췄습니다.`);
      break;
    }
    const bodyCollision = subway.pos
      .slice(0, -1)
      .some((body) => coordsEqual(body, next));
    if (bodyCollision) {
      logs.push(`지하철이 자기 몸통으로 되돌아갈 수 없어 멈췄습니다.`);
      break;
    }
    // Move body (Snake)
    subway.pos.unshift(next);
    subway.pos.pop();
    path.push(next);
  }
  
  if (distance > 0) {
    logs.push(`지하철이 ${path.length}칸 이동했습니다.`);
  }

  return { applied: true, regions: [], path, logs };
}

export function floodFillRegions(
  bus: BusState,
  board: Tile[][],
  busType = BusType.BUS1
): Region[] {
  const size = board.length;
  const visited = new Set<string>();
  const blocked = new Set(bus.walls.map(blockedEdgeKeyFromWall).filter(Boolean) as string[]);
  const newRegions: Region[] = [];

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const startKey = coordKey({ x, y });
      if (visited.has(startKey)) {
        continue;
      }

      const component: Coord[] = [];
      let reachesEdge = false;
      const queue: Coord[] = [{ x, y }];
      visited.add(startKey);

      while (queue.length > 0) {
        const current = queue.shift() as Coord;
        component.push(current);
        if (
          current.x === 0 ||
          current.y === 0 ||
          current.x === size - 1 ||
          current.y === size - 1
        ) {
          reachesEdge = true;
        }

        for (const next of neighbours(current, size)) {
          const key = coordKey(next);
          if (visited.has(key) || blocked.has(tileEdgeKey(current, next))) {
            continue;
          }
          visited.add(key);
          queue.push(next);
        }
      }

      if (!reachesEdge) {
        const id = regionId(busType, component);
        const alreadyScored = bus.regions.some(
          (region) =>
            region.scored &&
            (region.id === id || containsAll(region.tiles, component))
        );
        if (!alreadyScored) {
          const region = { id, tiles: sortCoords(component), bus: busType, scored: false };
          bus.regions.push(region);
          newRegions.push(region);
        }
      }
    }
  }

  return newRegions;
}

export function scoreRegion(region: Region, game: GameState): void {
  if (region.scored) {
    return;
  }
  const sign = region.bus === BusType.BUS1 ? 1 : -1;
  for (const tile of region.tiles) {
    const colour = game.board[tile.y][tile.x].colour;
    if (colour) {
      game.teamScores[colour] += sign;
    }
  }
  region.scored = true;
}

export function generateBoard(rng: Rng = Math.random): Tile[][] {
  const board: Tile[][] = [];
  let seqIndex = 0;
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    const row: Tile[] = [];
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if (y === 4 && x === 4) {
        row.push({ colour: null });
      } else {
        row.push({ colour: COLOURS[seqIndex % COLOURS.length] });
        seqIndex += 1;
      }
    }
    board.push(row);
  }
  return board;
}

export function dealHand(rng: Rng = Math.random): Card[] {
  const cards: Card[] = [
    ...repeatCard("STRAIGHT1", 8),
    ...repeatCard("STRAIGHT2", 7),
    ...repeatCard("STRAIGHT3", 5),
    ...repeatCard("LEFT", 6),
    ...repeatCard("RIGHT", 6),
  ];
  return shuffle(cards, rng);
}

export function runMovePhase(
  player: Player,
  actions: MoveTurnAction[],
  game: GameState,
  options: { scoreSubwaysAtEnd?: boolean } = {}
): StepResult[] {
  if (isGameOver(game)) {
    throw new Error("Game is already over");
  }

  // Validate moves
  if (actions.length > 3) {
    throw new Error("A turn may play at most 3 cards");
  }
  let remaining = player.hand.length;
  for (const action of actions) {
    if (action.cardIndex < 0 || action.cardIndex >= remaining) {
      throw new Error(`Invalid card index ${action.cardIndex}`);
    }
    remaining -= 1;
  }

  const results: StepResult[] = [];
  for (const action of actions) {
    const [card] = player.hand.splice(action.cardIndex, 1);
    
    let result: StepResult;
    if (action.subway) {
      const busType = BusType.BUS1;
      const subway = game.subways[busType];
      if (!subway?.active) {
        result = {
          applied: false,
          reason: "subway-inactive",
          regions: [],
          scoreGained: 0,
        };
      } else {
        result = stepSubway(subway, card);
      }
    } else {
      const busType = action.bus ?? BusType.BUS1;
      const bus = game.buses[busType];
      result = step(bus, card, game, busType);
      
      // Handle path scoring and arrivals
      let gained = 0;
      const scoreChanges: Partial<Record<Colour, number>> = {};
      
      if (result.applied && result.path && result.path.length > 0) {
        for (const coord of result.path) {
          const tile = game.board[coord.y]?.[coord.x];
          if (!tile || !tile.colour) continue;
          
          const score = 1 + (tile.scoreBonus ?? 0);
          game.teamScores[tile.colour] += score;
          scoreChanges[tile.colour] = (scoreChanges[tile.colour] ?? 0) + score;
          gained += score;

        }
      }
      if (result.collisionPenalty) {
        game.teamScores[player.team] -= 3;
        scoreChanges[player.team] = (scoreChanges[player.team] ?? 0) - 3;
        gained -= 3;
      }
      result.scoreGained = gained;
      result.scoreChanges = scoreChanges;
      // Distance Penalty moved to end of turn
    }
    
    // Add logs to global game logs
    if (result.logs && result.logs.length > 0) {
      game.logs.push(...result.logs);
    }
    
    results.push(result);
  }

  // End of turn Subway scoring
  if (options.scoreSubwaysAtEnd ?? true) {
    scoreSubwayTiles(game);
  }

  return results;
}

export function scoreSubwayTiles(game: GameState): void {
  for (const subway of Object.values(game.subways)) {
    if (!subway.active) continue;
    const counts = new Map<Colour, number>();
    for (const pos of subway.pos) {
      const tile = game.board[pos.y]?.[pos.x];
      if (tile && tile.colour) {
        counts.set(tile.colour, (counts.get(tile.colour) ?? 0) + 1);
      }
    }
    for (const [colour, count] of counts) {
      game.teamScores[colour] += count;
      game.logs.push(`지하철이 차지한 ${colour} 칸 ${count}개: +${count}점`);
    }
  }
}

export function scoreMatchingBusDestinationBonus(
  game: GameState,
  recipientTeams: Colour[]
): void {
  const bus1Pos = game.buses[BusType.BUS1].pos;
  const bus2Pos = game.buses[BusType.BUS2].pos;
  const bus1Colour = game.board[bus1Pos.y]?.[bus1Pos.x]?.colour;
  const bus2Colour = game.board[bus2Pos.y]?.[bus2Pos.x]?.colour;

  if (!bus1Colour || bus1Colour !== bus2Colour) {
    return;
  }

  const uniqueTeams = [...new Set(recipientTeams)];
  for (const team of uniqueTeams) {
    game.teamScores[team] += 3;
  }
  game.logs.push(
    `두 버스가 모두 ${bus1Colour} 칸에 도착했습니다. 현재 조작 팀 ${uniqueTeams.join(", ")} +3점`
  );
}

export function runActionPhase(
  player: Player,
  action: SwapTileTurnAction | null,
  game: GameState
): StepResult {
  if (isGameOver(game)) {
    throw new Error("Game is already over");
  }

  let result: StepResult = { applied: true, regions: [] };

  if (action) {
    const bus = game.buses[action.bus];
    const busPos = bus.pos;
    const busTile = game.board[busPos.y]?.[busPos.x];

    if (!busTile) {
      result = { applied: false, reason: "invalid-target", regions: [] };
    } else if (action.type === "SWAP_TILE") {
      const dx = Math.abs(action.target.x - busPos.x);
      const dy = Math.abs(action.target.y - busPos.y);
      const targetTile = game.board[action.target.y]?.[action.target.x];
      if (!targetTile) {
        return { applied: false, reason: "invalid-target", regions: [] };
      }
      if (dx > 1 || dy > 1) {
        result = { applied: false, reason: "target-out-of-range", regions: [] };
      } else {
        // Swap tile positions. Tiles currently only carry colour data.
        const temp = busTile.colour;
        busTile.colour = targetTile.colour;
        targetTile.colour = temp;
        game.swappedTiles.push([busPos, action.target]);
        result = { applied: true, regions: [] };
      }
    }
  }

  return result;
}

function scorePathTiles(path: Coord[], bus: BusType, game: GameState): number {
  return 0; // Deprecated, logic moved to runMovePhase
}

export function nextPlayer(game: GameState): Player {
  const playerIndex = (game.roundIndex + game.turnIndex) % game.players.length;
  return game.players[playerIndex];
}

export function nextRound(game: GameState): void {
  if (game.turnIndex !== 0) {
    throw new Error("Cannot start next round before all players have acted");
  }
  game.roundIndex += 1;
}

export function isGameOver(game: GameState): boolean {
  return game.roundIndex >= 8;
}

export function createGame(rng: Rng = Math.random, playerSeeds?: PlayerSeed[]): GameState {
  const players = playerSeeds ? createPlayersFromSeeds(playerSeeds, rng) : createDefaultPlayers(rng);
  return {
    board: generateBoard(rng),
    buses: {
      [BusType.BUS1]: {
        pos: { x: 4, y: 4 },
        facing: Facing.E,
        walls: [],
        regions: [],
      },
      [BusType.BUS2]: {
        pos: { x: 4, y: 4 },
        facing: Facing.W,
        walls: [],
        regions: [],
      },
    },
    subways: {
      [BusType.BUS1]: {
        pos: [
          { x: 5, y: 0 },
          { x: 4, y: 0 },
          { x: 3, y: 0 },
          { x: 2, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 0 },
        ],
        facing: Facing.E,
        active: true,
      },
      [BusType.BUS2]: {
        pos: [],
        facing: Facing.E,
        active: false,
      },
    },
    players,
    turnIndex: 0,
    roundIndex: 0,
    teamScores: emptyScores(),
    centerRulesActive: false,
    colorArrivals: {
      [BusType.BUS1]: [],
      [BusType.BUS2]: [],
    },
    logs: [],
    swappedTiles: [],
    obstacles: [],
  };
}

export function endOfRound(game: GameState): boolean {
  return game.turnIndex === 0;
}

export function boardToSymbols(board: Tile[][]): string {
  return board
    .map((row) => row.map((tile) => colourSymbol(tile.colour)).join(" "))
    .join("\n");
}

export function colourSymbol(colour: Colour | null): string {
  if (!colour) return "X";
  switch (colour) {
    case Colour.Red:
      return "R";
    case Colour.Purple:
      return "P";
    case Colour.Yellow:
      return "Y";
    case Colour.Green:
      return "G";
    case Colour.Blue:
      return "B";
  }
}

export function cardLabel(card: Card): string {
  switch (card.kind) {
    case "STRAIGHT1":
      return "직진 1칸";
    case "STRAIGHT2":
      return "직진 2칸";
    case "STRAIGHT3":
      return "직진 3칸";
    case "LEFT":
      return "좌회전";
    case "RIGHT":
      return "우회전";
  }
}

export function emptyScores(): Record<Colour, number> {
  return {
    [Colour.Red]: 0,
    [Colour.Purple]: 0,
    [Colour.Yellow]: 0,
    [Colour.Green]: 0,
    [Colour.Blue]: 0,
  };
}

function createPlayersFromSeeds(playerSeeds: PlayerSeed[], rng: Rng): Player[] {
  return playerSeeds.map((player) => ({
    ...player,
    hand: dealHand(rng),
  }));
}

function createDefaultPlayers(rng: Rng): Player[] {
  const players: Player[] = [];
  for (let seat = 1; seat <= 2; seat += 1) {
    COLOURS.forEach((team, index) => {
      players.push({
        id: `${TEAM_IDS[index]}${seat}`,
        team,
        hand: dealHand(rng),
      });
    });
  }
  return players;
}

export function stepCoord(coord: Coord, facing: Facing): Coord {
  switch (facing) {
    case Facing.N:
      return { x: coord.x, y: coord.y - 1 };
    case Facing.E:
      return { x: coord.x + 1, y: coord.y };
    case Facing.S:
      return { x: coord.x, y: coord.y + 1 };
    case Facing.W:
      return { x: coord.x - 1, y: coord.y };
  }
}

function straightDistance(kind: CardKind): 1 | 2 | 3 {
  if (kind === "STRAIGHT1") return 1;
  if (kind === "STRAIGHT2") return 2;
  if (kind === "STRAIGHT3") return 3;
  throw new Error(`${kind} is not a straight card`);
}

function pathToWallSegments(start: Coord, path: Coord[]): Omit<Wall, "bus">[] {
  const segments: Omit<Wall, "bus">[] = [];
  let previous = start;
  for (const current of path) {
    segments.push(wallBetweenTiles(previous, current));
    previous = current;
  }
  return segments;
}

export function wallBetweenTiles(fromTile: Coord, toTile: Coord): Omit<Wall, "bus"> {
  if (toTile.x === fromTile.x + 1) {
    return { from: { x: toTile.x, y: toTile.y }, to: { x: toTile.x, y: toTile.y + 1 } };
  }
  if (toTile.x === fromTile.x - 1) {
    return { from: { x: fromTile.x, y: fromTile.y }, to: { x: fromTile.x, y: fromTile.y + 1 } };
  }
  if (toTile.y === fromTile.y + 1) {
    return { from: { x: toTile.x, y: toTile.y }, to: { x: toTile.x + 1, y: toTile.y } };
  }
  if (toTile.y === fromTile.y - 1) {
    return { from: { x: fromTile.x, y: fromTile.y }, to: { x: fromTile.x + 1, y: fromTile.y } };
  }
  throw new Error("Wall can only be created between adjacent tiles");
}

export function wallConflicts(candidate: Omit<Wall, "bus">, existing: Wall[]): boolean {
  const candidateWall = { ...candidate, bus: BusType.BUS1 };
  return existing.some(
    (wall) => wallKey(wall) === wallKey(candidateWall) || segmentsCrossInside(wall, candidateWall)
  );
}

function wallKey(wall: Pick<Wall, "from" | "to">): string {
  const [a, b] = [normalizeCoord(wall.from), normalizeCoord(wall.to)].sort(compareCoords);
  return `${coordKey(a)}>${coordKey(b)}`;
}

function normalizeCoord(coord: Coord): Coord {
  return { x: coord.x, y: coord.y };
}

function coordKey(coord: Coord): string {
  return `${coord.x},${coord.y}`;
}

function coordsEqual(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y;
}

function compareCoords(a: Coord, b: Coord): number {
  return a.x === b.x ? a.y - b.y : a.x - b.x;
}

function segmentsCrossInside(a: Pick<Wall, "from" | "to">, b: Pick<Wall, "from" | "to">): boolean {
  const aVertical = a.from.x === a.to.x;
  const bVertical = b.from.x === b.to.x;
  if (aVertical === bVertical) {
    return false;
  }
  const vertical = aVertical ? a : b;
  const horizontal = aVertical ? b : a;
  const vx = vertical.from.x;
  const hy = horizontal.from.y;
  const vMinY = Math.min(vertical.from.y, vertical.to.y);
  const vMaxY = Math.max(vertical.from.y, vertical.to.y);
  const hMinX = Math.min(horizontal.from.x, horizontal.to.x);
  const hMaxX = Math.max(horizontal.from.x, horizontal.to.x);
  return vx > hMinX && vx < hMaxX && hy > vMinY && hy < vMaxY;
}

function blockedEdgeKeyFromWall(wall: Wall): string | null {
  if (wall.from.x === wall.to.x) {
    const x = wall.from.x;
    const y = Math.min(wall.from.y, wall.to.y);
    if (x <= 0 || x >= BOARD_SIZE) return null;
    return tileEdgeKey({ x: x - 1, y }, { x, y });
  }
  if (wall.from.y === wall.to.y) {
    const x = Math.min(wall.from.x, wall.to.x);
    const y = wall.from.y;
    if (y <= 0 || y >= BOARD_SIZE) return null;
    return tileEdgeKey({ x, y: y - 1 }, { x, y });
  }
  return null;
}

function tileEdgeKey(a: Coord, b: Coord): string {
  const [first, second] = [a, b].sort(compareCoords);
  return `${coordKey(first)}|${coordKey(second)}`;
}

function neighbours(coord: Coord, size: number): Coord[] {
  const candidates = [
    { x: coord.x + 1, y: coord.y },
    { x: coord.x - 1, y: coord.y },
    { x: coord.x, y: coord.y + 1 },
    { x: coord.x, y: coord.y - 1 },
  ];
  return candidates.filter(
    (candidate) =>
      candidate.x >= 0 &&
      candidate.x < size &&
      candidate.y >= 0 &&
      candidate.y < size
  );
}

function regionId(busType: BusType, tiles: Coord[]): string {
  return `${busType}:${sortCoords(tiles).map(coordKey).join(";")}`;
}

function sortCoords(coords: Coord[]): Coord[] {
  return [...coords].sort(compareCoords).map((coord) => ({ ...coord }));
}

function containsAll(container: Coord[], subset: Coord[]): boolean {
  const keys = new Set(container.map(coordKey));
  return subset.every((coord) => keys.has(coordKey(coord)));
}

function repeatCard(kind: CardKind, count: number): Card[] {
  return Array.from({ length: count }, () => ({ kind }));
}

function shuffle<T>(items: T[], rng: Rng): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function fillBoardColours(cells: Colour[], remaining: Map<Colour, number>, rng: Rng): boolean {
  if (cells.length === BOARD_SIZE * BOARD_SIZE) {
    return true;
  }

  const choices = shuffle([...COLOURS], rng).filter((colour) => {
    const left = remaining.get(colour) ?? 0;
    return left > 0 && canPlaceColour(cells, colour);
  });

  for (const colour of choices) {
    cells.push(colour);
    remaining.set(colour, (remaining.get(colour) ?? 0) - 1);
    if (fillBoardColours(cells, remaining, rng)) {
      return true;
    }
    remaining.set(colour, (remaining.get(colour) ?? 0) + 1);
    cells.pop();
  }

  return false;
}

function canPlaceColour(cells: Colour[], colour: Colour): boolean {
  const index = cells.length;
  const x = index % BOARD_SIZE;
  const y = Math.floor(index / BOARD_SIZE);

  if (x >= 2 && cells[index - 1] === colour && cells[index - 2] === colour) {
    return false;
  }
  if (
    y >= 2 &&
    cells[index - BOARD_SIZE] === colour &&
    cells[index - BOARD_SIZE * 2] === colour
  ) {
    return false;
  }
  if (
    x >= 1 &&
    y >= 1 &&
    cells[index - 1] === colour &&
    cells[index - BOARD_SIZE] === colour &&
    cells[index - BOARD_SIZE - 1] === colour
  ) {
    return false;
  }

  return true;
}

function toBoard(cells: Colour[]): Tile[][] {
  const board: Tile[][] = [];
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    const row: Tile[] = [];
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      row.push({ colour: cells[y * BOARD_SIZE + x] });
    }
    board.push(row);
  }
  return board;
}

function boardMeetsGlobalRules(board: Tile[][]): boolean {
  return (
    hasExpectedCounts(board) &&
    hasNoThreeInRow(board) &&
    hasNoMonochromeTwoByTwo(board) &&
    centresOfMassAreNearCentre(board)
  );
}

function hasExpectedCounts(board: Tile[][]): boolean {
  const counts = countColours(board);
  const sorted = [...counts.values()].sort((a, b) => a - b);
  return sorted.join(",") === "16,16,16,16,16" || sorted.join(",") === "15,16,16,16,17";
}

function hasNoThreeInRow(board: Tile[][]): boolean {
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const colour = board[y][x].colour;
      if (!colour) continue;
      if (x <= BOARD_SIZE - 3 && board[y][x + 1].colour === colour && board[y][x + 2].colour === colour) {
        return false;
      }
      if (y <= BOARD_SIZE - 3 && board[y + 1][x].colour === colour && board[y + 2][x].colour === colour) {
        return false;
      }
    }
  }
  return true;
}

function hasNoMonochromeTwoByTwo(board: Tile[][]): boolean {
  for (let y = 0; y < BOARD_SIZE - 1; y += 1) {
    for (let x = 0; x < BOARD_SIZE - 1; x += 1) {
      const colour = board[y][x].colour;
      if (!colour) continue;
      if (
        board[y][x + 1].colour === colour &&
        board[y + 1][x].colour === colour &&
        board[y + 1][x + 1].colour === colour
      ) {
        return false;
      }
    }
  }
  return true;
}

function centresOfMassAreNearCentre(board: Tile[][]): boolean {
  const sums = new Map<Colour, { x: number; y: number; count: number }>();
  for (const colour of COLOURS) {
    sums.set(colour, { x: 0, y: 0, count: 0 });
  }
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const colour = board[y][x].colour;
      if (!colour) continue;
      const sum = sums.get(colour)!;
      sum.x += x;
      sum.y += y;
      sum.count += 1;
    }
  }

  return [...sums.values()].every((sum) => {
    if (sum.count === 0) return true;
    const centreX = sum.x / sum.count;
    const centreY = sum.y / sum.count;
    return Math.abs(centreX - 4) + Math.abs(centreY - 4) <= 1.5;
  });
}

function countColours(board: Tile[][]): Map<Colour, number> {
  const counts = new Map<Colour, number>();
  for (const colour of COLOURS) {
    counts.set(colour, 0);
  }
  for (const row of board) {
    for (const tile of row) {
      if (tile.colour) {
        counts.set(tile.colour, (counts.get(tile.colour) ?? 0) + 1);
      }
    }
  }
  return counts;
}

export function getConnectedComponentSize(
  start: Coord,
  board: Tile[][],
  allWalls: Wall[]
): number {
  const targetColor = board[start.y]?.[start.x]?.colour;
  if (!targetColor) return 0;

  const visited = new Set<string>();
  const queue: Coord[] = [start];
  visited.add(`${start.x},${start.y}`);

  let count = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    count++;

    const neighbors = [
      { x: current.x, y: current.y - 1 },
      { x: current.x + 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x - 1, y: current.y },
    ];

    for (const next of neighbors) {
      const nextKey = `${next.x},${next.y}`;
      if (visited.has(nextKey)) continue;

      if (next.x < 0 || next.x >= board.length || next.y < 0 || next.y >= board.length) {
        continue;
      }

      if (board[next.y][next.x].colour !== targetColor) {
        continue;
      }

      try {
        const segment = wallBetweenTiles(current, next);
        if (wallConflicts(segment, allWalls)) {
          continue;
        }
      } catch {
        continue;
      }

      visited.add(nextKey);
      queue.push(next);
    }
  }

  return count;
}
