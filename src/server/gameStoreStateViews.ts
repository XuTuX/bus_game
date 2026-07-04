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
      PLUS: !!room.pendingMoves.PLUS,
      MINUS: !!room.pendingMoves.MINUS,
    },
    pendingActions: {
      PLUS: room.pendingActions.PLUS !== undefined,
      MINUS: room.pendingActions.MINUS !== undefined,
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

  const { plusPlayer, minusPlayer } = getTurnControllers(room.game);
  const isPlusController = stablePlayerId === plusPlayer?.id;
  const isMinusController = stablePlayerId === minusPlayer?.id;

  return {
    hand: getVisiblePrivateHand(room, stablePlayerId),
    isMyTurn: isCurrentPlayerTurn(room, stablePlayerId),
    isPlusController,
    isMinusController,
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

  const { plusPlayer, minusPlayer } = getTurnControllers(room.game);
  const names: string[] = [];

  if (room.status === "CHOOSING") {
    if (plusPlayer && !room.pendingMoves.PLUS) names.push(`${plusPlayer.name}(PLUS)`);
    if (minusPlayer && !room.pendingMoves.MINUS && minusPlayer.id !== plusPlayer?.id) {
      names.push(`${minusPlayer.name}(MINUS)`);
    }
  } else if (room.status === "ACTION_PHASE") {
    if (plusPlayer && room.pendingActions.PLUS === undefined) {
      names.push(`${plusPlayer.name}(PLUS)`);
    }
    if (
      minusPlayer &&
      room.pendingActions.MINUS === undefined &&
      minusPlayer.id !== plusPlayer?.id
    ) {
      names.push(`${minusPlayer.name}(MINUS)`);
    }
  }

  return names.length > 0 ? names.join(" & ") : null;
}

function isCurrentPlayerTurn(room: RoomState, playerId?: string) {
  const { plusPlayer, minusPlayer } = getTurnControllers(room.game);
  const isPlusController = playerId === plusPlayer?.id;
  const isMinusController = playerId === minusPlayer?.id;

  if (room.status === "CHOOSING") {
    const plusNeedsToSubmit = isPlusController && !room.pendingMoves.PLUS;
    const minusNeedsToSubmit = isMinusController && !room.pendingMoves.MINUS;
    return plusNeedsToSubmit || minusNeedsToSubmit;
  }

  if (room.status === "ACTION_PHASE") {
    const plusNeedsToSubmit =
      isPlusController && room.pendingActions.PLUS === undefined;
    const minusNeedsToSubmit =
      isMinusController && room.pendingActions.MINUS === undefined;
    return plusNeedsToSubmit || minusNeedsToSubmit;
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

  // 한 사람이 두 버스를 모두 조작할 때 PLUS 제출 후 남은 손패만 보여줍니다.
  const hand = [...player.hand];
  for (const move of room.pendingMoves.PLUS) {
    if (move.cardIndex >= 0 && move.cardIndex < hand.length) {
      hand.splice(move.cardIndex, 1);
    }
  }
  return hand;
}
