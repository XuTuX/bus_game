"use client";

import { use } from "react";
import ActionLog from "@/components/ActionLog";
import Board from "@/components/Board";
import ScoreBoard from "@/components/ScoreBoard";
import { getPhaseTimeLabel, usePublicGame } from "@/lib/useGameState";
import { MAX_PLAYERS, type Colour } from "@/lib/game";

const TEAM_COLOUR_VARS: Record<Colour, string> = {
  Red: "var(--team-red)",
  Orange: "var(--team-orange)",
  Yellow: "var(--team-yellow)",
  Green: "var(--team-green)",
  Blue: "var(--team-blue)",
};

const STATUS_LABELS = {
  LOBBY: "마스터 입력 대기",
  WAITING: "턴 시작 대기",
  CHOOSING: "이동 카드 선택 중",
  ACTION_PHASE: "행동 선택 중",
  GAME_OVER: "게임 종료",
} as const;

export default function PublicBoardPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = use(params);
  const state = usePublicGame(roomCode);

  if (!state) {
    return (
      <div className="dealer-layout loading-screen">
        <h2>공개판을 불러오는 중...</h2>
      </div>
    );
  }

  const { game, participants, logs, status, activePlayerNames } = state;
  const phaseTimeLabel = getPhaseTimeLabel(state);

  return (
    <div className="public-layout">
      <aside className="public-sidebar">
        <div>
          <h1 className="brand-font public-title">공개판</h1>
          <div className="room-code-badge">{roomCode}</div>
        </div>

        <div className="status-panel">
          <h2>진행 상태</h2>
          <div className="public-status">{STATUS_LABELS[status]}</div>
          <div className="status-metadata">
            <span>라운드 {Math.min(game.roundIndex + 1, 5)} / 5</span>
            <span>현재 차례 {activePlayerNames || "-"}</span>
            {phaseTimeLabel && <span>남은 시간 {phaseTimeLabel}</span>}
          </div>
        </div>

        <div className="status-panel">
          <h2>플레이어 순서</h2>
          <div className="players-list">
            {participants.length === 0 ? (
              <div className="empty-state">마스터가 참가자를 입력합니다.</div>
            ) : status === "LOBBY" ? (
              participants.map((participant, index) => (
                <div className="player-row" key={participant.id}>
                  <div className="player-identity">
                    <span className="seat-number">{index + 1}</span>
                    <span
                      className="score-dot"
                      style={{
                        background: participant.colour
                          ? TEAM_COLOUR_VARS[participant.colour]
                          : "var(--text-muted)",
                      }}
                    />
                    <span>{participant.name}</span>
                  </div>
                  <span className="tiny-label">{participant.colour ?? "-"}</span>
                </div>
              ))
            ) : (
              game.players.map((player, index) => (
                <div
                  key={player.id}
                  className={`player-row ${
                    (player.name && activePlayerNames?.includes(player.name)) ? "player-row-active" : ""
                  }`}
                >
                  <div className="player-identity">
                    <span className="seat-number">{index + 1}</span>
                    <span
                      className="score-dot"
                      style={{ background: TEAM_COLOUR_VARS[player.team] }}
                    />
                    <span>{player.name ?? player.id}</span>
                  </div>
                  <span className="tiny-label">{player.team}</span>
                </div>
              ))
            )}
          </div>
          <p className="muted-copy">정원 {participants.length} / {MAX_PLAYERS}</p>
        </div>
      </aside>

      <main className="public-main">
        <div className="public-board-header">
          <h2 className="brand-font">버스 보드판</h2>
          <div className="board-status-banner">
            {STATUS_LABELS[status]}
            {phaseTimeLabel ? ` · ${phaseTimeLabel}` : ""}
          </div>
        </div>
        <Board game={game} />
      </main>

      <aside className="public-sidebar public-sidebar-right">
        <ScoreBoard game={game} showBusStatus={false} />
      </aside>
    </div>
  );
}
