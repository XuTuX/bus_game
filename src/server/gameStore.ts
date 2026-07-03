import {
  Colour,
  COLOURS,
  MAX_PLAYERS,
  MAX_PLAYERS_PER_COLOUR,
  type GameState,
  type TurnAction,
  type StepResult,
  type BusType,
  type Card,
  type MoveTurnAction,
  type TileTurnAction,
  createGame,
  nextPlayer,
  runTurn,
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

export type RoomStatus = "LOBBY" | "WAITING" | "CHOOSING" | "SUBMITTED" | "REVEALED" | "GAME_OVER";

export interface RoomState {
  game: GameState;
  participants: LobbyParticipant[];
  logs: LogEntry[];
  status: RoomStatus;
  logIdCounter: number;
  playerIdCounter: number;
  
  // Pending actions waiting to be revealed by admin
  pendingSubmit?: {
    playerId: string;
    actions: TurnAction[];
  };
}

const rooms = new Map<string, RoomState>();

export function hasRoom(roomCode: string): boolean {
  return rooms.has(roomCode);
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

// 1. Player submits actions and immediately reveals the result.
export function submitTurn(roomCode: string, playerId: string, actions: TurnAction[]) {
  const room = getOrCreateRoom(roomCode);
  
  if (room.status !== "CHOOSING") {
    throw new Error("Currently not in choosing phase.");
  }

  const player = nextPlayer(room.game);
  if (player.id !== playerId) {
    throw new Error(`It is not ${playerId}'s turn.`);
  }

  applyTurn(room, actions);
  room.pendingSubmit = undefined;
  room.status = isGameOver(room.game) ? "GAME_OVER" : "CHOOSING";
}

// 1.5. Admin starts game (Moves to WAITING)
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

// 2. Admin starts turn (Moves to CHOOSING)
export function adminStartTurn(roomCode: string) {
  const room = getOrCreateRoom(roomCode);
  if (room.status !== "WAITING" && room.status !== "REVEALED") {
    throw new Error("Cannot start turn from current status.");
  }
  if (isGameOver(room.game)) {
    room.status = "GAME_OVER";
    return;
  }
  room.status = "CHOOSING";
}

// 3. Admin reveals results (Moves to REVEALED)
export function adminRevealTurn(roomCode: string) {
  const room = getOrCreateRoom(roomCode);
  if (room.status !== "SUBMITTED" || !room.pendingSubmit) {
    throw new Error("No pending submission to reveal.");
  }

  applyTurn(room, room.pendingSubmit.actions);
  room.pendingSubmit = undefined;
  room.status = isGameOver(room.game) ? "GAME_OVER" : "REVEALED";
}

function applyTurn(room: RoomState, actions: TurnAction[]): void {
  const clone = deepClone(room.game);
  const player = nextPlayer(clone);

  const originalHand = [...player.hand];
  const actionDetails: LogEntry["actions"] = [];

  const results: StepResult[] = runTurn(player, actions, clone);
  
  let handCopy = [...originalHand];
  actions.forEach((action, i) => {
    const result = results[i];
    const label = actionLabel(action, handCopy);
    if (!isTileAction(action)) {
      handCopy.splice(action.cardIndex, 1);
    }
    actionDetails.push({
      actionLabel: label,
      bus: action.bus,
      applied: result.applied,
      reason: result.reason,
      scoreGained: result.scoreGained ?? 0,
    });
  });

  if (endOfRound(clone)) {
    nextRound(clone);
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
}

function isTileAction(action: TurnAction): action is TileTurnAction {
  return action.type === "BUFF_TILE" || action.type === "SWAP_TILE";
}

function actionLabel(action: TurnAction, currentHand: Card[]): string {
  if (isTileAction(action)) {
    return action.type === "BUFF_TILE" ? "버프" : "교체";
  }

  const card = currentHand[(action as MoveTurnAction).cardIndex];
  return card ? cardLabel(card) : "이동";
}

// 4. Admin moves to next turn/round (Moves to WAITING)
export function adminNext(roomCode: string) {
  const room = getOrCreateRoom(roomCode);
  if (room.status !== "REVEALED") {
    throw new Error("Can only go next after revealing.");
  }
  if (isGameOver(room.game)) {
    room.status = "GAME_OVER";
  } else {
    room.status = "WAITING";
  }
}

export function getPublicState(roomCode: string) {
  const room = getOrCreateRoom(roomCode);
  
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
  const room = getOrCreateRoom(roomCode);
  
  const player = room.game.players.find(p => p.id === playerId);
  const participant = room.participants.find(p => p.id === playerId);
  const stablePlayerId = player?.id ?? participant?.id;
  const isActive = room.game.players.length > 0 && nextPlayer(room.game).id === stablePlayerId;
  
  return {
    hand: player?.hand || [],
    isMyTurn: isActive && room.status === "CHOOSING",
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
