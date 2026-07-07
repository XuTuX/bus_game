import {
  getRoundColourOrder,
  type GameState,
} from "@/lib/game";
import { type TurnControllers } from "./gameStoreTypes";

export function getTurnControllers(game: GameState): TurnControllers {
  // 라운드마다 색상 순서를 한 칸씩 밀고, 현재 턴 색상은 BUS1, 반대편 색상은 BUS2 버스를 조작합니다.
  const roundColourOrder = getRoundColourOrder(game.roundIndex);
  const plusTeamColor = roundColourOrder[game.turnIndex];
  const minusTeamColor = roundColourOrder[roundColourOrder.length - 1 - game.turnIndex];
  const plusTeamPlayers = game.players.filter((p) => p.team === plusTeamColor);
  const minusTeamPlayers = game.players.filter((p) => p.team === minusTeamColor);

  return {
    bus1Player: plusTeamPlayers[0],
    bus2Player: minusTeamPlayers[1] || minusTeamPlayers[0],
  };
}

export function findClonePlayer(game: GameState, playerId: string): GameState["players"][number] {
  const player = game.players.find((p) => p.id === playerId);
  if (!player) {
    throw new Error("플레이어를 찾을 수 없습니다.");
  }
  return player;
}

export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}
