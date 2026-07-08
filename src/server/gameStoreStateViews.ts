import {
  BusType,
  runActionPhase,
  runMovePhase,
  stepSubway,
  type Card,
  type CardKind,
  type Coord,
} from "@/lib/game";
import { getRoomTimerSettings } from "./gameStoreTimers";
import {
  type RoomRecord,
  type RoomState,
  type RoomTimingMeta,
} from "./gameStoreTypes";
import {
  deepClone,
  getSubwayMoveTeams,
  getSubwayTeamPlayerOptions,
  getTurnControllers,
} from "./gameStoreUtils";

export function buildPublicState(record: RoomRecord) {
  const { room } = record;
  const safeGame = deepClone(room.game);
  safeGame.players.forEach((player) => {
    (player.hand as any) = Array(player.hand.length).fill({ kind: "HIDDEN" });
  });
  const { busTeam } = getTurnControllers(room.game);
  const subwayMoveTeams = getSubwayMoveTeams(room.game);
  const subwayTeamPlayers = getSubwayTeamPlayerOptions(room.game);
  const pendingSubwayMoves = Object.fromEntries(
    room.game.players
      .filter((p) => subwayMoveTeams.includes(p.team))
      .map((p) => [p.id, !!room.pendingSubwayMoves?.[p.id]])
  );

  return {
    game: safeGame,
    participants: room.participants,
    logs: room.logs,
    status: room.status,
    activePlayerNames: getActivePlayerNames(room),
    pendingMoves: {
      BUS1: !!room.pendingMoves.BUS1,
      BUS2: !!room.pendingMoves.BUS2,
    },
    pendingActions: {
      BUS1: room.pendingActions.BUS1 !== undefined,
      BUS2: room.pendingActions.BUS2 !== undefined,
    },
    busTeam,
    subwayMoveTeams,
    subwayTeamPlayers,
    pendingSubwayMoves,
    subwayPreview: buildSubwayPreview(room),
    canUndo: (room.history?.length ?? 0) > 0,
    ...getRoomTimingMeta(record),
  };
}

export function buildPrivateState(record: RoomRecord, playerId: string) {
  const { room } = record;
  const player = room.game.players.find((p) => p.id === playerId);
  const participant = room.participants.find((p) => p.id === playerId);
  const stablePlayerId = player?.id ?? participant?.id;

  if (room.game.players.length === 0) {
    return {
      hand: [],
      isMyTurn: false,
      status: room.status,
      team: participant?.colour,
      playerName: participant?.name,
      ...getRoomTimingMeta(record),
    };
  }

  const { bus1Player, bus2Player } = getTurnControllers(room.game);
  const isBus1Controller = stablePlayerId === bus1Player?.id;
  const isBus2Controller = stablePlayerId === bus2Player?.id;

  return {
    hand: getVisiblePrivateHand(room, stablePlayerId),
    previewGame: buildDealerPreviewGame(room),
    isMyTurn: isCurrentPlayerTurn(room, stablePlayerId),
    isBus1Controller,
    isBus2Controller,
    status: room.status,
    team: player?.team ?? participant?.colour,
    playerName: player?.name ?? participant?.name ?? player?.id,
    ...getRoomTimingMeta(record),
  };
}

function getActivePlayerNames(room: RoomState): string | null {
  if (room.game.players.length === 0) {
    return null;
  }

  const { bus1Player, bus2Player } = getTurnControllers(room.game);
  const names: string[] = [];

  if (room.status === "CHOOSING") {
    if (bus1Player) {
      if (!room.pendingMoves.BUS1) {
        names.push(`${bus1Player.name}(BUS1 이동)`);
      } else if (room.pendingActions.BUS1 === undefined) {
        names.push(`${bus1Player.name}(BUS1 행동)`);
      }
    }
    if (bus2Player && bus2Player.id !== bus1Player?.id) {
      if (!room.pendingMoves.BUS2) {
        names.push(`${bus2Player.name}(BUS2 이동)`);
      } else if (room.pendingActions.BUS2 === undefined) {
        names.push(`${bus2Player.name}(BUS2 행동)`);
      }
    }
  } else if (room.status === "ACTION_PHASE") {
    if (bus1Player && room.pendingActions.BUS1 === undefined) {
      names.push(`${bus1Player.name}(BUS1)`);
    }
    if (
      bus2Player &&
      room.pendingActions.BUS2 === undefined &&
      bus2Player.id !== bus1Player?.id
    ) {
      names.push(`${bus2Player.name}(BUS2)`);
    }
  }

  return names.length > 0 ? names.join(", ") : null;
}

function isCurrentPlayerTurn(room: RoomState, playerId?: string) {
  const { bus1Player, bus2Player } = getTurnControllers(room.game);
  const isBus1Controller = playerId === bus1Player?.id;
  const isBus2Controller = playerId === bus2Player?.id;

  if (room.status === "CHOOSING") {
    const bus1NeedsToSubmit = isBus1Controller && !room.pendingMoves.BUS1;
    const bus2NeedsToSubmit = isBus2Controller && !room.pendingMoves.BUS2;
    const bus1ActionNeedsToSubmit =
      isBus1Controller &&
      !!room.pendingMoves.BUS1 &&
      room.pendingActions.BUS1 === undefined;
    const bus2ActionNeedsToSubmit =
      isBus2Controller &&
      !!room.pendingMoves.BUS2 &&
      room.pendingActions.BUS2 === undefined;
    return (
      bus1NeedsToSubmit ||
      bus2NeedsToSubmit ||
      bus1ActionNeedsToSubmit ||
      bus2ActionNeedsToSubmit
    );
  }

  if (room.status === "ACTION_PHASE") {
    const bus1NeedsToSubmit =
      isBus1Controller && room.pendingActions.BUS1 === undefined;
    const bus2NeedsToSubmit =
      isBus2Controller && room.pendingActions.BUS2 === undefined;
    return bus1NeedsToSubmit || bus2NeedsToSubmit;
  }

  return false;
}

function buildDealerPreviewGame(room: RoomState) {
  if (room.status !== "CHOOSING" && room.status !== "ACTION_PHASE") {
    return undefined;
  }

  const clone = deepClone(room.game);
  const { bus1Player, bus2Player } = getTurnControllers(clone);

  if (bus1Player && room.pendingMoves.BUS1) {
    const player = clone.players.find((p) => p.id === bus1Player.id);
    if (player) {
      runMovePhase(player, room.pendingMoves.BUS1, clone, { scoreSubwaysAtEnd: false });
    }
  }

  if (bus2Player && room.pendingMoves.BUS2) {
    const player = clone.players.find((p) => p.id === bus2Player.id);
    if (player) {
      runMovePhase(player, room.pendingMoves.BUS2, clone, { scoreSubwaysAtEnd: false });
    }
  }

  if (bus1Player && room.pendingActions.BUS1) {
    const player = clone.players.find((p) => p.id === bus1Player.id);
    if (player) {
      runActionPhase(player, room.pendingActions.BUS1, clone);
    }
  }

  if (bus2Player && room.pendingActions.BUS2) {
    const player = clone.players.find((p) => p.id === bus2Player.id);
    if (player) {
      runActionPhase(player, room.pendingActions.BUS2, clone);
    }
  }

  return clone;
}

function getRoomTimingMeta(record: RoomRecord): RoomTimingMeta {
  return {
    serverNow: Date.now(),
    roomExpiresAt: record.expiresAt,
    phaseStartedAt: record.room.phaseStartedAt,
    phaseDeadlineAt: record.room.phaseDeadlineAt,
    phaseDurationSeconds: record.room.phaseDurationSeconds,
    timerSettings: getRoomTimerSettings(record.room),
  };
}

function getVisiblePrivateHand(room: RoomState, playerId?: string): Card[] {
  const player = room.game.players.find((p) => p.id === playerId);
  if (!player) {
    return [];
  }

  const { bus1Player, bus2Player } = getTurnControllers(room.game);
  if (room.status !== "CHOOSING") {
    return player.hand;
  }

  const hand = [...player.hand];
  const pendingActions = [
    bus1Player?.id === playerId ? room.pendingMoves.BUS1 : undefined,
    bus2Player?.id === playerId ? room.pendingMoves.BUS2 : undefined,
  ];

  for (const moves of pendingActions) {
    if (!moves) continue;
    for (const move of moves) {
      if (move.cardIndex >= 0 && move.cardIndex < hand.length) {
        hand.splice(move.cardIndex, 1);
      }
    }
  }

  return hand;
}

function buildSubwayPreview(room: RoomState) {
  const submissions = Object.values(room.pendingSubwayMoves ?? {})
    .sort((a, b) => (a.submittedOrder ?? 0) - (b.submittedOrder ?? 0))
    .map((submission) => {
      const player =
        room.game.players.find((p) => p.id === submission.playerId) ??
        room.participants.find((p) => p.id === submission.playerId);
      return {
        playerId: submission.playerId,
        playerName: submission.playerName ?? player?.name,
        team: submission.team,
        cardKind: submission.cardKind,
        label: subwaySubmissionLabel(submission.cardKind),
        submittedOrder: submission.submittedOrder ?? 0,
      };
    });

  if (submissions.length === 0) {
    return undefined;
  }

  const clone = deepClone(room.game);
  const subway = clone.subways[BusType.BUS1];
  const path: Coord[] = [];

  if (subway?.active) {
    for (const submission of Object.values(room.pendingSubwayMoves ?? {}).sort(
      (a, b) => (a.submittedOrder ?? 0) - (b.submittedOrder ?? 0)
    )) {
      if (!submission.cardKind) continue;
      const result = stepSubway(subway, { kind: submission.cardKind });
      if (result.path) {
        path.push(...result.path);
      }
    }
  }

  return {
    submissions,
    path,
    finalPositions: subway?.pos ?? [],
  };
}

function subwaySubmissionLabel(cardKind?: CardKind): string {
  if (!cardKind) return "패스";
  if (cardKind === "STRAIGHT1") return "직진 x 1";
  if (cardKind === "STRAIGHT2") return "직진 x 2";
  if (cardKind === "STRAIGHT3") return "직진 x 3";
  if (cardKind === "LEFT") return "좌회전";
  return "우회전";
}
