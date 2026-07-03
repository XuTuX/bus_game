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
  runMovePhase,
  runActionPhase,
  endOfRound,
  nextRound,
  isGameOver,
  cardLabel,
  getConnectedComponentSize,
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
  pendingMoves: {
    PLUS?: MoveTurnAction[];
    MINUS?: MoveTurnAction[];
  };
  pendingActions: {
    PLUS?: TurnAction | null;
    MINUS?: TurnAction | null;
  };
}

interface TurnControllers {
  plusPlayer?: GameState["players"][number];
  minusPlayer?: GameState["players"][number];
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
      pendingMoves: {},
      pendingActions: {},
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
export function submitTurn(
  roomCode: string,
  playerId: string,
  actions: TurnAction[],
  submittedBus?: BusType
) {
  const room = getOrCreateRoom(roomCode);

  if (room.status !== "CHOOSING" && room.status !== "ACTION_PHASE") {
    throw new Error("현재 제출 가능한 단계가 아닙니다.");
  }

  const player = room.game.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error("플레이어를 찾을 수 없습니다.");
  }

  const { plusPlayer, minusPlayer } = getTurnControllers(room.game);

  const isPlusController = player.id === plusPlayer?.id;
  const isMinusController = player.id === minusPlayer?.id;

  if (!isPlusController && !isMinusController) {
    throw new Error("이번 차례의 조작 권한이 없습니다.");
  }

  // Infer which bus they are submitting for
  let bus = submittedBus;
  if (!bus) {
    if (isPlusController && !isMinusController) bus = BusType.PLUS;
    else if (isMinusController && !isPlusController) bus = BusType.MINUS;
    else {
      // Yellow player: check if actions specify a bus
      const firstAction = actions[0];
      if (firstAction && "bus" in firstAction) {
        bus = firstAction.bus;
      } else {
        bus = BusType.PLUS;
      }
    }
  }

  // Validate bus authority
  if (bus === BusType.PLUS && !isPlusController) {
    throw new Error("PLUS 버스 조작 권한이 없습니다.");
  }
  if (bus === BusType.MINUS && !isMinusController) {
    throw new Error("MINUS 버스 조작 권한이 없습니다.");
  }
  if (
    room.status === "CHOOSING" &&
    bus === BusType.MINUS &&
    plusPlayer?.id === minusPlayer?.id &&
    !room.pendingMoves.PLUS
  ) {
    throw new Error("한 명이 두 버스를 조작할 때는 PLUS 이동을 먼저 제출해야 합니다.");
  }

  if (room.status === "CHOOSING") {
    // 1. Move Submission
    if (bus === BusType.PLUS) {
      room.pendingMoves.PLUS = actions as MoveTurnAction[];
    } else {
      room.pendingMoves.MINUS = actions as MoveTurnAction[];
    }

    // Auto-pass missing controllers to avoid deadlocks
    if (!plusPlayer) room.pendingMoves.PLUS = [];
    if (!minusPlayer) room.pendingMoves.MINUS = [];

    // Check if both moves are submitted
    if (room.pendingMoves.PLUS && room.pendingMoves.MINUS) {
      const clone = deepClone(room.game);
      const actionDetails: LogEntry["actions"] = [];

      // A. Apply PLUS moves
      if (plusPlayer) {
        const plusPlayerInClone = findClonePlayer(clone, plusPlayer.id);
        const plusMoves = room.pendingMoves.PLUS;
        const handCopy = [...plusPlayerInClone.hand];
        const results = runMovePhase(plusPlayerInClone, plusMoves, clone);

        plusMoves.forEach((move, i) => {
          const result = results[i];
          const label = actionLabel(move, handCopy);
          actionDetails.push({
            actionLabel: label,
            bus: BusType.PLUS,
            applied: result.applied,
            reason: result.reason,
            scoreGained: result.scoreGained ?? 0,
          });
        });
        if (plusMoves.length === 0) {
          actionDetails.push({
            actionLabel: "이동 패스",
            bus: BusType.PLUS,
            applied: true,
            scoreGained: 0,
          });
        }
      }

      // B. Apply MINUS moves
      if (minusPlayer) {
        const minusPlayerInClone = findClonePlayer(clone, minusPlayer.id);
        const minusMoves = room.pendingMoves.MINUS;
        const handCopy = [...minusPlayerInClone.hand];
        const results = runMovePhase(minusPlayerInClone, minusMoves, clone);

        minusMoves.forEach((move, i) => {
          const result = results[i];
          const label = actionLabel(move, handCopy);
          actionDetails.push({
            actionLabel: label,
            bus: BusType.MINUS,
            applied: result.applied,
            reason: result.reason,
            scoreGained: result.scoreGained ?? 0,
          });
        });
        if (minusMoves.length === 0) {
          actionDetails.push({
            actionLabel: "이동 패스",
            bus: BusType.MINUS,
            applied: true,
            scoreGained: 0,
          });
        }
      }

      // Create log entry
      const entry: LogEntry = {
        id: ++room.logIdCounter,
        playerId: `${plusPlayer?.name ?? "PLUS"} & ${minusPlayer?.name ?? "MINUS"}`,
        team: "Blue", // Mixed indicator
        actions: actionDetails,
        round: room.game.roundIndex + 1,
        turn: room.game.turnIndex + 1,
      };
      room.logs.unshift(entry);

      room.game = clone;
      room.status = "ACTION_PHASE";
      room.pendingMoves = {};
    }
  } else if (room.status === "ACTION_PHASE") {
    // 2. Action Submission
    const action = actions[0] as SwapTileTurnAction | PlaceObstacleTurnAction | undefined;
    if (bus === BusType.PLUS) {
      room.pendingActions.PLUS = action || null;
    } else {
      room.pendingActions.MINUS = action || null;
    }

    // Auto-pass missing controllers to avoid deadlocks
    if (!plusPlayer) room.pendingActions.PLUS = null;
    if (!minusPlayer) room.pendingActions.MINUS = null;

    // Check if both actions are submitted
    if (room.pendingActions.PLUS !== undefined && room.pendingActions.MINUS !== undefined) {
      const clone = deepClone(room.game);
      const actionDetails: LogEntry["actions"] = [];

      // A. Apply PLUS Action
      if (plusPlayer) {
        const plusPlayerInClone = findClonePlayer(clone, plusPlayer.id);
        const plusAction = room.pendingActions.PLUS;
        const result = runActionPhase(plusPlayerInClone, plusAction as any, clone);
        if (plusAction) {
          actionDetails.push({
            actionLabel: plusAction.type === "SWAP_TILE" ? "타일 교체" : "장애물 설치",
            bus: BusType.PLUS,
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
      }

      // B. Apply MINUS Action
      if (minusPlayer) {
        const minusPlayerInClone = findClonePlayer(clone, minusPlayer.id);
        const minusAction = room.pendingActions.MINUS;
        const result = runActionPhase(minusPlayerInClone, minusAction as any, clone);
        if (minusAction) {
          actionDetails.push({
            actionLabel: minusAction.type === "SWAP_TILE" ? "타일 교체" : "장애물 설치",
            bus: BusType.MINUS,
            applied: result.applied,
            reason: result.reason,
            scoreGained: 0,
          });
        } else {
          actionDetails.push({
            actionLabel: "행동 패스",
            bus: BusType.MINUS,
            applied: true,
            scoreGained: 0,
          });
        }
      }

      // C. Calculate connection-based region component scores for both buses
      const allWalls = [
        ...clone.buses.PLUS.walls,
        ...clone.buses.MINUS.walls,
      ];

      // PLUS component scoring (+ N)
      const plusBus = clone.buses.PLUS;
      const plusSize = getConnectedComponentSize(plusBus.pos, clone.board, allWalls);
      const plusColor = clone.board[plusBus.pos.y]?.[plusBus.pos.x]?.colour;
      if (plusColor) {
        clone.teamScores[plusColor] += plusSize;
      }

      // MINUS component scoring (- M)
      const minusBus = clone.buses.MINUS;
      const minusSize = getConnectedComponentSize(minusBus.pos, clone.board, allWalls);
      const minusColor = clone.board[minusBus.pos.y]?.[minusBus.pos.x]?.colour;
      if (minusColor) {
        clone.teamScores[minusColor] -= minusSize;
      }

      // Create log entry
      const entry: LogEntry = {
        id: ++room.logIdCounter,
        playerId: `${plusPlayer?.name ?? "PLUS"} & ${minusPlayer?.name ?? "MINUS"}`,
        team: "Blue",
        actions: actionDetails,
        round: clone.roundIndex + 1,
        turn: clone.turnIndex + 1,
      };
      room.logs.unshift(entry);

      // Advance turn index (round consists of 5 turn indices)
      clone.turnIndex = (clone.turnIndex + 1) % 5;

      if (endOfRound(clone)) {
        nextRound(clone);
      }

      room.game = clone;

      // Transition room status
      if (isGameOver(room.game)) {
        room.status = "GAME_OVER";
      } else if (endOfRound(room.game)) {
        room.status = "WAITING";
      } else {
        room.status = "CHOOSING";
      }

      room.pendingActions = {};
    }
  }
}

// Admin starts game (LOBBY → WAITING)
export function adminStartGame(roomCode: string) {
  const room = getOrCreateRoom(roomCode);
  if (room.status !== "LOBBY") {
    throw new Error("이미 게임이 시작되었습니다.");
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
  if (isGameOver(room.game)) {
    room.status = "GAME_OVER";
    return;
  }
  if (room.status === "CHOOSING" || room.status === "ACTION_PHASE") {
    return;
  }
  if (room.status === "LOBBY") {
    throw new Error("게임 시작 후 딜러룸 입력을 시작할 수 있습니다.");
  }
  if (room.status !== "WAITING") {
    throw new Error("현재 상태에서는 딜러룸 입력을 시작할 수 없습니다.");
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

  let activePlayerNames: string | null = null;
  if (room.game.players.length > 0) {
    const { plusPlayer, minusPlayer } = getTurnControllers(room.game);

    let names: string[] = [];
    if (room.status === "CHOOSING") {
      if (plusPlayer && !room.pendingMoves.PLUS) names.push(`${plusPlayer.name}(PLUS)`);
      if (minusPlayer && !room.pendingMoves.MINUS && minusPlayer.id !== plusPlayer?.id) names.push(`${minusPlayer.name}(MINUS)`);
    } else if (room.status === "ACTION_PHASE") {
      if (plusPlayer && room.pendingActions.PLUS === undefined) names.push(`${plusPlayer.name}(PLUS)`);
      if (minusPlayer && room.pendingActions.MINUS === undefined && minusPlayer.id !== plusPlayer?.id) names.push(`${minusPlayer.name}(MINUS)`);
    }
    
    if (names.length > 0) {
      activePlayerNames = names.join(" & ");
    }
  }

  return {
    game: safeGame,
    participants: room.participants,
    logs: room.logs,
    status: room.status,
    activePlayerNames,
    pendingMoves: {
      PLUS: !!room.pendingMoves.PLUS,
      MINUS: !!room.pendingMoves.MINUS,
    },
    pendingActions: {
      PLUS: room.pendingActions.PLUS !== undefined,
      MINUS: room.pendingActions.MINUS !== undefined,
    },
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

  if (room.game.players.length === 0) {
    return {
      hand: [],
      isMyTurn: false,
      status: room.status,
      team: participant?.colour,
      playerName: participant?.name,
    };
  }

  const { plusPlayer, minusPlayer } = getTurnControllers(room.game);

  const isPlusController = stablePlayerId === plusPlayer?.id;
  const isMinusController = stablePlayerId === minusPlayer?.id;
  const hand = getVisiblePrivateHand(room, stablePlayerId);

  let isMyTurn = false;
  if (room.status === "CHOOSING") {
    const plusSubmitted = !!room.pendingMoves.PLUS;
    const minusSubmitted = !!room.pendingMoves.MINUS;

    const plusNeedsToSubmit = isPlusController && !plusSubmitted;
    const minusNeedsToSubmit = isMinusController && !minusSubmitted;

    isMyTurn = plusNeedsToSubmit || minusNeedsToSubmit;
  } else if (room.status === "ACTION_PHASE") {
    const plusSubmitted = room.pendingActions.PLUS !== undefined;
    const minusSubmitted = room.pendingActions.MINUS !== undefined;

    const plusNeedsToSubmit = isPlusController && !plusSubmitted;
    const minusNeedsToSubmit = isMinusController && !minusSubmitted;

    isMyTurn = plusNeedsToSubmit || minusNeedsToSubmit;
  }
  
  return {
    hand,
    isMyTurn,
    isPlusController,
    isMinusController,
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

function getTurnControllers(game: GameState): TurnControllers {
  const plusTeamColor = COLOURS[game.turnIndex];
  const minusTeamColor = COLOURS[COLOURS.length - 1 - game.turnIndex];
  const plusTeamPlayers = game.players.filter((p) => p.team === plusTeamColor);
  const minusTeamPlayers = game.players.filter((p) => p.team === minusTeamColor);

  return {
    plusPlayer: plusTeamPlayers[0],
    minusPlayer: minusTeamPlayers[1] || minusTeamPlayers[0],
  };
}

function findClonePlayer(game: GameState, playerId: string): GameState["players"][number] {
  const player = game.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error("플레이어를 찾을 수 없습니다.");
  }
  return player;
}

function getVisiblePrivateHand(room: RoomState, playerId?: string): Card[] {
  const player = room.game.players.find((p) => p.id === playerId);
  if (!player) {
    return [];
  }

  const { plusPlayer, minusPlayer } = getTurnControllers(room.game);
  if (
    room.status !== "CHOOSING" ||
    plusPlayer?.id !== playerId ||
    minusPlayer?.id !== playerId ||
    !room.pendingMoves.PLUS ||
    room.pendingMoves.MINUS
  ) {
    return player.hand;
  }

  const hand = [...player.hand];
  for (const move of room.pendingMoves.PLUS) {
    if (move.cardIndex >= 0 && move.cardIndex < hand.length) {
      hand.splice(move.cardIndex, 1);
    }
  }
  return hand;
}
