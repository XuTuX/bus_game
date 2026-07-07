import { type Card } from "@/lib/game";
import { getRoomTimerSettings } from "./gameStoreTimers";
import {
  type RoomRecord,
  type RoomState,
  type RoomTimingMeta,
} from "./gameStoreTypes";
import { deepClone, getTurnControllers } from "./gameStoreUtils";

export function buildPublicState(record: RoomRecord) {
  const { room } = record;
  const safeGame = deepClone(room.game);
  safeGame.players.forEach((player) => {
    (player.hand as any) = Array(player.hand.length).fill({ kind: "HIDDEN" });
  });

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
    if (bus1Player && !room.pendingMoves.BUS1) names.push(`${bus1Player.name}(BUS1)`);
    if (bus2Player && !room.pendingMoves.BUS2 && bus2Player.id !== bus1Player?.id) {
      names.push(`${bus2Player.name}(BUS2)`);
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

  return names.length > 0 ? names.join(" & ") : null;
}

function isCurrentPlayerTurn(room: RoomState, playerId?: string) {
  const { bus1Player, bus2Player } = getTurnControllers(room.game);
  const isBus1Controller = playerId === bus1Player?.id;
  const isBus2Controller = playerId === bus2Player?.id;

  if (room.status === "CHOOSING") {
    const bus1NeedsToSubmit = isBus1Controller && !room.pendingMoves.BUS1;
    const bus2NeedsToSubmit = isBus2Controller && !room.pendingMoves.BUS2;
    return bus1NeedsToSubmit || bus2NeedsToSubmit;
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
  if (
    room.status !== "CHOOSING" ||
    bus1Player?.id !== playerId ||
    bus2Player?.id !== playerId ||
    !room.pendingMoves.BUS1 ||
    room.pendingMoves.BUS2
  ) {
    return player.hand;
  }

  // 한 사람이 두 버스를 모두 조작할 때 BUS1 제출 후 남은 손패만 보여줍니다.
  const hand = [...player.hand];
  for (const move of room.pendingMoves.BUS1) {
    if (move.cardIndex >= 0 && move.cardIndex < hand.length) {
      hand.splice(move.cardIndex, 1);
    }
  }
  return hand;
}
