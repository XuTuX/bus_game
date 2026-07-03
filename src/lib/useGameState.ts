import { useState, useEffect } from "react";
import { type RoomState } from "@/server/gameStore";
import { type Card } from "@/lib/game";

export type PublicStateResult = {
  game: RoomState["game"];
  logs: RoomState["logs"];
  status: RoomState["status"];
  activePlayerId: string;
};

export type PrivateStateResult = {
  hand: Card[];
  isMyTurn: boolean;
  status: RoomState["status"];
  team: string;
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
    if (!roomCode || !playerId) return;
    const fetchState = async () => {
      try {
        const res = await fetch(`/api/game/${roomCode}/dealer/${playerId}`);
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
  actions: { bus: string; cardIndex: number }[]
) {
  const res = await fetch(`/api/game/${roomCode}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, actions }),
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
