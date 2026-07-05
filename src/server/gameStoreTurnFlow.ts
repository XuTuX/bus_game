import {
  BusType,
  COLOURS,
  cardLabel,
  endOfRound,
  getConnectedComponentSize,
  isGameOver,
  nextRound,
  runActionPhase,
  runMovePhase,
  type Card,
  type GameState,
  type MoveTurnAction,
  type TurnAction,
} from "@/lib/game";
import {
  clearPhaseTimer,
  getRoomTimerSettings,
  startPhaseTimer,
} from "./gameStoreTimers";
import {
  type ActionPhaseTurnAction,
  type LogEntry,
  type RoomState,
} from "./gameStoreTypes";
import {
  deepClone,
  findClonePlayer,
  getTurnControllers,
} from "./gameStoreUtils";

export function submitTurnToRoom(
  room: RoomState,
  playerId: string,
  actions: TurnAction[],
  submittedBus?: BusType
) {
  // 제출은 이동 선택 단계와 행동 단계에서만 받습니다.
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

  let bus = submittedBus;
  if (!bus) {
    if (isPlusController && !isMinusController) bus = BusType.PLUS;
    else if (isMinusController && !isPlusController) bus = BusType.MINUS;
    else {
      const firstAction = actions[0];
      if (firstAction && "bus" in firstAction) {
        bus = firstAction.bus;
      } else {
        bus = BusType.PLUS;
      }
    }
  }

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
    submitMovePhase(room, actions as MoveTurnAction[], bus);
  } else {
    submitActionPhase(room, actions[0] as ActionPhaseTurnAction | undefined, bus);
  }
}

function submitMovePhase(room: RoomState, actions: MoveTurnAction[], bus: BusType) {
  const { plusPlayer, minusPlayer } = getTurnControllers(room.game);

  if (bus === BusType.PLUS) {
    room.pendingMoves.PLUS = actions;
  } else {
    room.pendingMoves.MINUS = actions;
  }

  if (!plusPlayer) room.pendingMoves.PLUS = [];
  if (!minusPlayer) room.pendingMoves.MINUS = [];

  if (!room.pendingMoves.PLUS || !room.pendingMoves.MINUS) {
    return;
  }

  const clone = deepClone(room.game);
  const actionDetails: LogEntry["actions"] = [];

  if (plusPlayer) {
    appendMoveLogActions(
      actionDetails,
      clone,
      plusPlayer.id,
      room.pendingMoves.PLUS,
      BusType.PLUS
    );
  }

  if (minusPlayer) {
    appendMoveLogActions(
      actionDetails,
      clone,
      minusPlayer.id,
      room.pendingMoves.MINUS,
      BusType.MINUS
    );
  }

  addTurnLog(room, actionDetails, room.game.roundIndex + 1, room.game.turnIndex + 1);

  room.game = clone;
  room.status = "ACTION_PHASE";
  room.pendingMoves = {};
  startPhaseTimer(room, getRoomTimerSettings(room).actionPhaseSeconds);
}

function submitActionPhase(
  room: RoomState,
  action: ActionPhaseTurnAction | undefined,
  bus: BusType
) {
  const { plusPlayer, minusPlayer } = getTurnControllers(room.game);

  if (bus === BusType.PLUS) {
    room.pendingActions.PLUS = action || null;
  } else {
    room.pendingActions.MINUS = action || null;
  }

  if (!plusPlayer) room.pendingActions.PLUS = null;
  if (!minusPlayer) room.pendingActions.MINUS = null;

  if (
    room.pendingActions.PLUS === undefined ||
    room.pendingActions.MINUS === undefined
  ) {
    return;
  }

  const clone = deepClone(room.game);
  const actionDetails: LogEntry["actions"] = [];

  if (plusPlayer) {
    appendActionLogAction(
      actionDetails,
      clone,
      plusPlayer.id,
      room.pendingActions.PLUS,
      BusType.PLUS
    );
  }

  if (minusPlayer) {
    appendActionLogAction(
      actionDetails,
      clone,
      minusPlayer.id,
      room.pendingActions.MINUS,
      BusType.MINUS
    );
  }

  scoreCurrentBusRegions(clone);
  addTurnLog(room, actionDetails, clone.roundIndex + 1, clone.turnIndex + 1);

  clone.turnIndex = (clone.turnIndex + 1) % COLOURS.length;

  if (endOfRound(clone)) {
    nextRound(clone);
  }

  room.game = clone;

  if (isGameOver(room.game)) {
    room.status = "GAME_OVER";
    clearPhaseTimer(room);
  } else if (endOfRound(room.game)) {
    room.status = "WAITING";
    clearPhaseTimer(room);
  } else {
    room.status = "CHOOSING";
    startPhaseTimer(room, getRoomTimerSettings(room).movePhaseSeconds);
  }

  room.pendingActions = {};
}

function appendMoveLogActions(
  actionDetails: LogEntry["actions"],
  game: GameState,
  playerId: string,
  moves: MoveTurnAction[],
  bus: BusType
) {
  const player = findClonePlayer(game, playerId);
  const handCopy = [...player.hand];
  const results = runMovePhase(player, moves, game);

  moves.forEach((move, index) => {
    const result = results[index];
    actionDetails.push({
      actionLabel: actionLabel(move, handCopy),
      bus,
      applied: result.applied,
      reason: result.reason,
      scoreGained: result.scoreGained ?? 0,
    });
  });

  if (moves.length === 0) {
    actionDetails.push({
      actionLabel: "이동 패스",
      bus,
      applied: true,
      scoreGained: 0,
    });
  }
}

function appendActionLogAction(
  actionDetails: LogEntry["actions"],
  game: GameState,
  playerId: string,
  action: ActionPhaseTurnAction | null,
  bus: BusType
) {
  const player = findClonePlayer(game, playerId);
  const result = runActionPhase(player, action, game);

  actionDetails.push({
    actionLabel: action ? actionPhaseLabel(action) : "행동 패스",
    bus,
    applied: action ? result.applied : true,
    reason: action ? result.reason : undefined,
    scoreGained: 0,
  });
}

function addTurnLog(
  room: RoomState,
  actions: LogEntry["actions"],
  round: number,
  turn: number
) {
  const { plusPlayer, minusPlayer } = getTurnControllers(room.game);
  room.logs.unshift({
    id: ++room.logIdCounter,
    playerId: `${plusPlayer?.name ?? "PLUS"} & ${minusPlayer?.name ?? "MINUS"}`,
    team: "Blue",
    actions,
    round,
    turn,
  });
}

function scoreCurrentBusRegions(game: GameState) {
  const allWalls = [
    ...game.buses.PLUS.walls,
    ...game.buses.MINUS.walls,
  ];

  const plusBus = game.buses.PLUS;
  const plusSize = getConnectedComponentSize(plusBus.pos, game.board, allWalls);
  const plusColor = game.board[plusBus.pos.y]?.[plusBus.pos.x]?.colour;
  if (plusColor) {
    game.teamScores[plusColor] += plusSize;
  }

  const minusBus = game.buses.MINUS;
  const minusSize = getConnectedComponentSize(minusBus.pos, game.board, allWalls);
  const minusColor = game.board[minusBus.pos.y]?.[minusBus.pos.x]?.colour;
  if (minusColor) {
    game.teamScores[minusColor] -= minusSize;
  }
}

function actionLabel(action: TurnAction, currentHand: Card[]): string {
  if (action.type === "SWAP_TILE") {
    return "타일 위치 교환";
  }
  if (action.type === "PLACE_OBSTACLE") {
    return "장애물 설치";
  }

  const card = currentHand[(action as MoveTurnAction).cardIndex];
  return card ? cardLabel(card) : "이동";
}

function actionPhaseLabel(action: ActionPhaseTurnAction): string {
  return action.type === "SWAP_TILE" ? "타일 위치 교환" : "장애물 설치";
}
