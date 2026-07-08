import { useState, useEffect } from "react";
import {
  type LobbyParticipant,
  type RoomState,
  type RoomTimerSettings,
} from "@/server/gameStore";
import {
  getResponseErrorMessage,
  parseJsonResponse,
} from "@/lib/apiClient";
import { type Card, type CardKind, type Colour, type Coord, type TurnAction, BusType } from "@/lib/game";

export type TimingState = {
  serverNow: number;
  receivedAt: number;
  roomExpiresAt: number;
  phaseStartedAt?: number;
  phaseDeadlineAt?: number;
  phaseDurationSeconds?: number;
  timerSettings: RoomTimerSettings;
};

export type PublicStateResult = {
  game: RoomState["game"];
  participants: LobbyParticipant[];
  logs: RoomState["logs"];
  status: RoomState["status"];
  activePlayerNames: string | null;
  pendingMoves?: {
    BUS1: boolean;
    BUS2: boolean;
  };
  pendingActions?: {
    BUS1: boolean;
    BUS2: boolean;
  };
  busTeam?: Colour;
  subwayMoveTeams?: Colour[];
  subwayTeamPlayers?: Partial<Record<Colour, {
    playerId: string;
    playerName?: string;
    team: Colour;
    room: BusType;
    roomIndex: number;
  }[]>>;
  pendingSubwayMoves?: Record<string, boolean>;
  subwayPreview?: {
    submissions: {
      playerId: string;
      playerName?: string;
      team: Colour;
      cardKind?: CardKind;
      label: string;
      submittedOrder: number;
    }[];
    path: Coord[];
    finalPositions: Coord[];
  };
} & TimingState;

export type PrivateStateResult = {
  hand: Card[];
  isMyTurn: boolean;
  status: RoomState["status"];
  team?: Colour;
  playerName?: string;
  isBus1Controller?: boolean;
  isBus2Controller?: boolean;
} & TimingState;

export function usePublicGame(roomCode: string) {
  const [data, setData] = useState<PublicStateResult | null>(null);

  useEffect(() => {
    if (!roomCode) return;
    const fetchState = async () => {
      try {
        const res = await fetch(`/api/game/${roomCode}/public`);
        if (res.ok) {
          const json = await parseJsonResponse<PublicStateResult>(res);
          if (json) {
            setData({ ...json, receivedAt: Date.now() });
          }
        }
      } catch (e) {
        // ignore network errors for polling
      }
    };

    fetchState();
    const interval = setInterval(fetchState, 1000);
    return () => clearInterval(interval);
  }, [roomCode]);

  return data;
}

export function usePrivateGame(roomCode: string, playerId: string) {
  const [data, setData] = useState<PrivateStateResult | null>(null);

  useEffect(() => {
    if (!roomCode || !playerId) {
      setData(null);
      return;
    }
    const fetchState = async () => {
      try {
        const res = await fetch(`/api/game/${roomCode}/player/${playerId}`);
        if (res.ok) {
          const json = await parseJsonResponse<PrivateStateResult>(res);
          if (json) {
            setData({ ...json, receivedAt: Date.now() });
          }
        }
      } catch (e) {
        // ignore network errors for polling
      }
    };

    fetchState();
    const interval = setInterval(fetchState, 1000);
    return () => clearInterval(interval);
  }, [roomCode, playerId]);

  return data;
}

export function getPhaseTimeLabel(state?: TimingState | null): string | null {
  if (!state?.phaseDeadlineAt) {
    return null;
  }

  const elapsedSinceResponse = Date.now() - state.receivedAt;
  const estimatedServerNow = state.serverNow + elapsedSinceResponse;
  const remainingMs = Math.max(0, state.phaseDeadlineAt - estimatedServerNow);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function usePhaseTimeLabel(state?: TimingState | null): string | null {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!state?.phaseDeadlineAt) {
      return;
    }

    const interval = setInterval(() => {
      setTick((tick) => tick + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [state?.phaseDeadlineAt]);

  return getPhaseTimeLabel(state);
}

export async function submitAction(
  roomCode: string,
  playerId: string,
  actions: TurnAction[],
  bus?: BusType,
  mode?: "BUS" | "SUBWAY"
) {
  const res = await fetch(`/api/game/${roomCode}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, actions, bus, mode }),
  });
  
  if (!res.ok) {
    throw new Error(
      await getResponseErrorMessage(res, "Failed to submit turn")
    );
  }
}

export async function adminAction(
  roomCode: string,
  action: "start_game" | "start" | "start_timer"
) {
  const res = await fetch(`/api/game/${roomCode}/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  
  if (!res.ok) {
    throw new Error(
      await getResponseErrorMessage(res, "Failed to perform admin action")
    );
  }
}

export async function adminAddPlayer(roomCode: string, name: string) {
  const res = await fetch(`/api/game/${roomCode}/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "add_player", name }),
  });

  if (!res.ok) {
    throw new Error(
      await getResponseErrorMessage(res, "Failed to add player")
    );
  }
}

export async function adminRemovePlayer(roomCode: string, playerId: string) {
  const res = await fetch(`/api/game/${roomCode}/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "remove_player", playerId }),
  });

  if (!res.ok) {
    throw new Error(
      await getResponseErrorMessage(res, "Failed to remove player")
    );
  }
}

export async function adminSetPlayerColour(
  roomCode: string,
  playerId: string,
  colour: Colour
) {
  const res = await fetch(`/api/game/${roomCode}/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "set_player_colour", playerId, colour }),
  });

  if (!res.ok) {
    throw new Error(
      await getResponseErrorMessage(res, "Failed to set player colour")
    );
  }
}
export async function adminUpdatePlayerName(
  roomCode: string,
  playerId: string,
  name: string
) {
  const res = await fetch(`/api/game/${roomCode}/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "update_player_name", playerId, name }),
  });

  if (!res.ok) {
    throw new Error(
      await getResponseErrorMessage(res, "Failed to update player name")
    );
  }
}

export async function adminSetTimers(
  roomCode: string,
  timerSettings: RoomTimerSettings
) {
  const res = await fetch(`/api/game/${roomCode}/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "set_timers", ...timerSettings }),
  });

  if (!res.ok) {
    throw new Error(
      await getResponseErrorMessage(res, "Failed to set timers")
    );
  }
}

export async function adminGiveCards(
  roomCode: string,
  playerId: string,
  cardKind: CardKind,
  count: number
) {
  const res = await fetch(`/api/game/${roomCode}/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "give_cards", playerId, cardKind, count }),
  });

  if (!res.ok) {
    throw new Error(
      await getResponseErrorMessage(res, "Failed to give cards")
    );
  }
}
