import { useState, useEffect } from "react";
import { type LobbyParticipant, type RoomState } from "@/server/gameStore";
import { type Card, type Colour, type TurnAction, BusType } from "@/lib/game";

export type PublicStateResult = {
  game: RoomState["game"];
  participants: LobbyParticipant[];
  logs: RoomState["logs"];
  status: RoomState["status"];
  activePlayerNames: string | null;
  pendingMoves?: {
    PLUS: boolean;
    MINUS: boolean;
  };
  pendingActions?: {
    PLUS: boolean;
    MINUS: boolean;
  };
};

export type PrivateStateResult = {
  hand: Card[];
  isMyTurn: boolean;
  status: RoomState["status"];
  team?: Colour;
  playerName?: string;
  isPlusController?: boolean;
  isMinusController?: boolean;
};

export function usePublicGame(roomCode: string) {
  const [data, setData] = useState<PublicStateResult | null>(null);

  useEffect(() => {
    if (!roomCode) return;
    const fetchState = async () => {
      try {
        const res = await fetch(`/api/game/${roomCode}/public`);
        if (res.ok) {
          const json = await res.json();
          setData(json);
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
          const json = await res.json();
          setData(json);
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

export async function submitAction(
  roomCode: string,
  playerId: string,
  actions: TurnAction[],
  bus?: BusType
) {
  const res = await fetch(`/api/game/${roomCode}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, actions, bus }),
  });
  
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to submit turn");
  }
}

export async function adminAction(
  roomCode: string,
  action: "start_game" | "start" | "reveal" | "next"
) {
  const res = await fetch(`/api/game/${roomCode}/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to perform admin action");
  }
}

export async function adminAddPlayer(roomCode: string, name: string) {
  const res = await fetch(`/api/game/${roomCode}/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "add_player", name }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to add player");
  }
}

export async function adminRemovePlayer(roomCode: string, playerId: string) {
  const res = await fetch(`/api/game/${roomCode}/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "remove_player", playerId }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || "Failed to remove player");
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
    const error = await res.json();
    throw new Error(error.error || "Failed to set player colour");
  }
}
