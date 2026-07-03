"use client";

import { use } from "react";
import { usePublicGame, adminAction } from "@/lib/useGameState";

export default function AdminPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = use(params);
  const state = usePublicGame(roomCode);

  if (!state) {
    return (
      <div style={{ padding: 40, textAlign: "center", fontFamily: "Fredoka" }}>
        <h2>진행자 모드 불러오는 중...</h2>
      </div>
    );
  }

  const { status, activePlayerId, game } = state;
  const activePlayer = game.players.find(p => p.id === activePlayerId);

  const handleStartGame = () => adminAction(roomCode, "start_game");
  const handleStart = () => adminAction(roomCode, "start");
  const handleReveal = () => adminAction(roomCode, "reveal");
  const handleNext = () => adminAction(roomCode, "next");

  return (
    <div className="dealer-layout">
      <header className="header" style={{ background: "var(--team-yellow-bg)" }}>
        <h1 className="brand-font" style={{ color: "var(--team-yellow)" }}>👑 진행자 (Game Master) 대시보드</h1>
      </header>

      <main className="dealer-main" style={{ maxWidth: 600 }}>
        <div className="dealer-panel">
          {status !== "LOBBY" && (
            <>
              <h2 style={{ marginBottom: 16 }}>라운드 {Math.min(game.roundIndex + 1, 5)} / 5</h2>
              <div style={{ fontSize: "1.2rem", marginBottom: 32 }}>
                현재 차례: <strong style={{ color: "var(--team-blue)" }}>{activePlayer?.id} ({activePlayer?.team})</strong>
              </div>
            </>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {status === "LOBBY" && (
              <div style={{ textAlign: "center", padding: 32, background: "var(--bg-tertiary)", borderRadius: 16, border: "1px solid var(--border-subtle)" }}>
                <h3 style={{ fontSize: "1.5rem", marginBottom: 16 }}>대기실 (Lobby)</h3>
                <p style={{ color: "var(--text-secondary)", marginBottom: 32 }}>참가자들이 모두 접속했는지 확인한 후 게임을 시작하세요.</p>
                <button className="btn btn-primary" style={{ padding: "24px 48px", fontSize: "1.5rem", width: "100%", background: "var(--team-blue)" }} onClick={handleStartGame}>
                  🎮 게임 시작하기
                </button>
              </div>
            )}
            {status === "WAITING" && (
              <button className="btn btn-primary" style={{ padding: 24, fontSize: "1.2rem" }} onClick={handleStart}>
                ▶️ 턴 시작하기 (카드 선택 허용)
              </button>
            )}

            {status === "CHOOSING" && (
              <div style={{ padding: 24, border: "2px solid var(--team-blue)", borderRadius: 16 }}>
                <h3>플레이어가 카드를 선택 중입니다...</h3>
                <p style={{ color: "var(--text-secondary)", marginTop: 8 }}>제출할 때까지 대기하세요.</p>
              </div>
            )}

            {status === "SUBMITTED" && (
              <button className="btn btn-primary" style={{ padding: 24, fontSize: "1.2rem", background: "var(--team-green)" }} onClick={handleReveal}>
                ✨ 결과 공개하기
              </button>
            )}

            {status === "REVEALED" && (
              <button className="btn btn-primary" style={{ padding: 24, fontSize: "1.2rem", background: "var(--team-orange)" }} onClick={handleNext}>
                ⏭️ 다음 차례로 넘어가기
              </button>
            )}

            {status === "GAME_OVER" && (
              <div style={{ padding: 24, background: "var(--team-red-bg)", color: "var(--team-red)", borderRadius: 16, fontWeight: "bold" }}>
                게임이 종료되었습니다!
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
