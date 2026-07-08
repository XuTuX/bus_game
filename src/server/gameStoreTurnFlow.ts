import {
  BusType,
  cardLabel,
  getConnectedComponentSize,
  runActionPhase,
  runMovePhase,
  scoreMatchingBusDestinationBonus,
  scoreSubwayTiles,
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
  type SubwayMoveSubmission,
} from "./gameStoreTypes";
import {
  deepClone,
  findClonePlayer,
  getSubwayMoveTeams,
  getTurnControllers,
} from "./gameStoreUtils";

export function submitTurnToRoom(
  room: RoomState,
  playerId: string,
  actions: TurnAction[],
  submittedBus?: BusType,
  mode: "BUS" | "SUBWAY" = "BUS"
) {
  // 제출은 이동 선택 단계와 행동 단계에서만 받습니다.
  if (room.status !== "CHOOSING" && room.status !== "ACTION_PHASE") {
    throw new Error("현재 제출 가능한 단계가 아닙니다.");
  }

  const player = room.game.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error("플레이어를 찾을 수 없습니다.");
  }

  if (mode === "SUBWAY") {
    submitSubwayMovePhase(room, player, actions as MoveTurnAction[]);
    return;
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

  if (actions.length === 0) {
    throw new Error("버스 이동은 패스할 수 없습니다. 카드 1장 이상을 제출하세요.");
  }

  if (bus === BusType.BUS1) {
    room.pendingMoves.BUS1 = actions;
  } else {
    room.pendingMoves.BUS2 = actions;
  }

  if (!bus1Player) room.pendingMoves.BUS1 = [];
  if (!bus2Player) room.pendingMoves.BUS2 = [];

  resolveMovePhaseIfReady(room);
}

function submitSubwayMovePhase(
  room: RoomState,
  player: GameState["players"][number],
  actions: MoveTurnAction[]
) {
  room.pendingSubwayMoves ??= {};

  if (room.status !== "CHOOSING" && room.status !== "ACTION_PHASE") {
    throw new Error("지하철은 이동 단계부터 행동 단계가 끝나기 전까지 조작할 수 있습니다.");
  }

  if (actions.length > 1) {
    throw new Error("지하철 조작 카드는 플레이어당 최대 1장만 낼 수 있습니다.");
  }

  const action = actions[0];
  const subway = BusType.BUS1;

  const { busTeam } = getTurnControllers(room.game);
  if (player.team === busTeam) {
    throw new Error("버스를 조작하는 팀은 이번 차례 지하철을 조작할 수 없습니다.");
  }

  const subwayTeams = getSubwayMoveTeams(room.game);
  if (!subwayTeams.includes(player.team)) {
    throw new Error("이번 차례 지하철 조작 대상 팀이 아닙니다.");
  }

  if (room.pendingSubwayMoves[player.id]) {
    throw new Error("이미 지하철 제출이 완료되었습니다.");
  }

  if (action && (action.cardIndex < 0 || action.cardIndex >= player.hand.length)) {
    throw new Error(`Invalid card index ${action.cardIndex}`);
  }

  room.pendingSubwayMoves[player.id] = {
    playerId: player.id,
    playerName: player.name,
    team: player.team,
    subway,
    action: action
      ? {
          type: "MOVE",
          bus: subway,
          subway: true,
          cardIndex: action.cardIndex,
        }
      : null,
    cardKind: action ? player.hand[action.cardIndex]?.kind : undefined,
    submittedOrder: nextSubwaySubmissionOrder(room),
  };

  if (room.status === "ACTION_PHASE") {
    return;
  }
}

function resolveMovePhaseIfReady(room: RoomState) {
  const { bus1Player, bus2Player } = getTurnControllers(room.game);
  room.pendingSubwayMoves ??= {};

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

  const beforeDestinationBonus = { ...clone.teamScores };
  const { busTeam } = getTurnControllers(clone);
  scoreMatchingBusDestinationBonus(
    clone,
    [busTeam]
  );
  appendScoreDeltaLogActions(
    actionDetails,
    beforeDestinationBonus,
    clone.teamScores,
    "두 버스 같은 색 도착 보너스"
  );

  const beforeDistanceScores = { ...clone.teamScores };
  const distancePenalty = scoreBusDistancePenalty(clone, busTeam);
  appendScoreDeltaLogActions(
    actionDetails,
    beforeDistanceScores,
    clone.teamScores,
    distancePenalty
      ? `버스 간 거리 ${distancePenalty.distance}칸 감점`
      : "버스 간 거리 감점"
  );

  addTurnLog(room, actionDetails, room.game.roundIndex + 1, room.game.turnIndex + 1, "MOVE");

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

  if (!action) {
    throw new Error("버스 행동은 패스할 수 없습니다. 교환할 타일을 선택해 제출하세요.");
  }

  if (bus === BusType.BUS1) {
    room.pendingActions.BUS1 = action;
  } else {
    room.pendingActions.BUS2 = action;
  }

  if (!bus1Player) room.pendingActions.BUS1 = null;
  if (!bus2Player) room.pendingActions.BUS2 = null;

  return;
}

export function finalizeTurnResult(room: RoomState) {
  if (room.status !== "ACTION_PHASE") {
    throw new Error("행동 단계에서만 이번 턴을 종료할 수 있습니다.");
  }

  const { bus1Player, bus2Player } = getTurnControllers(room.game);
  room.pendingSubwayMoves ??= {};

  if (!bus1Player) room.pendingActions.BUS1 = null;
  if (!bus2Player) room.pendingActions.BUS2 = null;

  if (
    room.pendingActions.BUS1 === undefined ||
    room.pendingActions.BUS2 === undefined
  ) {
    throw new Error("아직 두 버스의 행동 제출이 끝나지 않았습니다.");
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

  const beforeRegionScores = { ...clone.teamScores };
  scoreCurrentBusRegions(clone);
  appendScoreDeltaLogActions(
    actionDetails,
    beforeRegionScores,
    clone.teamScores,
    "버스 도착 칸 영역 점수"
  );

  let subwayActionApplied = false;
  getOrderedSubwaySubmissions(room).forEach((submission) => {
    subwayActionApplied = appendSubwayLogAction(actionDetails, clone, submission) || subwayActionApplied;
  });

  if (subwayActionApplied) {
    const beforeSubwayScores = { ...clone.teamScores };
    scoreSubwayTiles(clone);
    appendScoreDeltaLogActions(
      actionDetails,
      beforeSubwayScores,
      clone.teamScores,
      "지하철 점수"
    );
  }

  addTurnLog(room, actionDetails, clone.roundIndex + 1, clone.turnIndex + 1, "ACTION");

  room.game = clone;
  room.status = "RESULT_PHASE";
  clearPhaseTimer(room);
  room.pendingActions = {};
  room.pendingSubwayMoves = {};
  room.subwaySubmissionCounter = 0;
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
  const results = runMovePhase(player, moves, game, { scoreSubwaysAtEnd: false });

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

}

function appendSubwayLogAction(
  actionDetails: LogEntry["actions"],
  game: GameState,
  submission: SubwayMoveSubmission
): boolean {
  const player = game.players.find((p) => p.id === submission.playerId);
  const subwayLabel = "지하철";

  if (!submission.action) {
    actionDetails.push({
      actionLabel: `${subwayLabel} 패스`,
      bus: BusType.BUS1,
      applied: true,
      scoreGained: 0,
    });
    return false;
  }

  if (!player) {
    actionDetails.push({
      actionLabel: `${subwayLabel} 이동`,
      bus: BusType.BUS1,
      applied: false,
      reason: "제출 플레이어를 찾을 수 없습니다.",
      scoreGained: 0,
    });
    return false;
  }

  const cardIndex =
    submission.cardKind === undefined
      ? submission.action.cardIndex
      : player.hand.findIndex((card) => card.kind === submission.cardKind);

  if (cardIndex < 0) {
    actionDetails.push({
      actionLabel: `${subwayLabel} 이동`,
      bus: BusType.BUS1,
      applied: false,
      reason: "제출한 이동 카드가 손패에 남아있지 않습니다.",
      scoreGained: 0,
    });
    return false;
  }

  const moveAction: MoveTurnAction = {
    ...submission.action,
    bus: BusType.BUS1,
    subway: true,
    cardIndex,
  };
  const [result] = runMovePhase(player, [moveAction], game, {
    scoreSubwaysAtEnd: false,
  });

  actionDetails.push({
    actionLabel: `${subwayLabel} ${subwayCardLabel(submission.cardKind)}`,
    bus: BusType.BUS1,
    applied: result.applied,
    reason: result.reason,
    scoreGained: result.scoreGained ?? 0,
  });
  return result.applied;
}

function appendScoreDeltaLogActions(
  actionDetails: LogEntry["actions"],
  beforeScores: GameState["teamScores"],
  afterScores: GameState["teamScores"],
  label: string
) {
  for (const team of Object.keys(afterScores) as (keyof GameState["teamScores"])[]) {
    const delta = afterScores[team] - beforeScores[team];
    if (delta === 0) continue;
    actionDetails.push({
      actionLabel: `${label}: ${team}`,
      bus: BusType.BUS1,
      applied: true,
      scoreGained: delta,
    });
  }
}

function subwayCardLabel(cardKind?: Card["kind"]): string {
  if (cardKind === "STRAIGHT1") return "직진 x 1";
  if (cardKind === "STRAIGHT2") return "직진 x 2";
  if (cardKind === "STRAIGHT3") return "직진 x 3";
  if (cardKind === "LEFT") return "좌회전";
  if (cardKind === "RIGHT") return "우회전";
  return "이동";
}

function getOrderedSubwaySubmissions(room: RoomState): SubwayMoveSubmission[] {
  return Object.values(room.pendingSubwayMoves ?? {}).sort(
    (a, b) => (a.submittedOrder ?? 0) - (b.submittedOrder ?? 0)
  );
}

function nextSubwaySubmissionOrder(room: RoomState): number {
  room.subwaySubmissionCounter =
    (room.subwaySubmissionCounter ??
      Math.max(
        0,
        ...Object.values(room.pendingSubwayMoves ?? {}).map(
          (submission) => submission.submittedOrder ?? 0
        )
      )) + 1;
  return room.subwaySubmissionCounter;
}

function appendActionLogAction(
  actionDetails: LogEntry["actions"],
  game: GameState,
  playerId: string,
  action: ActionPhaseTurnAction | null,
  bus: BusType
) {
  if (!action) {
    throw new Error("버스 행동 제출이 필요합니다.");
  }

  const player = findClonePlayer(game, playerId);
  const result = runActionPhase(player, action, game);

  actionDetails.push({
    actionLabel: actionPhaseLabel(action),
    bus,
    applied: result.applied,
    reason: result.reason,
    scoreGained: 0,
  });
}

function addTurnLog(
  room: RoomState,
  actions: LogEntry["actions"],
  round: number,
  turn: number,
  phase: LogEntry["phase"]
) {
  const { bus1Player, bus2Player } = getTurnControllers(room.game);
  room.logs.unshift({
    id: ++room.logIdCounter,
    playerId: `${bus1Player?.name ?? "BUS1"} & ${bus2Player?.name ?? "BUS2"}`,
    team: "Blue",
    phase,
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
    game.teamScores[bus2Color] += bus2Size;
  }
}

function scoreBusDistancePenalty(game: GameState, team: GameState["players"][number]["team"]) {
  const bus1 = game.buses.BUS1.pos;
  const bus2 = game.buses.BUS2.pos;
  const distance = Math.max(Math.abs(bus1.x - bus2.x), Math.abs(bus1.y - bus2.y));
  const penalty = distance <= 1 ? 5 : distance <= 2 ? 2 : 0;

  if (penalty > 0) {
    game.teamScores[team] -= penalty;
    game.logs.push(`두 버스 거리가 ${distance}칸 이내입니다. ${team}팀 -${penalty}점`);
    return { distance, penalty };
  }

  return null;
}


function actionLabel(action: TurnAction, currentHand: Card[]): string {
  if (action.type === "SWAP_TILE") {
    return "타일 위치 교환";
  }

  const card = currentHand[(action as MoveTurnAction).cardIndex];
  return card ? cardLabel(card) : "이동";
}

function actionPhaseLabel(action: ActionPhaseTurnAction): string {
  return "타일 위치 교환";
}
