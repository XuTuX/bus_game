"use client";

import { usePublicGame } from "@/lib/useGameState";
import Board from "@/components/Board";
import ScoreBoard from "@/components/ScoreBoard";
import ActionLog from "@/components/ActionLog";
import Link from "next/link";
import { COLOURS, type Colour } from "@/lib/game";

const TEAM_COLOUR_VARS: Record<Colour, string> = {
  Red: "var(--team-red)",
  Orange: "var(--team-orange)",
  Yellow: "var(--team-yellow)",
  Green: "var(--team-green)",
  Blue: "var(--team-blue)",
};

import { use } from "react";

export default function PublicBoardPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = use(params);
  const state = usePublicGame(roomCode);

  if (!state) {
    return (
      <div style={{ padding: 40, textAlign: "center", fontFamily: "Fredoka" }}>
        <h2>게임판을 불러오는 중...</h2>
      </div>
    );
  }

  const { game, logs, status, activePlayerId } = state;
  const activePlayer = game.players.find((p) => p.id === activePlayerId);

  return (
    <div className="public-layout">
      {/* ─── Left Sidebar ─── */}
      <aside className="public-sidebar">
        <h1 className="brand-font" style={{ fontSize: "2rem", marginBottom: 20 }}>
          🚌 Bus Route
        </h1>

        <div className="status-panel">
          <h2>현재 진행 상태</h2>
          <div style={{ fontSize: "1.2rem", fontWeight: 600, margin: "16px 0" }}>
            라운드 {Math.min(game.roundIndex + 1, 5)} / 5
          </div>
          
          <div style={{ textAlign: "left", marginTop: 24 }}>
            <h3 style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: 8 }}>플레이어 순서</h3>
            <div className="players-list">
              {game.players.map((p) => (
                <div
                  key={p.id}
                  className={`player-row ${
                    p.id === activePlayerId ? "player-row-active" : ""
                  }`}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      className="score-dot"
                      style={{ background: TEAM_COLOUR_VARS[p.team] }}
                    />
                    <span>{p.id} ({p.team})</span>
                  </div>
                  {p.id === activePlayerId && (
                    <span style={{ fontSize: "0.8rem", color: "var(--team-blue)", fontWeight: "bold" }}>
                      {status === "CHOOSING" ? "선택 중..." : status === "SUBMITTED" ? "제출 완료" : "대기 중"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="status-panel" style={{ marginTop: "auto" }}>
          <h2 style={{ marginBottom: 16 }}>참가 코드</h2>
          <div className="brand-font" style={{ fontSize: "3rem", color: "var(--team-blue)", letterSpacing: 8, background: "var(--bg-tertiary)", padding: "16px", borderRadius: 16, marginBottom: 16 }}>
            {roomCode}
          </div>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            스마트폰에서 홈페이지에 접속한 뒤<br />위 코드를 입력해 참가하세요.
          </p>
        </div>

        <div className="status-panel" style={{ marginTop: 16, background: "var(--team-yellow-bg)" }}>
          <Link href={`/game/${roomCode}/admin`} style={{ color: "var(--team-yellow)", fontWeight: "bold", textDecoration: "none" }}>
            👑 마스터(진행자) 모드 가기
          </Link>
        </div>
      </aside>

      {/* ─── Center Main Board ─── */}
      <main className="public-main" style={{ position: "relative" }}>
        <h2 className="brand-font" style={{ marginBottom: 32, fontSize: "1.8rem" }}>
          {status === "LOBBY" ? "대기실 (Lobby)" : "공개 게임판"}
        </h2>
        
        {status === "LOBBY" ? (
          <div className="lobby-container">
            <div className="lobby-bg-decoration lobby-decor-1"></div>
            <div className="lobby-bg-decoration lobby-decor-2"></div>
            
            <div className="lobby-content">
              <h1 className="lobby-title">참가자를 기다리는 중입니다...</h1>
              <p className="lobby-subtitle">
                플레이어들이 스마트폰으로 접속하여 캐릭터를 선택할 수 있습니다.<br />
                모든 참가자가 모이면 진행자가 게임을 시작합니다.
              </p>
              <div className="lobby-code-box">
                {roomCode}
              </div>
            </div>
          </div>
        ) : (
          <Board game={game} />
        )}

        {status === "WAITING" && (
          <div className="reveal-overlay">
            <div className="reveal-message">
              ⏳ 진행자가 턴을 시작할 때까지 대기하세요
            </div>
          </div>
        )}

        {status === "SUBMITTED" && (
          <div className="reveal-overlay">
            <div className="reveal-message" style={{ color: "var(--team-green)" }}>
              🔒 제출 완료! 결과 공개 대기 중...
            </div>
          </div>
        )}

        {status === "REVEALED" && (
          <div className="reveal-overlay">
            <div className="reveal-message">
              ✨ 결과 공개! ✨
            </div>
          </div>
        )}
        
        {status === "GAME_OVER" && (
          <div className="reveal-overlay">
            <div className="reveal-message" style={{ color: "var(--bus-plus)" }}>
              🏆 게임 종료!
            </div>
          </div>
        )}
      </main>

      {/* ─── Right Sidebar ─── */}
      <aside className="public-sidebar" style={{ borderLeft: "1px solid var(--border-subtle)", borderRight: "none" }}>
        <ScoreBoard game={game} />
        <ActionLog logs={logs} />
      </aside>
    </div>
  );
}
