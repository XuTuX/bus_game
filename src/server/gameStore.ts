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
import net from "node:net";
import tls from "node:tls";
import {
  type RoomRecord,
  type LobbyParticipant,
  type RoomState,
  type RoomTimerSettings,
} from "./gameStoreTypes";
import {
  clearPhaseTimer,
  getDefaultTimerSettings,
  getRoomTimerSettings,
  sanitizeDurationSeconds,
  startPhaseTimer,
} from "./gameStoreTimers";
import { deepClone } from "./gameStoreUtils";
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

const DEFAULT_ROOM_TTL_SECONDS = 12 * 60 * 60;
const SAVE_RETRY_LIMIT = 5;

const roomTtlSeconds = getPositiveEnvNumber("ROOM_TTL_SECONDS", DEFAULT_ROOM_TTL_SECONDS);
const redisUrl = process.env.REDIS_URL;

// Redis에 문자열로 보내는 Lua 스크립트입니다. redis.call은 Redis 서버 안에서 실행됩니다.
const REDIS_SAVE_IF_VERSION_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if not current then
  if ARGV[1] ~= "-1" then
    return 0  
  end
else
  local decoded = cjson.decode(current)
  if tostring(decoded.version) ~= ARGV[1] then
    return 0
  end
end
redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
return 1
`;

// Next API 라우트에서 호출하는 방 단위 공개 API입니다.
export async function hasRoom(roomCode: string): Promise<boolean> {
  return (await readRoomRecord(roomCode)) !== null;
}

export async function createRoom(roomCode: string): Promise<boolean> {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const record: RoomRecord = {
    room: createEmptyRoom(),
    version: 0,
    expiresAt: nextRoomExpiresAt(),
  };

  const result = await redisCommand<string | null>([
    "SET",
    roomKey(normalizedRoomCode),
    JSON.stringify(record),
    "EX",
    String(roomTtlSeconds),
    "NX",
  ]);
  return result === "OK";
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

function createEmptyRoom(): RoomState {
  return {
    game: createGame(Math.random, []),
    participants: [],
    logs: [],
    status: "LOBBY",
    logIdCounter: 0,
    playerIdCounter: 0,
    pendingMoves: {},
    pendingActions: {},
    timerSettings: getDefaultTimerSettings(),
  };
}

async function mutateRoom<T>(
  roomCode: string,
  mutate: (room: RoomState) => T
): Promise<T> {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  let lastResult: T | undefined;

  for (let attempt = 0; attempt < SAVE_RETRY_LIMIT; attempt++) {
    const existingRecord = await readRoomRecord(normalizedRoomCode);
    const expectedVersion = existingRecord?.version ?? -1;
    const room = existingRecord ? deepClone(existingRecord.room) : createEmptyRoom();
    lastResult = mutate(room);

    const saved = await saveRoomRecord(
      normalizedRoomCode,
      {
        room,
        version: expectedVersion + 1,
        expiresAt: nextRoomExpiresAt(),
      },
      expectedVersion
    );

    if (saved) {
      return lastResult;
    }
  }

  throw new Error("동시 요청이 많아 저장에 실패했습니다. 다시 시도해주세요.");
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

async function readRoomRecord(roomCode: string): Promise<RoomRecord | null> {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const raw = await redisCommand<string | null>(["GET", roomKey(normalizedRoomCode)]);
  return raw ? (JSON.parse(raw) as RoomRecord) : null;
}

async function saveRoomRecord(
  roomCode: string,
  record: RoomRecord,
  expectedVersion: number
): Promise<boolean> {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const recordToSave: RoomRecord = {
    ...record,
    expiresAt: nextRoomExpiresAt(),
  };

  const result = await redisCommand<number>([
    "EVAL",
    REDIS_SAVE_IF_VERSION_SCRIPT,
    1,
    roomKey(normalizedRoomCode),
    String(expectedVersion),
    JSON.stringify(recordToSave),
    String(roomTtlSeconds),
  ]);
  return result === 1;
}

async function redisCommand<T>(command: unknown[]): Promise<T> {

  if (redisUrl) {
    return redisUrlCommand<T>(redisUrl, command);
  }

  throw new Error(
    "Redis 환경변수가 설정되지 않았습니다. UPSTASH_REDIS_REST_URL/UPSTASH_REDIS_REST_TOKEN 또는 REDIS_URL이 필요합니다."
  );
}

async function redisRestCommand<T>(
  url: string,
  token: string,
  command: unknown[]
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => null) as {
    result?: T;
    error?: string;
  } | null;

  if (!response.ok || payload?.error) {
    throw new Error(payload?.error ?? "Redis 요청에 실패했습니다.");
  }

  return payload?.result as T;
}

function redisUrlCommand<T>(urlValue: string, command: unknown[]): Promise<T> {
  const url = new URL(urlValue);
  if (url.protocol !== "redis:" && url.protocol !== "rediss:") {
    throw new Error("REDIS_URL은 redis:// 또는 rediss:// 형식이어야 합니다.");
  }

  const useTls = url.protocol === "rediss:";
  const port = Number(url.port || 6379);
  const authCommand = getRedisAuthCommand(url);
  const commands = authCommand ? [authCommand, command] : [command];

  return new Promise((resolve, reject) => {
    let responseBuffer = Buffer.alloc(0);
    const responses: unknown[] = [];
    let settled = false;

    const socket = useTls
      ? tls.connect({
        host: url.hostname,
        port,
        servername: url.hostname,
      })
      : net.connect({
        host: url.hostname,
        port,
      });

    const finish = (error?: Error, result?: unknown) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      if (error) {
        reject(error);
      } else {
        resolve(result as T);
      }
    };

    const sendCommands = () => {
      socket.write(commands.map(encodeRedisCommand).join(""));
    };

    socket.setTimeout(10_000, () => {
      finish(new Error("Redis 연결 시간이 초과되었습니다."));
    });
    socket.once("error", (error) => finish(error));
    socket.once(useTls ? "secureConnect" : "connect", sendCommands);
    socket.on("data", (chunk) => {
      responseBuffer = Buffer.concat([responseBuffer, chunk]);

      try {
        while (responses.length < commands.length) {
          const parsed = parseRedisResponse(responseBuffer);
          if (!parsed) {
            return;
          }

          responses.push(parsed.value);
          responseBuffer = responseBuffer.subarray(parsed.nextOffset);
        }
      } catch (error) {
        finish(
          error instanceof Error ? error : new Error("Redis 응답을 읽지 못했습니다.")
        );
        return;
      }

      finish(undefined, responses[responses.length - 1]);
    });
  });
}

function getRedisAuthCommand(url: URL): string[] | null {
  const username = decodeURIComponent(url.username);
  const password = decodeURIComponent(url.password);

  if (username && password) {
    return ["AUTH", username, password];
  }
  if (password) {
    return ["AUTH", password];
  }
  return null;
}

function encodeRedisCommand(command: unknown[]): string {
  return `*${command.length}\r\n${command
    .map((argument) => {
      const value = String(argument);
      return `$${Buffer.byteLength(value)}\r\n${value}\r\n`;
    })
    .join("")}`;
}

type ParsedRedisResponse = {
  value: unknown;
  nextOffset: number;
};

function parseRedisResponse(buffer: Buffer, offset = 0): ParsedRedisResponse | null {
  if (offset >= buffer.length) {
    return null;
  }

  const prefix = String.fromCharCode(buffer[offset]);
  const lineEnd = buffer.indexOf("\r\n", offset);
  if (lineEnd === -1) {
    return null;
  }

  const line = buffer.toString("utf8", offset + 1, lineEnd);
  const valueStart = lineEnd + 2;

  if (prefix === "+") {
    return { value: line, nextOffset: valueStart };
  }
  if (prefix === "-") {
    throw new Error(line);
  }
  if (prefix === ":") {
    return { value: Number(line), nextOffset: valueStart };
  }
  if (prefix === "$") {
    const length = Number(line);
    if (length === -1) {
      return { value: null, nextOffset: valueStart };
    }

    const valueEnd = valueStart + length;
    const nextOffset = valueEnd + 2;
    if (buffer.length < nextOffset) {
      return null;
    }

    return {
      value: buffer.toString("utf8", valueStart, valueEnd),
      nextOffset,
    };
  }
  if (prefix === "*") {
    const length = Number(line);
    if (length === -1) {
      return { value: null, nextOffset: valueStart };
    }

    const values: unknown[] = [];
    let nextOffset = valueStart;
    for (let index = 0; index < length; index++) {
      const parsed = parseRedisResponse(buffer, nextOffset);
      if (!parsed) {
        return null;
      }
      values.push(parsed.value);
      nextOffset = parsed.nextOffset;
    }

    return { value: values, nextOffset };
  }

  throw new Error("지원하지 않는 Redis 응답 형식입니다.");
}

function nextRoomExpiresAt() {
  return Date.now() + roomTtlSeconds * 1000;
}

function normalizeRoomCode(roomCode: string) {
  return roomCode.trim().toUpperCase();
}

function roomKey(roomCode: string) {
  return `room:${roomCode}`;
}

function getPositiveEnvNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
