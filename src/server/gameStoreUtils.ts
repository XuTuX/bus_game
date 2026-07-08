import {
  BusType,
  COLOURS,
  type Colour,
  getRoundColourOrder,
  type GameState,
} from "@/lib/game";
import { type TurnControllers } from "./gameStoreTypes";

export type SubwayTeamPlayerOption = {
  playerId: string;
  playerName?: string;
  team: Colour;
  room: BusType;
  roomIndex: number;
};

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
  const nextTeam = getNextTurnTeam(game);

  return getSubwayTeamOrder(game).filter(
    (team) =>
      team !== busTeam &&
      (!nextTeam || team !== nextTeam) &&
      teamsInGame.has(team)
  );
}

export function getSubwayTeamOrder(game: GameState): Colour[] {
  const roundColourOrder = getRoundColourOrder(game.roundIndex);
  const startIndex = (game.turnIndex + 2) % COLOURS.length;
  return [
    ...roundColourOrder.slice(startIndex),
    ...roundColourOrder.slice(0, startIndex),
  ];
}

function getNextTurnTeam(game: GameState): Colour | undefined {
  const nextTurnIndex = game.turnIndex + 1;
  if (nextTurnIndex < COLOURS.length) {
    return getRoundColourOrder(game.roundIndex)[nextTurnIndex];
  }

  const nextRoundIndex = game.roundIndex + 1;
  if (nextRoundIndex >= 8) {
    return undefined;
  }

  return getRoundColourOrder(nextRoundIndex)[0];
}

export function getSubwayTeamPlayerOptions(
  game: GameState
): Partial<Record<Colour, SubwayTeamPlayerOption[]>> {
  const eligibleTeams = new Set(getSubwayMoveTeams(game));
  const result: Partial<Record<Colour, SubwayTeamPlayerOption[]>> = {};

  for (const room of [BusType.BUS1, BusType.BUS2] as const) {
    for (const entry of getRoomOrderedPlayers(game, room)) {
      if (!eligibleTeams.has(entry.player.team)) {
        continue;
      }
      const teamOptions = result[entry.player.team] ?? [];
      if (!teamOptions.some((option) => option.playerId === entry.player.id)) {
        teamOptions.push({
          playerId: entry.player.id,
          playerName: entry.player.name,
          team: entry.player.team,
          room,
          roomIndex: entry.roomIndex,
        });
      }
      result[entry.player.team] = teamOptions;
    }
  }

  return result;
}

function getRoomOrderedPlayers(game: GameState, busType: BusType) {
  const grouped = new Map<Colour, GameState["players"]>();
  for (const colour of COLOURS) {
    grouped.set(colour, []);
  }
  for (const player of game.players) {
    grouped.get(player.team)?.push(player);
  }

  const roundColourOrder = getRoundColourOrder(game.roundIndex);
  const roomColours = roundColourOrder;

  return roomColours
    .flatMap((colour) => {
      const players = grouped.get(colour) ?? [];
      const player = busType === BusType.BUS1 ? players[0] : players[1] ?? players[0];
      return player ? [{ player, roomIndex: 0 }] : [];
    })
    .map((entry, index) => ({
      ...entry,
      roomIndex: index + 1,
    }));
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
