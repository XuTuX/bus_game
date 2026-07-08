import {
  BusType,
  type CardKind,
  Colour,
  type GameState,
  type MoveTurnAction,
  type SwapTileTurnAction,
} from "@/lib/game";

export type ActionPhaseTurnAction = SwapTileTurnAction;

export interface SubwayMoveSubmission {
  playerId: string;
  playerName?: string;
  team: Colour;
  subway: BusType;
  action: MoveTurnAction | null;
  cardKind?: CardKind;
  submittedOrder: number;
}

export interface LobbyParticipant {
  id: string;
  name: string;
  colour?: Colour;
}

export interface LogEntry {
  id: number;
  playerId: string;
  team: string;
  phase?: "MOVE" | "ACTION";
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

export type RoomStatus =
  | "LOBBY"
  | "WAITING"
  | "CHOOSING"
  | "ACTION_PHASE"
  | "RESULT_PHASE"
  | "GAME_OVER";

// 방 하나에 대해 서버가 저장하는 전체 진행 상태입니다.
export interface RoomState {
  game: GameState;
  participants: LobbyParticipant[];
  logs: LogEntry[];
  status: RoomStatus;
  logIdCounter: number;
  playerIdCounter: number;
  pendingMoves: {
    BUS1?: MoveTurnAction[];
    BUS2?: MoveTurnAction[];
  };
  pendingSubwayMoves: Record<string, SubwayMoveSubmission>;
  subwaySubmissionCounter?: number;
  pendingActions: {
    BUS1?: ActionPhaseTurnAction | null;
    BUS2?: ActionPhaseTurnAction | null;
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
  bus1Player?: GameState["players"][number];
  bus2Player?: GameState["players"][number];
  busTeam: Colour;
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
