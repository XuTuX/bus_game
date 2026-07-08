"use client";

import { use } from "react";
import ActionLog from "@/components/ActionLog";
import Board from "@/components/Board";
import PlayerRoomOrder from "@/components/PlayerRoomOrder";
import ScoreBoard from "@/components/ScoreBoard";
import { usePhaseTimeLabel, usePublicGame } from "@/lib/useGameState";
import { MAX_PLAYERS } from "@/lib/game";

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
  const phaseTimeLabel = usePhaseTimeLabel(state);

  if (!state) {
    return (
      <div className="dealer-layout loading-screen">
        <h2>공개판을 불러오는 중...</h2>
      </div>
    );
  }

  const { game, participants, logs, status, activePlayerNames } = state;
  const subwayPreview = state.subwayPreview;

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
          <PlayerRoomOrder
            activePlayerNames={activePlayerNames}
            emptyText="마스터가 참가자를 입력합니다."
            game={game}
            participants={participants}
            status={status}
          />
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
        <Board game={game} subwayPreview={subwayPreview} />
      </main>

      <aside className="public-sidebar public-sidebar-right">
        {subwayPreview && subwayPreview.submissions.length > 0 && (
          <div className="status-panel">
            <h2>지하철 예정 이동</h2>
            <div className="players-list">
              {subwayPreview.submissions.map((submission, index) => (
                <div className="score-item" key={`${submission.playerId}-${submission.submittedOrder}`}>
                  <span className="seat-number">{index + 1}</span>
                  <span className={`score-dot score-dot-${submission.team}`} />
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <strong>{submission.playerName ?? submission.playerId}</strong>
                    <div style={{ color: "var(--text-secondary)", fontSize: "0.8rem", marginTop: 2 }}>
                      {submission.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <ScoreBoard game={game} showBusStatus={false} />
      </aside>
    </div>
  );
}
