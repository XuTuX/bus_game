export enum Colour {
  Red = "Red",
  Orange = "Orange",
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
  PLUS = "PLUS",
  MINUS = "MINUS",
}

export type Coord = { x: number; y: number };
export type CardKind = "STRAIGHT1" | "STRAIGHT2" | "STRAIGHT3" | "LEFT" | "RIGHT";
export type Rng = () => number;

export interface Tile {
  colour: Colour;
  scoreBonus?: number;
}

export interface Card {
  kind: CardKind;
}

export interface Wall {
  from: Coord;
  to: Coord;
  bus: BusType;
  isObstacle?: boolean;
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

export interface GameState {
  board: Tile[][];
  buses: Record<BusType, BusState>;
  players: Player[];
  turnIndex: number;
  roundIndex: number;
  teamScores: Record<Colour, number>;
}

export type TurnActionKind = "MOVE" | "SWAP_TILE" | "PLACE_OBSTACLE";

export interface MoveTurnAction {
  type?: "MOVE";
  bus: BusType;
  cardIndex: number;
}

export interface SwapTileTurnAction {
  type: "SWAP_TILE";
  bus: BusType;
  target: Coord;
}

export interface PlaceObstacleTurnAction {
  type: "PLACE_OBSTACLE";
  bus: BusType;
  target: Coord;
}

export type TurnAction = MoveTurnAction | SwapTileTurnAction | PlaceObstacleTurnAction;

export interface StepResult {
  applied: boolean;
  reason?: string;
  regions: Region[];
  path?: Coord[];
  scoreGained?: number;
}

export const BOARD_SIZE = 9;
export const COLOURS = [
  Colour.Red,
  Colour.Orange,
  Colour.Yellow,
  Colour.Green,
  Colour.Blue,
] as const;

export function getRoundColourOrder(roundIndex: number): Colour[] {
  const offset = roundIndex % COLOURS.length;
  return [...COLOURS.slice(offset), ...COLOURS.slice(0, offset)];
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
  busType = BusType.PLUS,
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
  board: Tile[][],
  busType = BusType.PLUS,
  otherWalls: Wall[] = [],
  blockedCoords: Coord[] = []
): StepResult {
  if (card.kind === "LEFT" || card.kind === "RIGHT") {
    bus.facing = rotate(bus.facing, card.kind === "LEFT" ? "L" : "R");
    return { applied: true, regions: [], path: [] };
  }

  const distance = straightDistance(card.kind);
  const path: Coord[] = [];
  let current = { ...bus.pos };
  const existing = [...bus.walls, ...otherWalls];

  for (let i = 0; i < distance; i++) {
    const next = stepCoord(current, bus.facing);

    // 1. Check off-board
    if (next.x < 0 || next.x >= board.length || next.y < 0 || next.y >= board.length) {
      break; // Stop before leaving the board
    }

    // 2. Check other bus occupancy
    if (blockedCoords.some((coord) => coordsEqual(coord, next))) {
      break; // Stop before entering another bus's tile
    }

    // 3. Check wall/obstacle conflict
    const segment = wallBetweenTiles(current, next);
    if (wallConflicts(segment, existing)) {
      break; // Stop before hitting the wall
    }

    // 4. Move is valid, apply it
    path.push(next);
    current = next;
  }

  bus.pos = current;
  return { applied: true, regions: [], path };
}

export function floodFillRegions(
  bus: BusState,
  board: Tile[][],
  busType = BusType.PLUS
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
  const sign = region.bus === BusType.PLUS ? 1 : -1;
  for (const tile of region.tiles) {
    const colour = game.board[tile.y][tile.x].colour;
    game.teamScores[colour] += sign;
  }
  region.scored = true;
}

export function generateBoard(rng: Rng = Math.random): Tile[][] {
  for (let attempt = 0; attempt < 5000; attempt += 1) {
    const extraColour = COLOURS[Math.floor(rng() * COLOURS.length)];
    const remaining = new Map<Colour, number>();
    for (const colour of COLOURS) {
      remaining.set(colour, colour === extraColour ? 17 : 16);
    }

    const cells: Colour[] = [];
    if (fillBoardColours(cells, remaining, rng)) {
      const board = toBoard(cells);
      if (boardMeetsGlobalRules(board)) {
        return board;
      }
    }
  }

  throw new Error("Unable to generate a valid board after 5000 attempts");
}

export function dealHand(rng: Rng = Math.random): Card[] {
  const cards: Card[] = [
    ...repeatCard("STRAIGHT1", 4),
    ...repeatCard("STRAIGHT2", 3),
    ...repeatCard("STRAIGHT3", 2),
    ...repeatCard("LEFT", 3),
    ...repeatCard("RIGHT", 3),
  ];
  return shuffle(cards, rng);
}

export function runMovePhase(player: Player, actions: MoveTurnAction[], game: GameState): StepResult[] {
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
    const bus = game.buses[action.bus];
    const otherWalls = Object.entries(game.buses)
      .filter(([type]) => type !== action.bus)
      .flatMap(([, state]) => state.walls);
    const blockedCoords = Object.entries(game.buses)
      .filter(([type]) => type !== action.bus)
      .map(([, state]) => state.pos);
    const result = step(bus, card, game.board, action.bus, otherWalls, blockedCoords);
    if (result.applied && result.path) {
      result.scoreGained = scorePathTiles(result.path, action.bus, game);
      result.regions = [];
    }
    results.push(result);
  }
  return results;
}

export function runActionPhase(
  player: Player,
  action: SwapTileTurnAction | PlaceObstacleTurnAction | null,
  game: GameState
): StepResult {
  if (isGameOver(game)) {
    throw new Error("Game is already over");
  }

  let result: StepResult = { applied: true, regions: [] };

  if (action) {
    const bus = game.buses[action.bus];
    const busPos = bus.pos;
    const dx = Math.abs(action.target.x - busPos.x);
    const dy = Math.abs(action.target.y - busPos.y);
    if (dx > 1 || dy > 1) {
      result = { applied: false, reason: "target-out-of-range", regions: [] };
    } else {
      const targetTile = game.board[action.target.y]?.[action.target.x];
      const busTile = game.board[busPos.y]?.[busPos.x];

      if (!targetTile || !busTile) {
        result = { applied: false, reason: "invalid-target", regions: [] };
      } else if (action.type === "SWAP_TILE") {
        // Swap tile positions. Tiles currently only carry colour data.
        const temp = busTile.colour;
        busTile.colour = targetTile.colour;
        targetTile.colour = temp;
        result = { applied: true, regions: [] };
      } else if (action.type === "PLACE_OBSTACLE") {
        if (dx + dy !== 1) {
          return { applied: false, reason: "target-not-adjacent", regions: [] };
        }

        const segment = wallBetweenTiles(busPos, action.target);
        const allWalls = Object.values(game.buses).flatMap((state) => state.walls);
        if (wallConflicts(segment, allWalls)) {
          return { applied: false, reason: "obstacle-conflict", regions: [] };
        }

        bus.walls.push({
          from: segment.from,
          to: segment.to,
          bus: action.bus,
          isObstacle: true,
        });
        result = { applied: true, regions: [] };
      }
    }
  }

  return result;
}

function scorePathTiles(path: Coord[], bus: BusType, game: GameState): number {
  let total = 0;
  const sign = bus === BusType.MINUS ? -1 : 1;
  for (const coord of path) {
    const tile = game.board[coord.y]?.[coord.x];
    if (!tile) {
      continue;
    }
    const score = 1 + (tile.scoreBonus ?? 0);
    game.teamScores[tile.colour] += score * sign;
    total += score * sign;
  }
  return total;
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
  return game.roundIndex >= 5;
}

export function createGame(rng: Rng = Math.random, playerSeeds?: PlayerSeed[]): GameState {
  const players = playerSeeds ? createPlayersFromSeeds(playerSeeds, rng) : createDefaultPlayers(rng);
  return {
    board: generateBoard(rng),
    buses: {
      [BusType.PLUS]: {
        pos: { x: 4, y: 4 },
        facing: Facing.E,
        walls: [],
        regions: [],
      },
      [BusType.MINUS]: {
        pos: { x: 4, y: 4 },
        facing: Facing.W,
        walls: [],
        regions: [],
      },
    },
    players,
    turnIndex: 0,
    roundIndex: 0,
    teamScores: emptyScores(),
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

export function colourSymbol(colour: Colour): string {
  switch (colour) {
    case Colour.Red:
      return "R";
    case Colour.Orange:
      return "O";
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
      return "S1";
    case "STRAIGHT2":
      return "S2";
    case "STRAIGHT3":
      return "S3";
    case "LEFT":
      return "L";
    case "RIGHT":
      return "R";
  }
}

export function emptyScores(): Record<Colour, number> {
  return {
    [Colour.Red]: 0,
    [Colour.Orange]: 0,
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
  const candidateWall = { ...candidate, bus: BusType.PLUS };
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
  return sorted.join(",") === "16,16,16,16,17";
}

function hasNoThreeInRow(board: Tile[][]): boolean {
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      const colour = board[y][x].colour;
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
      const sum = sums.get(board[y][x].colour) as { x: number; y: number; count: number };
      sum.x += x;
      sum.y += y;
      sum.count += 1;
    }
  }

  return [...sums.values()].every((sum) => {
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
      counts.set(tile.colour, (counts.get(tile.colour) ?? 0) + 1);
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
