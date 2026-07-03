"use client";

import { use } from "react";
import { usePublicGame } from "@/lib/useGameState";
import Link from "next/link";
import { COLOURS, type Colour } from "@/lib/game";

const TEAM_COLOUR_VARS: Record<Colour, string> = {
  Red: "var(--team-red)",
  Orange: "var(--team-orange)",
  Yellow: "var(--team-yellow)",
  Green: "var(--team-green)",
  Blue: "var(--team-blue)",
};

export default function JoinRoomPage({
  params,
}: {
  params: Promise<{ roomCode: string }>;
}) {
  const { roomCode } = use(params);
  const state = usePublicGame(roomCode);

  if (!state) {
    return (
      <div className="dealer-layout" style={{ justifyContent: "center", alignItems: "center" }}>
        <h2>방 정보를 불러오는 중...</h2>
      </div>
    );
  }

  const { game } = state;

  return (
    <div className="dealer-layout" style={{ justifyContent: "center", alignItems: "center", padding: 20 }}>
      <div className="dealer-panel" style={{ maxWidth: 600 }}>
        <h1 className="brand-font" style={{ fontSize: "2rem", marginBottom: 8 }}>
          방 코드: <span style={{ color: "var(--team-blue)", letterSpacing: 4 }}>{roomCode}</span>
        </h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: 32 }}>
          본인의 캐릭터(ID)를 선택해서 플레이어 룸에 입장하세요.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 }}>
          {game.players.map((p) => (
            <Link
              key={p.id}
              href={`/game/${roomCode}/player/${p.id}`}
              style={{
                textDecoration: "none",
                padding: "24px 16px",
                borderRadius: "16px",
                background: "var(--bg-tertiary)",
                border: `2px solid var(--border-subtle)`,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-4px)";
                e.currentTarget.style.boxShadow = "var(--shadow-md)";
                e.currentTarget.style.borderColor = TEAM_COLOUR_VARS[p.team];
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "none";
                e.currentTarget.style.boxShadow = "none";
                e.currentTarget.style.borderColor = "var(--border-subtle)";
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: TEAM_COLOUR_VARS[p.team],
                  boxShadow: "var(--shadow-sm)",
                }}
              />
              <span className="brand-font" style={{ fontSize: "1.2rem", color: "var(--text-primary)" }}>
                {p.id}
              </span>
            </Link>
          ))}
        </div>
        
        <div style={{ marginTop: 40 }}>
          <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "underline" }}>
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
