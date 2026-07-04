import { createClient, type RedisClientType } from "redis";
import { type RoomRecord, type RoomState } from "./gameStoreTypes";
import { deepClone } from "./gameStoreUtils";

const DEFAULT_ROOM_TTL_SECONDS = 12 * 60 * 60;
const SAVE_RETRY_LIMIT = 5;

const roomTtlSeconds = getPositiveEnvNumber("ROOM_TTL_SECONDS", DEFAULT_ROOM_TTL_SECONDS);
const redisConnectionUrl = process.env.REDIS_URL;
const redisRestUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisRestToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const memoryRooms = new Map<string, RoomRecord>();
let redisClientPromise: Promise<RedisClientType> | null = null;

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

const storeUsesNodeRedis = Boolean(redisConnectionUrl);
const storeUsesRedisRest = !storeUsesNodeRedis && Boolean(redisRestUrl && redisRestToken);

export async function createRoomRecord(
  roomCode: string,
  room: RoomState
): Promise<boolean> {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const record: RoomRecord = {
    room,
    version: 0,
    expiresAt: nextRoomExpiresAt(),
  };

  if (storeUsesNodeRedis || storeUsesRedisRest) {
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

  clearExpiredMemoryRoom(normalizedRoomCode);
  if (memoryRooms.has(normalizedRoomCode)) {
    return false;
  }

  memoryRooms.set(normalizedRoomCode, deepClone(record));
  return true;
}

export async function mutateRoomRecord<T>(
  roomCode: string,
  createEmptyRoom: () => RoomState,
  mutate: (room: RoomState) => T
): Promise<T> {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  let lastResult: T | undefined;

  for (let attempt = 0; attempt < SAVE_RETRY_LIMIT; attempt++) {
    const existingRecord = await readRoomRecord(normalizedRoomCode);
    const expectedVersion = existingRecord?.version ?? -1;
    const room = existingRecord ? deepClone(existingRecord.room) : createEmptyRoom();
    lastResult = mutate(room);

    const saved = await saveRoomRecord(normalizedRoomCode, {
      room,
      version: expectedVersion + 1,
      expiresAt: nextRoomExpiresAt(),
    }, expectedVersion);

    if (saved) {
      return lastResult;
    }
  }

  throw new Error("동시 요청이 많아 저장에 실패했습니다. 다시 시도해주세요.");
}

// 실행 환경에 따라 Redis URL, Redis REST, 로컬 메모리 저장소를 자동 선택합니다.
export async function readRoomRecord(roomCode: string): Promise<RoomRecord | null> {
  const normalizedRoomCode = normalizeRoomCode(roomCode);

  if (storeUsesNodeRedis || storeUsesRedisRest) {
    const raw = await redisCommand<string | null>(["GET", roomKey(normalizedRoomCode)]);
    return raw ? (JSON.parse(raw) as RoomRecord) : null;
  }

  clearExpiredMemoryRoom(normalizedRoomCode);
  const record = memoryRooms.get(normalizedRoomCode);
  return record ? deepClone(record) : null;
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

  if (storeUsesNodeRedis || storeUsesRedisRest) {
    return saveRedisRoomRecordIfVersionMatches(
      normalizedRoomCode,
      recordToSave,
      expectedVersion
    );
  }

  clearExpiredMemoryRoom(normalizedRoomCode);
  const existingRecord = memoryRooms.get(normalizedRoomCode);
  if (!existingRecord && expectedVersion !== -1) {
    return false;
  }
  if (existingRecord && existingRecord.version !== expectedVersion) {
    return false;
  }

  memoryRooms.set(normalizedRoomCode, deepClone(recordToSave));
  return true;
}

async function saveRedisRoomRecordIfVersionMatches(
  roomCode: string,
  record: RoomRecord,
  expectedVersion: number
): Promise<boolean> {
  const result = await redisCommand<number>([
    "EVAL",
    REDIS_SAVE_IF_VERSION_SCRIPT,
    1,
    roomKey(roomCode),
    String(expectedVersion),
    JSON.stringify(record),
    String(roomTtlSeconds),
  ]);
  return result === 1;
}

async function redisCommand<T>(command: unknown[]): Promise<T> {
  if (storeUsesNodeRedis) {
    const client = await getRedisClient();
    return client.sendCommand(command.map(String)) as Promise<T>;
  }

  if (!redisRestUrl || !redisRestToken) {
    throw new Error("Redis 환경변수가 설정되지 않았습니다.");
  }

  const response = await fetch(redisRestUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${redisRestToken}`,
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

async function getRedisClient(): Promise<RedisClientType> {
  if (!redisClientPromise) {
    const client = createClient(
      redisConnectionUrl ? { url: redisConnectionUrl } : undefined
    );
    client.on("error", (error) => {
      console.error("Redis connection error", error);
    });
    redisClientPromise = client.connect() as Promise<RedisClientType>;
  }

  return redisClientPromise;
}

function nextRoomExpiresAt() {
  return Date.now() + roomTtlSeconds * 1000;
}

function clearExpiredMemoryRoom(roomCode: string) {
  const record = memoryRooms.get(roomCode);
  if (record && record.expiresAt <= Date.now()) {
    memoryRooms.delete(roomCode);
  }
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
