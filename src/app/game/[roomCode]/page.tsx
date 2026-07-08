"use client";

import { use } from "react";
import Board from "@/components/Board";
import SubwayMovePreview from "@/components/SubwayMovePreview";
import { usePhaseTimeLabel, usePublicGame } from "@/lib/useGameState";
import { COLOURS, getRoundColourOrder, type Colour, type GameState } from "@/lib/game";

const STATUS_LABELS = {
  LOBBY: "마스터 입력 대기",
  WAITING: "턴 시작 대기",
  CHOOSING: "이동 카드 선택 중",
  ACTION_PHASE: "행동 선택 중",
  GAME_OVER: "게임 종료",
} as const;

const TEAM_LABELS: Record<Colour, string> = {
  Red: "레드",
  Orange: "오렌지",
  Yellow: "옐로",
  Green: "그린",
  Blue: "블루",
};

export default function PublicBoardPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = use(params);
  const state = usePublicGame(roomCode);
  const phaseTimeLabel = usePhaseTimeLabel(state);

  if (!state) {
    return (
      <div className="dealer-layout loading-screen">
        <h2>공개판을 불러오는 중...</h2>
      </div>
    );
  }

  const { game, participants, status } = state;
  const subwayPreview = state.subwayPreview;
  const currentTeam = getRoundColourOrder(game.roundIndex)[game.turnIndex];
  const currentPlayers = game.players.filter((player) => player.team === currentTeam);
  const playerRooms = getCompactPlayerRooms(game, participants);
  const sortedScores = [...COLOURS].sort(
    (a, b) => game.teamScores[b] - game.teamScores[a]
  );

  return (
    <div className={`public-layout ${subwayPreview?.submissions.length ? "" : "public-layout-no-right"}`}>
      <aside className="public-sidebar">
        <section className="public-compact-card">
          <h2 className="brand-font">현재 라운드</h2>
          <div className="public-round-value">{Math.min(game.roundIndex + 1, 5)} / 5</div>
          <div className="public-status">{STATUS_LABELS[status]}</div>
          <div className="public-meta-lines">
            <span>남은 시간 {phaseTimeLabel || "0:00"}</span>
          </div>
        </section>

        <section className="public-compact-card">
          <h2 className="brand-font">현재 플레이어</h2>
          <div className="public-current-team">
            <span className={`score-dot score-dot-${currentTeam}`} />
            <strong>{TEAM_LABELS[currentTeam]}팀</strong>
          </div>
          <div className="public-current-names">
            {currentPlayers.map((player) => player.name || player.id).join(", ") || "-"}
          </div>
        </section>

        <section className="public-compact-card">
          <h2 className="brand-font">점수</h2>
          <div className="public-score-grid">
            {sortedScores.map((colour) => {
              const score = game.teamScores[colour];
              return (
                <div className="public-score-row" key={colour}>
                  <span className={`score-dot score-dot-${colour}`} />
                  <span>{TEAM_LABELS[colour]}</span>
                  <strong>{score > 0 ? `+${score}` : score}</strong>
                </div>
              );
            })}
          </div>
        </section>

        <section className="public-compact-card public-player-order-card">
          <h2 className="brand-font">플레이어 순서</h2>
          <div className="public-room-order-grid">
            <div className="public-room-order-section">
              <h3 className="brand-font">1번 버스를 움직일 방</h3>
              <div className="public-player-grid">
                {playerRooms.bus1.map((player, index) => (
                  <PublicPlayerChip
                    currentTeam={currentTeam}
                    index={index}
                    key={player.id}
                    player={player}
                  />
                ))}
              </div>
            </div>
            <div className="public-room-order-section">
              <h3 className="brand-font">2번 버스를 움직일 방</h3>
              <div className="public-player-grid">
                {playerRooms.bus2.map((player, index) => (
                  <PublicPlayerChip
                    currentTeam={currentTeam}
                    index={index}
                    key={player.id}
                    player={player}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>
      </aside>

      <main className="public-main">
        <div className="public-board-header">
          <h2 className="brand-font">버스 보드판</h2>
        </div>
        <Board game={game} subwayPreview={subwayPreview} />
      </main>

      {subwayPreview && subwayPreview.submissions.length > 0 && (
        <aside className="public-sidebar public-sidebar-right">
          <SubwayMovePreview submissions={subwayPreview.submissions} />
        </aside>
      )}
    </div>
  );
}

function PublicPlayerChip({
  currentTeam,
  index,
  player,
}: {
  currentTeam: Colour;
  index: number;
  player: { id: string; name: string; team: Colour };
}) {
  return (
    <div
      className={`public-player-chip ${player.team === currentTeam ? "public-player-chip-active" : ""}`}
    >
      <span className="seat-number">{index + 1}</span>
      <span className={`score-dot score-dot-${player.team}`} />
      <strong>{player.name || player.id}</strong>
    </div>
  );
}

function getCompactPlayerRooms(
  game: GameState,
  participants: { id: string; name: string; colour?: Colour }[]
) {
  const sources =
    game.players.length > 0
      ? game.players.map((player) => ({
          id: player.id,
          name: player.name ?? player.id,
          team: player.team,
        }))
      : participants
          .filter((participant): participant is { id: string; name: string; colour: Colour } => !!participant.colour)
          .map((participant) => ({
            id: participant.id,
            name: participant.name,
            team: participant.colour,
          }));

  const colourOrder = getRoundColourOrder(game.roundIndex);
  const grouped = new Map<Colour, typeof sources>();
  for (const colour of COLOURS) {
    grouped.set(colour, []);
  }
  for (const source of sources) {
    grouped.get(source.team)?.push(source);
  }

  return {
    bus1: colourOrder.flatMap((colour) => {
      const players = grouped.get(colour) ?? [];
      return players[0] ? [players[0]] : [];
    }),
    bus2: colourOrder.flatMap((colour) => {
      const players = grouped.get(colour) ?? [];
      return players[1] ? [players[1]] : players[0] ? [players[0]] : [];
    }),
  };
}
