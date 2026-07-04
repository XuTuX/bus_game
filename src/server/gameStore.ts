import {
  Colour,
  COLOURS,
  MAX_PLAYERS,
  MAX_PLAYERS_PER_COLOUR,
  BusType,
  type TurnAction,
  createGame,
  isGameOver,
} from "@/lib/game";
import {
  type LobbyParticipant,
  type RoomState,
  type RoomTimerSettings,
} from "./gameStoreTypes";
import {
  clearPhaseTimer,
  getRoomTimerSettings,
  sanitizeDurationSeconds,
  startPhaseTimer,
} from "./gameStoreTimers";
import {
  createRoomRecord,
  mutateRoomRecord,
  readRoomRecord,
} from "./gameStoreStorage";
import { createEmptyRoom } from "./gameStoreUtils";
import { buildPrivateState, buildPublicState } from "./gameStoreStateViews";
import { submitTurnToRoom } from "./gameStoreTurnFlow";
export type {
  LobbyParticipant,
  LogEntry,
  RoomState,
  RoomStatus,
  RoomTimerSettings,
  RoomTimingMeta,
} from "./gameStoreTypes";

// Next API 라우트에서 호출하는 방 단위 공개 API입니다.
export async function hasRoom(roomCode: string): Promise<boolean> {
  return (await readRoomRecord(roomCode)) !== null;
}

export async function createRoom(roomCode: string): Promise<boolean> {
  return createRoomRecord(roomCode, createEmptyRoom());
}

export async function adminAddParticipant(
  roomCode: string,
  name: string
): Promise<LobbyParticipant> {
  return mutateRoom(roomCode, (room) => {
    const participant = addLobbyParticipant(room, name);
    participant.colour = nextAvailableColour(room.participants);
    return participant;
  });
}

export async function adminRemoveParticipant(roomCode: string, playerId: string): Promise<void> {
  await mutateRoom(roomCode, (room) => {
    if (room.status !== "LOBBY") {
      throw new Error("게임 시작 후에는 참가자를 수정할 수 없습니다.");
    }

    const participantIndex = room.participants.findIndex((p) => p.id === playerId);
    if (participantIndex === -1) {
      throw new Error("참가자를 찾을 수 없습니다.");
    }

    room.participants.splice(participantIndex, 1);
  });
}

export async function adminSetParticipantColour(
  roomCode: string,
  playerId: string,
  colour: Colour
): Promise<void> {
  await mutateRoom(roomCode, (room) => {
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
  });
}

export async function adminSetRoomTimers(
  roomCode: string,
  settings: Partial<RoomTimerSettings>
): Promise<void> {
  await mutateRoom(roomCode, (room) => {
    const timerSettings = getRoomTimerSettings(room);
    const nextSettings: RoomTimerSettings = {
      movePhaseSeconds: sanitizeDurationSeconds(
        settings.movePhaseSeconds,
        timerSettings.movePhaseSeconds
      ),
      actionPhaseSeconds: sanitizeDurationSeconds(
        settings.actionPhaseSeconds,
        timerSettings.actionPhaseSeconds
      ),
    };

    room.timerSettings = nextSettings;

    if (room.status === "CHOOSING") {
      startPhaseTimer(room, nextSettings.movePhaseSeconds);
    } else if (room.status === "ACTION_PHASE") {
      startPhaseTimer(room, nextSettings.actionPhaseSeconds);
    }
  });
}

export async function submitTurn(
  roomCode: string,
  playerId: string,
  actions: TurnAction[],
  submittedBus?: BusType
): Promise<void> {
  await mutateRoom(roomCode, (room) => {
    submitTurnToRoom(room, playerId, actions, submittedBus);
  });
}

export async function adminStartGame(roomCode: string): Promise<void> {
  await mutateRoom(roomCode, (room) => {
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
    clearPhaseTimer(room);
  });
}

export async function adminStartTurn(roomCode: string): Promise<void> {
  await mutateRoom(roomCode, (room) => {
    if (isGameOver(room.game)) {
      room.status = "GAME_OVER";
      clearPhaseTimer(room);
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
    startPhaseTimer(room, getRoomTimerSettings(room).movePhaseSeconds);
  });
}

export async function getPublicState(roomCode: string) {
  const record = await readRoomRecord(roomCode);
  if (!record) {
    return null;
  }

  return buildPublicState(record);
}

export async function getPrivateState(roomCode: string, playerId: string) {
  const record = await readRoomRecord(roomCode);
  if (!record) {
    return null;
  }

  return buildPrivateState(record, playerId);
}

function addLobbyParticipant(room: RoomState, name: string): LobbyParticipant {
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

async function mutateRoom<T>(
  roomCode: string,
  mutate: (room: RoomState) => T
): Promise<T> {
  return mutateRoomRecord(roomCode, createEmptyRoom, mutate);
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
