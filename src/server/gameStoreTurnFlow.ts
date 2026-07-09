import {
  BusType,
  cardLabel,
  getConnectedComponentSize,
  runActionPhase,
  runMovePhase,
  scoreMatchingBusDestinationBonus,
  scoreSubwayTiles,
  type Card,
  type Colour,
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

const TEAM_NAMES_KO: Record<string, string> = {
  Red: "레드팀",
  Purple: "퍼플팀",
  Yellow: "옐로팀",
  Green: "그린팀",
  Blue: "블루팀",
};

type LogCardPlay = NonNullable<LogEntry["cardPlays"]>[number];
type LogScoreDetail = NonNullable<LogEntry["scoreDetails"]>[number];

export function submitTurnToRoom(
  room: RoomState,
  playerId: string,
  actions: TurnAction[],
  submittedBus?: BusType,
  mode: "BUS" | "SUBWAY" | "CANCEL" | "CANCEL_SUBWAY" = "BUS"
) {
  // 제출은 이동 선택 단계와 행동 단계에서만 받습니다.
  if (room.status !== "CHOOSING" && room.status !== "ACTION_PHASE") {
    throw new Error("현재 제출 가능한 단계가 아닙니다.");
  }

  const player = room.game.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error("플레이어를 찾을 수 없습니다.");
  }

  if (mode === "CANCEL_SUBWAY") {
    delete room.pendingSubwayMoves?.[player.id];
    return;
  }

  if (mode === "CANCEL") {
    const bus = submittedBus;
    if (!bus) {
      throw new Error("취소할 버스를 지정해야 합니다.");
    }

    const { bus1Player, bus2Player } = getTurnControllers(room.game);
    const isBus1Controller = player.id === bus1Player?.id;
    const isBus2Controller = player.id === bus2Player?.id;

    if (bus === BusType.BUS1 && !isBus1Controller) {
      throw new Error("BUS1 버스 조작 권한이 없습니다.");
    }
    if (bus === BusType.BUS2 && !isBus2Controller) {
      throw new Error("BUS2 버스 조작 권한이 없습니다.");
    }

    // 이동 제출 취소
    if (bus === BusType.BUS1) {
      room.pendingMoves.BUS1 = undefined;
      room.pendingActions.BUS1 = undefined;
    } else {
      room.pendingMoves.BUS2 = undefined;
      room.pendingActions.BUS2 = undefined;
    }

    // 두 버스 중 하나만 취소했는데 상태가 ACTION_PHASE였으면 CHOOSING으로 되돌림
    if (room.status === "ACTION_PHASE") {
      room.status = "CHOOSING";
      clearPhaseTimer(room);
    }
    return;
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

  const firstAction = actions[0];
  const isActionSubmission = firstAction?.type === "SWAP_TILE";

  if (isActionSubmission) {
    submitActionPhase(room, firstAction as ActionPhaseTurnAction | undefined, bus);
  } else if (room.status === "CHOOSING") {
    submitMovePhase(room, actions as MoveTurnAction[], bus);
  } else {
    throw new Error("이동 제출 단계가 아닙니다.");
  }
}

function submitMovePhase(room: RoomState, actions: MoveTurnAction[], bus: BusType) {
  const { bus1Player, bus2Player } = getTurnControllers(room.game);

  if (actions.length === 0) {
    throw new Error("버스 이동은 패스할 수 없습니다. 카드 1장 이상을 제출하세요.");
  }

  if (bus === BusType.BUS1) {
    if (room.pendingMoves.BUS1) {
      throw new Error("BUS1 이동은 이미 제출되었습니다.");
    }
    room.pendingMoves.BUS1 = actions;
  } else {
    if (room.pendingMoves.BUS2) {
      throw new Error("BUS2 이동은 이미 제출되었습니다.");
    }
    room.pendingMoves.BUS2 = actions;
  }

  if (!bus1Player) room.pendingMoves.BUS1 = [];
  if (!bus2Player) room.pendingMoves.BUS2 = [];

  if (room.pendingMoves.BUS1 && room.pendingMoves.BUS2) {
    room.status = "ACTION_PHASE";
    startPhaseTimer(room, getRoomTimerSettings(room).actionPhaseSeconds);
  }
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

function submitActionPhase(
  room: RoomState,
  action: ActionPhaseTurnAction | undefined,
  bus: BusType
) {
  const { bus1Player, bus2Player } = getTurnControllers(room.game);

  if (!action) {
    throw new Error("버스 행동은 패스할 수 없습니다. 교환할 타일을 선택해 제출하세요.");
  }

  if (bus === BusType.BUS1 && !room.pendingMoves.BUS1) {
    throw new Error("BUS1 이동 제출 후 행동을 제출할 수 있습니다.");
  }
  if (bus === BusType.BUS2 && !room.pendingMoves.BUS2) {
    throw new Error("BUS2 이동 제출 후 행동을 제출할 수 있습니다.");
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
  if (room.status !== "CHOOSING" && room.status !== "ACTION_PHASE") {
    throw new Error("입력 단계에서만 이번 턴을 종료할 수 있습니다.");
  }

  const { bus1Player, bus2Player } = getTurnControllers(room.game);
  room.pendingSubwayMoves ??= {};

  if (!bus1Player) room.pendingMoves.BUS1 = [];
  if (!bus2Player) room.pendingMoves.BUS2 = [];
  if (!bus1Player) room.pendingActions.BUS1 = null;
  if (!bus2Player) room.pendingActions.BUS2 = null;

  if (!room.pendingMoves.BUS1 || !room.pendingMoves.BUS2) {
    throw new Error("아직 두 버스의 이동 제출이 끝나지 않았습니다.");
  }
  if (
    room.pendingActions.BUS1 === undefined ||
    room.pendingActions.BUS2 === undefined
  ) {
    throw new Error("아직 두 버스의 행동 제출이 끝나지 않았습니다.");
  }

  const clone = deepClone(room.game);
  clone.swappedTiles = [];
  const moveDetails: LogEntry["actions"] = [];
  const moveCardPlays: LogCardPlay[] = [];
  const moveScoreDetails: LogScoreDetail[] = [];

  if (bus1Player) {
    moveCardPlays.push(
      ...collectBusCardPlays(clone, bus1Player.id, room.pendingMoves.BUS1, BusType.BUS1)
    );
    appendMoveLogActions(
      moveDetails,
      moveScoreDetails,
      clone,
      bus1Player.id,
      room.pendingMoves.BUS1,
      BusType.BUS1
    );
  }

  if (bus2Player) {
    moveCardPlays.push(
      ...collectBusCardPlays(clone, bus2Player.id, room.pendingMoves.BUS2, BusType.BUS2)
    );
    appendMoveLogActions(
      moveDetails,
      moveScoreDetails,
      clone,
      bus2Player.id,
      room.pendingMoves.BUS2,
      BusType.BUS2
    );
  }

  const beforeDestinationBonus = { ...clone.teamScores };
  const { busTeam } = getTurnControllers(clone);
  scoreMatchingBusDestinationBonus(clone, [busTeam]);
  appendScoreDeltaLogActions(
    moveDetails,
    moveScoreDetails,
    beforeDestinationBonus,
    clone.teamScores,
    "두 버스 같은 색 도착 보너스",
    "BONUS"
  );

  const beforeDistanceScores = { ...clone.teamScores };
  const distancePenalty = scoreBusDistancePenalty(clone, busTeam);
  appendScoreDeltaLogActions(
    moveDetails,
    moveScoreDetails,
    beforeDistanceScores,
    clone.teamScores,
    distancePenalty
      ? `버스 간 거리 ${distancePenalty.distance}칸 감점`
      : "버스 간 거리 감점",
    "PENALTY"
  );
  addTurnLog(
    room,
    moveDetails,
    room.game.roundIndex + 1,
    room.game.turnIndex + 1,
    "MOVE",
    {
      cardPlays: moveCardPlays,
      scoreDetails: moveScoreDetails,
    }
  );

  const actionDetails: LogEntry["actions"] = [];
  const actionCardPlays: LogCardPlay[] = collectSubwayCardPlays(room);
  const actionScoreDetails: LogScoreDetail[] = [];

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

  const regionGains = scoreCurrentBusRegions(clone);

  if (regionGains.BUS1) {
    const tName = TEAM_NAMES_KO[regionGains.BUS1.team] || regionGains.BUS1.team;
    actionDetails.push({
      actionLabel: `버스 1 영역점수 : ${tName.replace("팀", "")} +${regionGains.BUS1.size}`,
      bus: BusType.BUS1,
      applied: true,
      scoreGained: 0,
    });
    actionScoreDetails.push({
      source: "REGION",
      label: "버스 1 영역점수",
      team: regionGains.BUS1.team,
      points: regionGains.BUS1.size,
    });
  }

  if (regionGains.BUS2) {
    const tName = TEAM_NAMES_KO[regionGains.BUS2.team] || regionGains.BUS2.team;
    actionDetails.push({
      actionLabel: `버스 2 영역점수 : ${tName.replace("팀", "")} +${regionGains.BUS2.size}`,
      bus: BusType.BUS2,
      applied: true,
      scoreGained: 0,
    });
    actionScoreDetails.push({
      source: "REGION",
      label: "버스 2 영역점수",
      team: regionGains.BUS2.team,
      points: regionGains.BUS2.size,
    });
  }

  getOrderedSubwaySubmissions(room).forEach((submission) => {
    appendSubwayLogAction(actionDetails, clone, submission);
  });

  const beforeSubwayScores = { ...clone.teamScores };
  scoreSubwayTiles(clone);
  appendScoreDeltaLogActions(
    actionDetails,
    actionScoreDetails,
    beforeSubwayScores,
    clone.teamScores,
    "지하철 점수",
    "SUBWAY"
  );

  addTurnLog(
    room,
    actionDetails,
    clone.roundIndex + 1,
    clone.turnIndex + 1,
    "ACTION",
    {
      cardPlays: actionCardPlays,
      scoreDetails: actionScoreDetails,
    }
  );

  room.game = clone;
  room.status = "RESULT_PHASE";
  clearPhaseTimer(room);
  room.pendingMoves = {};
  room.pendingActions = {};
  room.pendingSubwayMoves = {};
  room.subwaySubmissionCounter = 0;
}

function appendMoveLogActions(
  actionDetails: LogEntry["actions"],
  scoreDetails: LogScoreDetail[],
  game: GameState,
  playerId: string,
  moves: MoveTurnAction[],
  bus: BusType
) {
  const player = findClonePlayer(game, playerId);
  const playedCards = consumeMoveCards(player.hand, moves);
  const results = runMovePhase(player, moves, game, { scoreSubwaysAtEnd: false });

  moves.forEach((move, index) => {
    const result = results[index];
    const playedCard = playedCards[index];
    let label = playedCard ? cardLabel(playedCard) : actionLabel(move, []);

    if (result.scoreChanges && Object.keys(result.scoreChanges).length > 0) {
      const parts: string[] = [];
      for (const [team, delta] of Object.entries(result.scoreChanges)) {
        if (delta === 0) continue;
        const colorTeam = team as Colour;
        const tName = TEAM_NAMES_KO[colorTeam] || colorTeam;
        const dStr = delta > 0 ? `+${delta}` : `${delta}`;
        parts.push(`${tName.replace("팀", "")} ${dStr}`);
        scoreDetails.push({
          source: bus,
          label: `${bus === BusType.BUS1 ? "버스 1" : "버스 2"} ${playedCard ? cardLabel(playedCard) : "이동"}`,
          team: colorTeam,
          points: delta,
        });
      }
      if (parts.length > 0) {
        label += ` : ${parts.join(", ")}`;
      }
    }

    actionDetails.push({
      actionLabel: label,
      bus,
      applied: result.applied,
      reason: result.reason,
      scoreGained: 0,
    });
  });

}

function collectBusCardPlays(
  game: GameState,
  playerId: string,
  moves: MoveTurnAction[],
  source: BusType
): LogCardPlay[] {
  const player = findClonePlayer(game, playerId);
  return consumeMoveCards(player.hand, moves).map((card) => ({
    source,
    playerId: player.id,
    playerName: player.name,
    team: player.team,
    cardKind: card?.kind,
    cardLabel: card ? cardLabel(card) : "이동",
    count: card ? 1 : 0,
  }));
}

function collectSubwayCardPlays(room: RoomState): LogCardPlay[] {
  return getOrderedSubwaySubmissions(room).map((submission) => ({
    source: "SUBWAY",
    playerId: submission.playerId,
    playerName: submission.playerName,
    team: submission.team,
    cardKind: submission.cardKind,
    cardLabel: submission.cardKind ? subwayCardLabel(submission.cardKind) : "패스",
    count: submission.cardKind ? 1 : 0,
    submittedOrder: submission.submittedOrder,
  }));
}

function consumeMoveCards(hand: Card[], moves: MoveTurnAction[]): (Card | undefined)[] {
  const remaining = [...hand];
  return moves.map((move) => {
    if (move.cardIndex < 0 || move.cardIndex >= remaining.length) {
      return undefined;
    }
    const [card] = remaining.splice(move.cardIndex, 1);
    return card;
  });
}

function appendSubwayLogAction(
  actionDetails: LogEntry["actions"],
  game: GameState,
  submission: SubwayMoveSubmission
): boolean {
  const player = game.players.find((p) => p.id === submission.playerId);
  const subwayLabel = "지하철";
  const teamPrefix = player ? `${TEAM_NAMES_KO[player.team] || player.team} ` : "";

  if (!submission.action) {
    return false;
  }

  if (!player) {
    return false;
  }

  const cardIndex =
    submission.cardKind === undefined
      ? submission.action.cardIndex
      : player.hand.findIndex((card) => card.kind === submission.cardKind);

  if (cardIndex < 0) {
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
    actionLabel: `${teamPrefix}${player.name ?? player.id} ${subwayLabel} ${subwayCardLabel(submission.cardKind)}`,
    bus: BusType.BUS1,
    applied: result.applied,
    reason: result.reason,
    scoreGained: 0,
  });

  return result.applied;
}

function appendScoreDeltaLogActions(
  actionDetails: LogEntry["actions"],
  scoreDetails: LogScoreDetail[],
  beforeScores: GameState["teamScores"],
  afterScores: GameState["teamScores"],
  label: string,
  source: LogScoreDetail["source"]
) {
  const parts: string[] = [];
  for (const team of Object.keys(afterScores) as (keyof GameState["teamScores"])[]) {
    const delta = afterScores[team] - beforeScores[team];
    if (delta === 0) continue;
    const colorTeam = team as Colour;
    const tName = TEAM_NAMES_KO[colorTeam] || colorTeam;
    parts.push(`${tName.replace("팀", "")} ${delta > 0 ? `+${delta}` : delta}`);
    scoreDetails.push({
      source,
      label,
      team: colorTeam,
      points: delta,
    });
  }

  if (parts.length > 0) {
    actionDetails.push({
      actionLabel: `${label} : ${parts.join(", ")}`,
      bus: BusType.BUS1,
      applied: true,
      scoreGained: 0,
    });
  }
}

function subwayCardLabel(cardKind?: Card["kind"]): string {
  if (cardKind === "STRAIGHT1") return "직진 x 1";
  if (cardKind === "STRAIGHT2") return "직진 x 2";
  if (cardKind === "STRAIGHT3") return "직진 x 3";
  if (cardKind === "STRAIGHT4") return "직진 x 4";
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
  const player = findClonePlayer(game, playerId);
  if (!action) return;

  runActionPhase(player, action, game);
  // Omit meaningless tile swap logs from the UI
}

function addTurnLog(
  room: RoomState,
  actions: LogEntry["actions"],
  round: number,
  turn: number,
  phase: LogEntry["phase"],
  details: Pick<LogEntry, "cardPlays" | "scoreDetails"> = {}
) {
  const { bus1Player, bus2Player, busTeam } = getTurnControllers(room.game);
  room.logs.unshift({
    id: ++room.logIdCounter,
    playerId: `${bus1Player?.name ?? "BUS1"} & ${bus2Player?.name ?? "BUS2"}`,
    team: busTeam ?? "Blue",
    phase,
    actions,
    cardPlays: details.cardPlays,
    scoreDetails: details.scoreDetails,
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
  const bus1Gained = bus1Color ? { team: bus1Color, size: bus1Size } : null;
  if (bus1Color) {
    game.teamScores[bus1Color] += bus1Size;
  }

  const bus2State = game.buses.BUS2;
  const bus2Size = getConnectedComponentSize(bus2State.pos, game.board, allWalls);
  const bus2Color = game.board[bus2State.pos.y]?.[bus2State.pos.x]?.colour;
  const bus2Gained = bus2Color ? { team: bus2Color, size: bus2Size } : null;
  if (bus2Color) {
    game.teamScores[bus2Color] += bus2Size;
  }

  return { BUS1: bus1Gained, BUS2: bus2Gained };
}

function scoreBusDistancePenalty(game: GameState, team: GameState["players"][number]["team"]) {
  const bus1 = game.buses.BUS1.pos;
  const bus2 = game.buses.BUS2.pos;
  const distance = Math.abs(bus1.x - bus2.x) + Math.abs(bus1.y - bus2.y);
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
