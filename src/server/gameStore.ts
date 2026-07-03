import {
  Colour,
  COLOURS,
  type GameState,
  type TurnAction,
  type StepResult,
  type BusType,
  type Card,
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
    cardLabel: string;
    bus: BusType;
    applied: boolean;
    reason?: string;
    regionsScored: number;
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

export function joinRoom(roomCode: string, name: string): LobbyParticipant {
  const room = getOrCreateRoom(roomCode);
  if (room.status !== "LOBBY") {
    throw new Error("이미 시작된 방에는 참가할 수 없습니다.");
  }
  if (room.participants.length >= COLOURS.length) {
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

export function choosePlayerColour(roomCode: string, playerId: string, colour: Colour) {
  const room = getOrCreateRoom(roomCode);
  if (room.status !== "LOBBY") {
    throw new Error("게임 시작 후에는 색상을 변경할 수 없습니다.");
  }
  if (!COLOURS.includes(colour)) {
    throw new Error("선택할 수 없는 색상입니다.");
  }

  const participant = room.participants.find((p) => p.id === playerId);
  if (!participant) {
    throw new Error("참가자를 찾을 수 없습니다.");
  }

  const taken = room.participants.some((p) => p.id !== playerId && p.colour === colour);
  if (taken) {
    throw new Error("이미 다른 참가자가 선택한 색상입니다.");
  }

  participant.colour = colour;
  return participant;
}

// 1. Player submits actions (Moves to SUBMITTED)
export function submitTurn(roomCode: string, playerId: string, actions: TurnAction[]) {
  const room = getOrCreateRoom(roomCode);
  
  if (room.status !== "CHOOSING") {
    throw new Error("Currently not in choosing phase.");
  }

  const player = nextPlayer(room.game);
  if (player.id !== playerId) {
    throw new Error(`It is not ${playerId}'s turn.`);
  }

  // Save actions, wait for admin to reveal
  room.pendingSubmit = {
    playerId,
    actions,
  };
  room.status = "SUBMITTED";
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
    throw new Error("모든 참가자가 딜러룸에서 색상을 선택해야 합니다.");
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

  const { playerId, actions } = room.pendingSubmit;
  const clone = deepClone(room.game);
  const player = nextPlayer(clone);

  const originalHand = [...player.hand];
  const actionDetails: LogEntry["actions"] = [];

  const results: StepResult[] = runTurn(player, actions, clone);
  
  let handCopy = [...originalHand];
  for (let i = 0; i < actions.length; i++) {
    const card: Card = handCopy[actions[i].cardIndex];
    handCopy.splice(actions[i].cardIndex, 1);
    actionDetails.push({
      cardLabel: cardLabel(card),
      bus: actions[i].bus,
      applied: results[i].applied,
      reason: results[i].reason,
      regionsScored: results[i].regions.length,
    });
  }

  if (endOfRound(clone)) {
    nextRound(clone);
  }

  const entry: LogEntry = {
    id: ++room.logIdCounter,
    playerId: player.id,
    team: player.team,
    actions: actionDetails,
    round: room.game.roundIndex + 1,
    turn: room.game.turnIndex + 1,
  };

  room.logs.unshift(entry);
  room.game = clone;
  room.pendingSubmit = undefined;
  room.status = isGameOver(room.game) ? "GAME_OVER" : "REVEALED";
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
  const participant = room.participants.find(p => p.id === playerId || p.name === playerId);
  const stablePlayerId = player?.id ?? participant?.id;
  const isActive = room.game.players.length > 0 && nextPlayer(room.game).id === stablePlayerId;
  
  return {
    hand: player?.hand || [],
    isMyTurn: isActive && room.status === "CHOOSING",
    status: room.status,
    team: player?.team ?? participant?.colour,
    playerName: player?.id ?? participant?.name,
    selectedColour: participant?.colour,
    availableColours: COLOURS.filter(
      (colour) => !room.participants.some((p) => p.id !== participant?.id && p.colour === colour)
    ),
  };
}
