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

  const { bus1Player, bus2Player } = getTurnControllers(room.game);

  const isBus1Controller = player.id === bus1Player?.id;
  const isBus2Controller = player.id === bus2Player?.id;

  if (!isBus1Controller && !isBus2Controller) {
    throw new Error("이번 차례의 조작 권한이 없습니다.");
  }

  let bus = submittedBus;
  if (!bus) {
    if (isBus1Controller && !isBus2Controller) bus = BusType.BUS1;
    else if (isBus2Controller && !isBus1Controller) bus = BusType.BUS2;
    else {
      const firstAction = actions[0];
      if (firstAction && "bus" in firstAction && firstAction.bus) {
        bus = firstAction.bus;
      } else {
        bus = BusType.BUS1;
      }
    }
  }

  if (bus === BusType.BUS1 && !isBus1Controller) {
    throw new Error("BUS1 버스 조작 권한이 없습니다.");
  }
  if (bus === BusType.BUS2 && !isBus2Controller) {
    throw new Error("BUS2 버스 조작 권한이 없습니다.");
  }
  if (
    room.status === "CHOOSING" &&
    bus === BusType.BUS2 &&
    bus1Player?.id === bus2Player?.id &&
    !room.pendingMoves.BUS1
  ) {
    throw new Error("한 명이 두 버스를 조작할 때는 BUS1 이동을 먼저 제출해야 합니다.");
  }

  if (room.status === "CHOOSING") {
    submitMovePhase(room, actions as MoveTurnAction[], bus);
  } else {
    submitActionPhase(room, actions[0] as ActionPhaseTurnAction | undefined, bus);
  }
}

function submitMovePhase(room: RoomState, actions: MoveTurnAction[], bus: BusType) {
  const { bus1Player, bus2Player } = getTurnControllers(room.game);

  if (bus === BusType.BUS1) {
    room.pendingMoves.BUS1 = actions;
  } else {
    room.pendingMoves.BUS2 = actions;
  }

  if (!bus1Player) room.pendingMoves.BUS1 = [];
  if (!bus2Player) room.pendingMoves.BUS2 = [];

  if (!room.pendingMoves.BUS1 || !room.pendingMoves.BUS2) {
    return;
  }

  const clone = deepClone(room.game);
  clone.swappedTiles = [];
  const actionDetails: LogEntry["actions"] = [];

  if (bus1Player) {
    appendMoveLogActions(
      actionDetails,
      clone,
      bus1Player.id,
      room.pendingMoves.BUS1,
      BusType.BUS1
    );
  }

  if (bus2Player) {
    appendMoveLogActions(
      actionDetails,
      clone,
      bus2Player.id,
      room.pendingMoves.BUS2,
      BusType.BUS2
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
  const { bus1Player, bus2Player } = getTurnControllers(room.game);

  if (bus === BusType.BUS1) {
    room.pendingActions.BUS1 = action || null;
  } else {
    room.pendingActions.BUS2 = action || null;
  }

  if (!bus1Player) room.pendingActions.BUS1 = null;
  if (!bus2Player) room.pendingActions.BUS2 = null;

  if (
    room.pendingActions.BUS1 === undefined ||
    room.pendingActions.BUS2 === undefined
  ) {
    return;
  }

  const clone = deepClone(room.game);
  const actionDetails: LogEntry["actions"] = [];

  if (bus1Player) {
    appendActionLogAction(
      actionDetails,
      clone,
      bus1Player.id,
      room.pendingActions.BUS1,
      BusType.BUS1
    );
  }

  if (bus2Player) {
    appendActionLogAction(
      actionDetails,
      clone,
      bus2Player.id,
      room.pendingActions.BUS2,
      BusType.BUS2
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
  const { bus1Player, bus2Player } = getTurnControllers(room.game);
  room.logs.unshift({
    id: ++room.logIdCounter,
    playerId: `${bus1Player?.name ?? "BUS1"} & ${bus2Player?.name ?? "BUS2"}`,
    team: "Blue",
    actions,
    round,
    turn,
  });
}

function scoreCurrentBusRegions(game: GameState) {
  const allWalls = [
    ...game.buses.BUS1.walls,
    ...game.buses.BUS2.walls,
  ];

  const bus1State = game.buses.BUS1;
  const bus1Size = getConnectedComponentSize(bus1State.pos, game.board, allWalls);
  const bus1Color = game.board[bus1State.pos.y]?.[bus1State.pos.x]?.colour;
  if (bus1Color) {
    game.teamScores[bus1Color] += bus1Size;
  }

  const bus2State = game.buses.BUS2;
  const bus2Size = getConnectedComponentSize(bus2State.pos, game.board, allWalls);
  const bus2Color = game.board[bus2State.pos.y]?.[bus2State.pos.x]?.colour;
  if (bus2Color) {
    game.teamScores[bus2Color] -= bus2Size;
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
