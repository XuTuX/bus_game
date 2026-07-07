import {
  COLOURS,
  type Colour,
  getRoundColourOrder,
  type GameState,
} from "@/lib/game";
import { type TurnControllers } from "./gameStoreTypes";

export function getTurnControllers(game: GameState): TurnControllers {
  // 라운드마다 색상 순서를 한 칸씩 밀고, 두 버스 모두 동일한 순서(빨강 -> 주황 -> 노랑 -> 초록 -> 파랑)로 진행되므로 같은 색상 팀이 조작합니다.
  const roundColourOrder = getRoundColourOrder(game.roundIndex);
  const bus1TeamColor = roundColourOrder[game.turnIndex];
  const bus2TeamColor = bus1TeamColor;
  const bus1TeamPlayers = game.players.filter((p) => p.team === bus1TeamColor);

  return {
    busTeam: bus1TeamColor,
    bus1Player: bus1TeamPlayers[0],
    bus2Player: bus1TeamPlayers[1] || bus1TeamPlayers[0],
  };
}

export function getSubwayMoveTeams(game: GameState): Colour[] {
  const { busTeam } = getTurnControllers(game);
  const teamsInGame = new Set(game.players.map((player) => player.team));
  return getSubwayTeamOrder(game).filter(
    (team) => team !== busTeam && teamsInGame.has(team)
  );
}

export function getSubwayTeamOrder(game: GameState): Colour[] {
  const roundColourOrder = getRoundColourOrder(game.roundIndex);
  const startIndex = (game.turnIndex + 1) % COLOURS.length;
  return [
    ...roundColourOrder.slice(startIndex),
    ...roundColourOrder.slice(0, startIndex),
  ];
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
