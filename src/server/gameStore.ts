import { createClient, type RedisClientType } from "redis";
import {
  Colour,
  COLOURS,
  MAX_PLAYERS,
  MAX_PLAYERS_PER_COLOUR,
  BusType,
  type GameState,
  type TurnAction,
  type Card,
  type MoveTurnAction,
  type SwapTileTurnAction,
  type PlaceObstacleTurnAction,
  createGame,
  runMovePhase,
  runActionPhase,
  endOfRound,
  nextRound,
  isGameOver,
  cardLabel,
  getConnectedComponentSize,
} from "@/lib/game";

export interface LobbyParticipant {
  id: string;
  name: string;
  colour?: Colour;
}

export interface LogEntry {
  id: number;
  playerId: string;
  team: string;
  actions: {
    actionLabel: string;
    bus: BusType;
    applied: boolean;
    reason?: string;
    scoreGained: number;
  }[];
  round: number;
  turn: number;
}

export type RoomStatus = "LOBBY" | "WAITING" | "CHOOSING" | "ACTION_PHASE" | "GAME_OVER";

export interface RoomState {
  game: GameState;
  participants: LobbyParticipant[];
  logs: LogEntry[];
  status: RoomStatus;
  logIdCounter: number;
  playerIdCounter: number;
  pendingMoves: {
    PLUS?: MoveTurnAction[];
    MINUS?: MoveTurnAction[];
  };
  pendingActions: {
    PLUS?: TurnAction | null;
    MINUS?: TurnAction | null;
  };
  phaseStartedAt?: number;
  phaseDeadlineAt?: number;
  phaseDurationSeconds?: number;
  timerSettings?: RoomTimerSettings;
}

export interface RoomTimerSettings {
  movePhaseSeconds: number;
  actionPhaseSeconds: number;
}

interface TurnControllers {
  plusPlayer?: GameState["players"][number];
  minusPlayer?: GameState["players"][number];
}

interface RoomRecord {
  room: RoomState;
  version: number;
  expiresAt: number;
}

export interface RoomTimingMeta {
  serverNow: number;
  roomExpiresAt: number;
  phaseStartedAt?: number;
  phaseDeadlineAt?: number;
  phaseDurationSeconds?: number;
  timerSettings: RoomTimerSettings;
}

const DEFAULT_ROOM_TTL_SECONDS = 12 * 60 * 60;
const DEFAULT_MOVE_PHASE_SECONDS = 3 * 60;
const DEFAULT_ACTION_PHASE_SECONDS = 2 * 60;
const SAVE_RETRY_LIMIT = 5;

const roomTtlSeconds = getPositiveEnvNumber("ROOM_TTL_SECONDS", DEFAULT_ROOM_TTL_SECONDS);
const roomTtlMs = roomTtlSeconds * 1000;
const movePhaseSeconds = getPositiveEnvNumber("MOVE_PHASE_SECONDS", DEFAULT_MOVE_PHASE_SECONDS);
const actionPhaseSeconds = getPositiveEnvNumber("ACTION_PHASE_SECONDS", DEFAULT_ACTION_PHASE_SECONDS);
const redisConnectionUrl = process.env.REDIS_URL;
const redisRestUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisRestToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const memoryRooms = new Map<string, RoomRecord>();
let redisClientPromise: Promise<RedisClientType> | null = null;

const SAVE_IF_VERSION_SCRIPT = `
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

export async function hasRoom(roomCode: string): Promise<boolean> {
  return (await readRoomRecord(roomCode)) !== null;
}

export async function createRoom(roomCode: string): Promise<boolean> {
  const normalizedRoomCode = normalizeRoomCode(roomCode);
  const record: RoomRecord = {
    room: createEmptyRoom(),
    version: 0,
    expiresAt: Date.now() + roomTtlMs,
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

export async function getRoom(roomCode: string): Promise<RoomState | undefined> {
  const record = await readRoomRecord(roomCode);
  return record?.room;
}

export async function getOrCreateRoom(roomCode: string): Promise<RoomState> {
  const existingRecord = await readRoomRecord(roomCode);
  if (existingRecord) {
    return existingRecord.room;
  }

  await createRoom(roomCode);
  const createdRecord = await readRoomRecord(roomCode);
  if (!createdRecord) {
    throw new Error("방 생성에 실패했습니다.");
  }
  return createdRecord.room;
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

  const { room } = record;
  const safeGame = deepClone(room.game);
  safeGame.players.forEach((p) => {
    (p.hand as any) = Array(p.hand.length).fill({ kind: "HIDDEN" });
  });

  let activePlayerNames: string | null = null;
  if (room.game.players.length > 0) {
    const { plusPlayer, minusPlayer } = getTurnControllers(room.game);

    const names: string[] = [];
    if (room.status === "CHOOSING") {
      if (plusPlayer && !room.pendingMoves.PLUS) names.push(`${plusPlayer.name}(PLUS)`);
      if (minusPlayer && !room.pendingMoves.MINUS && minusPlayer.id !== plusPlayer?.id) {
        names.push(`${minusPlayer.name}(MINUS)`);
      }
    } else if (room.status === "ACTION_PHASE") {
      if (plusPlayer && room.pendingActions.PLUS === undefined) names.push(`${plusPlayer.name}(PLUS)`);
      if (minusPlayer && room.pendingActions.MINUS === undefined && minusPlayer.id !== plusPlayer?.id) {
        names.push(`${minusPlayer.name}(MINUS)`);
      }
    }

    if (names.length > 0) {
      activePlayerNames = names.join(" & ");
    }
  }

  return {
    game: safeGame,
    participants: room.participants,
    logs: room.logs,
    status: room.status,
    activePlayerNames,
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

export async function getPrivateState(roomCode: string, playerId: string) {
  const record = await readRoomRecord(roomCode);
  if (!record) {
    return null;
  }

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
  const hand = getVisiblePrivateHand(room, stablePlayerId);

  let isMyTurn = false;
  if (room.status === "CHOOSING") {
    const plusSubmitted = !!room.pendingMoves.PLUS;
    const minusSubmitted = !!room.pendingMoves.MINUS;

    const plusNeedsToSubmit = isPlusController && !plusSubmitted;
    const minusNeedsToSubmit = isMinusController && !minusSubmitted;

    isMyTurn = plusNeedsToSubmit || minusNeedsToSubmit;
  } else if (room.status === "ACTION_PHASE") {
    const plusSubmitted = room.pendingActions.PLUS !== undefined;
    const minusSubmitted = room.pendingActions.MINUS !== undefined;

    const plusNeedsToSubmit = isPlusController && !plusSubmitted;
    const minusNeedsToSubmit = isMinusController && !minusSubmitted;

    isMyTurn = plusNeedsToSubmit || minusNeedsToSubmit;
  }

  return {
    hand,
    isMyTurn,
    isPlusController,
    isMinusController,
    status: room.status,
    team: player?.team ?? participant?.colour,
    playerName: player?.name ?? participant?.name ?? player?.id,
    ...getRoomTimingMeta(record),
  };
}

function submitTurnToRoom(
  room: RoomState,
  playerId: string,
  actions: TurnAction[],
  submittedBus?: BusType
) {
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
    if (bus === BusType.PLUS) {
      room.pendingMoves.PLUS = actions as MoveTurnAction[];
    } else {
      room.pendingMoves.MINUS = actions as MoveTurnAction[];
    }

    if (!plusPlayer) room.pendingMoves.PLUS = [];
    if (!minusPlayer) room.pendingMoves.MINUS = [];

    if (room.pendingMoves.PLUS && room.pendingMoves.MINUS) {
      const clone = deepClone(room.game);
      const actionDetails: LogEntry["actions"] = [];

      if (plusPlayer) {
        const plusPlayerInClone = findClonePlayer(clone, plusPlayer.id);
        const plusMoves = room.pendingMoves.PLUS;
        const handCopy = [...plusPlayerInClone.hand];
        const results = runMovePhase(plusPlayerInClone, plusMoves, clone);

        plusMoves.forEach((move, i) => {
          const result = results[i];
          const label = actionLabel(move, handCopy);
          actionDetails.push({
            actionLabel: label,
            bus: BusType.PLUS,
            applied: result.applied,
            reason: result.reason,
            scoreGained: result.scoreGained ?? 0,
          });
        });
        if (plusMoves.length === 0) {
          actionDetails.push({
            actionLabel: "이동 패스",
            bus: BusType.PLUS,
            applied: true,
            scoreGained: 0,
          });
        }
      }

      if (minusPlayer) {
        const minusPlayerInClone = findClonePlayer(clone, minusPlayer.id);
        const minusMoves = room.pendingMoves.MINUS;
        const handCopy = [...minusPlayerInClone.hand];
        const results = runMovePhase(minusPlayerInClone, minusMoves, clone);

        minusMoves.forEach((move, i) => {
          const result = results[i];
          const label = actionLabel(move, handCopy);
          actionDetails.push({
            actionLabel: label,
            bus: BusType.MINUS,
            applied: result.applied,
            reason: result.reason,
            scoreGained: result.scoreGained ?? 0,
          });
        });
        if (minusMoves.length === 0) {
          actionDetails.push({
            actionLabel: "이동 패스",
            bus: BusType.MINUS,
            applied: true,
            scoreGained: 0,
          });
        }
      }

      const entry: LogEntry = {
        id: ++room.logIdCounter,
        playerId: `${plusPlayer?.name ?? "PLUS"} & ${minusPlayer?.name ?? "MINUS"}`,
        team: "Blue",
        actions: actionDetails,
        round: room.game.roundIndex + 1,
        turn: room.game.turnIndex + 1,
      };
      room.logs.unshift(entry);

      room.game = clone;
      room.status = "ACTION_PHASE";
      room.pendingMoves = {};
      startPhaseTimer(room, getRoomTimerSettings(room).actionPhaseSeconds);
    }
  } else if (room.status === "ACTION_PHASE") {
    const action = actions[0] as SwapTileTurnAction | PlaceObstacleTurnAction | undefined;
    if (bus === BusType.PLUS) {
      room.pendingActions.PLUS = action || null;
    } else {
      room.pendingActions.MINUS = action || null;
    }

    if (!plusPlayer) room.pendingActions.PLUS = null;
    if (!minusPlayer) room.pendingActions.MINUS = null;

    if (room.pendingActions.PLUS !== undefined && room.pendingActions.MINUS !== undefined) {
      const clone = deepClone(room.game);
      const actionDetails: LogEntry["actions"] = [];

      if (plusPlayer) {
        const plusPlayerInClone = findClonePlayer(clone, plusPlayer.id);
        const plusAction = room.pendingActions.PLUS;
        const result = runActionPhase(plusPlayerInClone, plusAction as any, clone);
        if (plusAction) {
          actionDetails.push({
            actionLabel: plusAction.type === "SWAP_TILE" ? "타일 위치 교환" : "장애물 설치",
            bus: BusType.PLUS,
            applied: result.applied,
            reason: result.reason,
            scoreGained: 0,
          });
        } else {
          actionDetails.push({
            actionLabel: "행동 패스",
            bus: BusType.PLUS,
            applied: true,
            scoreGained: 0,
          });
        }
      }

      if (minusPlayer) {
        const minusPlayerInClone = findClonePlayer(clone, minusPlayer.id);
        const minusAction = room.pendingActions.MINUS;
        const result = runActionPhase(minusPlayerInClone, minusAction as any, clone);
        if (minusAction) {
          actionDetails.push({
            actionLabel: minusAction.type === "SWAP_TILE" ? "타일 위치 교환" : "장애물 설치",
            bus: BusType.MINUS,
            applied: result.applied,
            reason: result.reason,
            scoreGained: 0,
          });
        } else {
          actionDetails.push({
            actionLabel: "행동 패스",
            bus: BusType.MINUS,
            applied: true,
            scoreGained: 0,
          });
        }
      }

      const allWalls = [
        ...clone.buses.PLUS.walls,
        ...clone.buses.MINUS.walls,
      ];

      const plusBus = clone.buses.PLUS;
      const plusSize = getConnectedComponentSize(plusBus.pos, clone.board, allWalls);
      const plusColor = clone.board[plusBus.pos.y]?.[plusBus.pos.x]?.colour;
      if (plusColor) {
        clone.teamScores[plusColor] += plusSize;
      }

      const minusBus = clone.buses.MINUS;
      const minusSize = getConnectedComponentSize(minusBus.pos, clone.board, allWalls);
      const minusColor = clone.board[minusBus.pos.y]?.[minusBus.pos.x]?.colour;
      if (minusColor) {
        clone.teamScores[minusColor] -= minusSize;
      }

      const entry: LogEntry = {
        id: ++room.logIdCounter,
        playerId: `${plusPlayer?.name ?? "PLUS"} & ${minusPlayer?.name ?? "MINUS"}`,
        team: "Blue",
        actions: actionDetails,
        round: clone.roundIndex + 1,
        turn: clone.turnIndex + 1,
      };
      room.logs.unshift(entry);

      clone.turnIndex = (clone.turnIndex + 1) % 5;

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
  }
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
      expiresAt: Date.now() + roomTtlMs,
    }, expectedVersion);

    if (saved) {
      return lastResult;
    }
  }

  throw new Error("동시 요청이 많아 저장에 실패했습니다. 다시 시도해주세요.");
}

async function readRoomRecord(roomCode: string): Promise<RoomRecord | null> {
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
    expiresAt: Date.now() + roomTtlMs,
  };

  if (storeUsesNodeRedis || storeUsesRedisRest) {
    const result = await redisCommand<number>([
      "EVAL",
      SAVE_IF_VERSION_SCRIPT,
      1,
      roomKey(normalizedRoomCode),
      String(expectedVersion),
      JSON.stringify(recordToSave),
      String(roomTtlSeconds),
    ]);
    return result === 1;
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

function startPhaseTimer(room: RoomState, durationSeconds: number) {
  const now = Date.now();
  room.phaseStartedAt = now;
  room.phaseDurationSeconds = durationSeconds;
  room.phaseDeadlineAt = now + durationSeconds * 1000;
}

function clearPhaseTimer(room: RoomState) {
  delete room.phaseStartedAt;
  delete room.phaseDeadlineAt;
  delete room.phaseDurationSeconds;
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

function getDefaultTimerSettings(): RoomTimerSettings {
  return {
    movePhaseSeconds,
    actionPhaseSeconds,
  };
}

function getRoomTimerSettings(room: RoomState): RoomTimerSettings {
  return {
    ...getDefaultTimerSettings(),
    ...room.timerSettings,
  };
}

function sanitizeDurationSeconds(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  const durationSeconds = value ?? fallback;
  return Math.min(Math.max(Math.round(durationSeconds), 10), 3 * 60 * 60);
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

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
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

function getTurnControllers(game: GameState): TurnControllers {
  const plusTeamColor = COLOURS[game.turnIndex];
  const minusTeamColor = COLOURS[COLOURS.length - 1 - game.turnIndex];
  const plusTeamPlayers = game.players.filter((p) => p.team === plusTeamColor);
  const minusTeamPlayers = game.players.filter((p) => p.team === minusTeamColor);

  return {
    plusPlayer: plusTeamPlayers[0],
    minusPlayer: minusTeamPlayers[1] || minusTeamPlayers[0],
  };
}

function findClonePlayer(game: GameState, playerId: string): GameState["players"][number] {
  const player = game.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error("플레이어를 찾을 수 없습니다.");
  }
  return player;
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

  const hand = [...player.hand];
  for (const move of room.pendingMoves.PLUS) {
    if (move.cardIndex >= 0 && move.cardIndex < hand.length) {
      hand.splice(move.cardIndex, 1);
    }
  }
  return hand;
}
