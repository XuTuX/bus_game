import {
  Colour,
  COLOURS,
  MAX_PLAYERS,
  MAX_PLAYERS_PER_COLOUR,
  BusType,
  type GameState,
  type TurnAction,
  type StepResult,
  type Card,
  type MoveTurnAction,
  type SwapTileTurnAction,
  type PlaceObstacleTurnAction,
  createGame,
  nextPlayer,
  runMovePhase,
  runActionPhase,
  endOfRound,
  nextRound,
  isGameOver,
  cardLabel,
} from "@/lib/game";

export interface LobbyParticipant {
  id: string;
  name: string;
  colour?: Colour;
}

export interface LogEntry {
  id: number;
  playerId: string;
  team: string;
  actions: {
    actionLabel: string;
    bus: BusType;
    applied: boolean;
    reason?: string;
    scoreGained: number;
  }[];
  round: number;
  turn: number;
}

export type RoomStatus = "LOBBY" | "WAITING" | "CHOOSING" | "ACTION_PHASE" | "GAME_OVER";

export interface RoomState {
  game: GameState;
  participants: LobbyParticipant[];
  logs: LogEntry[];
  status: RoomStatus;
  logIdCounter: number;
  playerIdCounter: number;
}

const rooms = new Map<string, RoomState>();

export function hasRoom(roomCode: string): boolean {
  return rooms.has(roomCode);
}

export function getRoom(roomCode: string): RoomState | undefined {
  return rooms.get(roomCode);
}

export function getOrCreateRoom(roomCode: string): RoomState {
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, {
      game: createGame(Math.random, []),
      participants: [],
      logs: [],
      status: "LOBBY",
      logIdCounter: 0,
      playerIdCounter: 0,
    });
  }
  return rooms.get(roomCode)!;
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function addLobbyParticipant(roomCode: string, name: string): LobbyParticipant {
  const room = getOrCreateRoom(roomCode);
  if (room.status !== "LOBBY") {
    throw new Error("게임 시작 후에는 참가자를 추가할 수 없습니다.");
  }
  if (room.participants.length >= MAX_PLAYERS) {
    throw new Error("참가 가능한 인원이 모두 찼습니다.");
  }

  const normalizedName = name.trim() || `플레이어 ${room.participants.length + 1}`;
  const participant: LobbyParticipant = {
    id: `P${++room.playerIdCounter}`,
    name: normalizedName.slice(0, 16),
  };
  room.participants.push(participant);
  return participant;
}

export function adminAddParticipant(roomCode: string, name: string): LobbyParticipant {
  const participant = addLobbyParticipant(roomCode, name);
  participant.colour = nextAvailableColour(getOrCreateRoom(roomCode).participants);
  return participant;
}

export function adminRemoveParticipant(roomCode: string, playerId: string): void {
  const room = getOrCreateRoom(roomCode);
  if (room.status !== "LOBBY") {
    throw new Error("게임 시작 후에는 참가자를 수정할 수 없습니다.");
  }

  const participantIndex = room.participants.findIndex((p) => p.id === playerId);
  if (participantIndex === -1) {
    throw new Error("참가자를 찾을 수 없습니다.");
  }

  room.participants.splice(participantIndex, 1);
}

export function adminSetParticipantColour(
  roomCode: string,
  playerId: string,
  colour: Colour
): void {
  const room = getOrCreateRoom(roomCode);
  if (room.status !== "LOBBY") {
    throw new Error("게임 시작 후에는 색상을 바꿀 수 없습니다.");
  }
  if (!COLOURS.includes(colour)) {
    throw new Error("유효하지 않은 색상입니다.");
  }

  const participant = room.participants.find((p) => p.id === playerId);
  if (!participant) {
    throw new Error("참가자를 찾을 수 없습니다.");
  }

  const sameColourCount = room.participants.filter(
    (p) => p.id !== playerId && p.colour === colour
  ).length;
  if (sameColourCount >= MAX_PLAYERS_PER_COLOUR) {
    throw new Error("같은 색상은 최대 2명까지 선택할 수 있습니다.");
  }

  participant.colour = colour;
}

// Player submits moves or action depending on status.
export function submitTurn(roomCode: string, playerId: string, actions: TurnAction[]) {
  const room = getOrCreateRoom(roomCode);
  
  if (room.status !== "CHOOSING" && room.status !== "ACTION_PHASE") {
    throw new Error("Currently not in a turn submission phase.");
  }

  const player = nextPlayer(room.game);
  if (player.id !== playerId) {
    throw new Error(`It is not ${playerId}'s turn.`);
  }

  if (room.status === "CHOOSING") {
    // 1. Movement Phase
    const clone = deepClone(room.game);
    const originalHand = [...player.hand];
    const results = runMovePhase(player, actions as MoveTurnAction[], clone);
    
    // Log the moves
    const actionDetails: LogEntry["actions"] = [];
    let handCopy = [...originalHand];
    (actions as MoveTurnAction[]).forEach((move, i) => {
      const result = results[i];
      const label = actionLabel(move, handCopy);
      handCopy.splice(move.cardIndex, 1);
      actionDetails.push({
        actionLabel: label,
        bus: move.bus,
        applied: result.applied,
        reason: result.reason,
        scoreGained: result.scoreGained ?? 0,
      });
    });

    if (actionDetails.length === 0) {
      actionDetails.push({
        actionLabel: "이동 패스",
        bus: BusType.PLUS,
        applied: true,
        scoreGained: 0,
      });
    }

    const entry: LogEntry = {
      id: ++room.logIdCounter,
      playerId: player.name ?? player.id,
      team: player.team,
      actions: actionDetails,
      round: room.game.roundIndex + 1,
      turn: room.game.turnIndex + 1,
    };
    room.logs.unshift(entry);
    room.game = clone;
    room.status = "ACTION_PHASE";
  } else if (room.status === "ACTION_PHASE") {
    // 2. Action Phase
    const clone = deepClone(room.game);
    const action = actions[0] as SwapTileTurnAction | PlaceObstacleTurnAction | undefined;
    const result = runActionPhase(player, action || null, clone);
    
    // Log the action
    const actionDetails: LogEntry["actions"] = [];
    if (action) {
      actionDetails.push({
        actionLabel: action.type === "SWAP_TILE" ? "타일 교체" : "장애물 설치",
        bus: action.bus,
        applied: result.applied,
        reason: result.reason,
        scoreGained: 0,
      });
    } else {
      actionDetails.push({
        actionLabel: "행동 패스",
        bus: BusType.PLUS,
        applied: true,
        scoreGained: 0,
      });
    }

    const entry: LogEntry = {
      id: ++room.logIdCounter,
      playerId: player.name ?? player.id,
      team: player.team,
      actions: actionDetails,
      round: room.game.roundIndex + 1,
      turn: room.game.turnIndex + 1,
    };
    room.logs.unshift(entry);

    if (endOfRound(clone)) {
      nextRound(clone);
    }

    room.game = clone;

    // Transition status
    if (isGameOver(room.game)) {
      room.status = "GAME_OVER";
    } else if (endOfRound(room.game)) {
      room.status = "WAITING";
    } else {
      room.status = "CHOOSING";
    }
  }
}

// Admin starts game (LOBBY → WAITING)
export function adminStartGame(roomCode: string) {
  const room = getOrCreateRoom(roomCode);
  if (room.status !== "LOBBY") {
    throw new Error("Can only start game from LOBBY status.");
  }
  if (room.participants.length === 0) {
    throw new Error("참가자가 1명 이상 필요합니다.");
  }
  const missingColour = room.participants.find((participant) => !participant.colour);
  if (missingColour) {
    throw new Error("참가자 색상 자동 배정에 실패했습니다.");
  }

  room.game = createGame(
    Math.random,
    room.participants.map((participant) => ({
      id: participant.id,
      name: participant.name,
      team: participant.colour as Colour,
    }))
  );
  room.status = "WAITING";
}

// Admin starts turn (WAITING → CHOOSING)
export function adminStartTurn(roomCode: string) {
  const room = getOrCreateRoom(roomCode);
  if (room.status !== "WAITING") {
    throw new Error("Cannot start turn from current status.");
  }
  if (isGameOver(room.game)) {
    room.status = "GAME_OVER";
    return;
  }
  room.status = "CHOOSING";
}

function isTileAction(action: TurnAction): boolean {
  return action.type === "SWAP_TILE" || action.type === "PLACE_OBSTACLE";
}

function actionLabel(action: TurnAction, currentHand: Card[]): string {
  if (action.type === "SWAP_TILE") {
    return "타일 교체";
  }
  if (action.type === "PLACE_OBSTACLE") {
    return "장애물 설치";
  }

  const card = currentHand[(action as MoveTurnAction).cardIndex];
  return card ? cardLabel(card) : "이동";
}

export function getPublicState(roomCode: string) {
  const room = getRoom(roomCode);
  if (!room) {
    return null;
  }
  
  const safeGame = deepClone(room.game);
  safeGame.players.forEach(p => {
    (p.hand as any) = Array(p.hand.length).fill({ kind: "HIDDEN" });
  });

  return {
    game: safeGame,
    participants: room.participants,
    logs: room.logs,
    status: room.status,
    activePlayerId: room.game.players.length > 0 ? nextPlayer(room.game).id : null,
  };
}

export function getPrivateState(roomCode: string, playerId: string) {
  const room = getRoom(roomCode);
  if (!room) {
    return null;
  }
  
  const player = room.game.players.find(p => p.id === playerId);
  const participant = room.participants.find(p => p.id === playerId);
  const stablePlayerId = player?.id ?? participant?.id;
  const isActive = room.game.players.length > 0 && nextPlayer(room.game).id === stablePlayerId;
  
  return {
    hand: player?.hand || [],
    isMyTurn: isActive && (room.status === "CHOOSING" || room.status === "ACTION_PHASE"),
    status: room.status,
    team: player?.team ?? participant?.colour,
    playerName: player?.name ?? participant?.name ?? player?.id,
  };
}

function nextAvailableColour(participants: LobbyParticipant[]): Colour {
  const counts = new Map<Colour, number>();
  for (const colour of COLOURS) {
    counts.set(colour, 0);
  }
  for (const participant of participants) {
    if (participant.colour) {
      counts.set(participant.colour, (counts.get(participant.colour) ?? 0) + 1);
    }
  }

  return (
    COLOURS.find((colour) => (counts.get(colour) ?? 0) < MAX_PLAYERS_PER_COLOUR) ??
    COLOURS[0]
  );
}
