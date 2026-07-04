import {
  BusType,
  Colour,
  type GameState,
  type MoveTurnAction,
  type PlaceObstacleTurnAction,
  type SwapTileTurnAction,
} from "@/lib/game";

export type ActionPhaseTurnAction = SwapTileTurnAction | PlaceObstacleTurnAction;

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

// 방 하나에 대해 서버가 저장하는 전체 진행 상태입니다.
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
    PLUS?: ActionPhaseTurnAction | null;
    MINUS?: ActionPhaseTurnAction | null;
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

export interface TurnControllers {
  plusPlayer?: GameState["players"][number];
  minusPlayer?: GameState["players"][number];
}

export interface RoomRecord {
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
