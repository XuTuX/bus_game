"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCreateRoom = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/rooms", { method: "POST" });
      const data = await res.json();
      if (data.roomCode) {
        // Rediect to public board (the TV screen)
        router.push(`/game/${data.roomCode}`);
      } else {
        throw new Error("방 생성에 실패했습니다.");
      }
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (code.length !== 4) {
      setError("4자리 방 코드를 입력해주세요.");
      return;
    }
    
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/rooms?code=${code}`);
      if (res.ok) {
        // Redirect to player selection screen
        router.push(`/game/${code}/join`);
      } else {
        setError("존재하지 않는 방 코드입니다.");
        setLoading(false);
      }
    } catch (e: any) {
      setError("네트워크 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  return (
    <div className="dealer-layout" style={{ justifyContent: "center", alignItems: "center", padding: 20 }}>
      <div className="dealer-panel" style={{ maxWidth: 500, padding: 48 }}>
        <h1 className="brand-font" style={{ fontSize: "3rem", color: "var(--team-blue)", marginBottom: 8 }}>
          🚌 Bus Route
        </h1>
        <p style={{ color: "var(--text-secondary)", marginBottom: 48 }}>
          다 함께 즐기는 파티 보드게임!
        </p>

        {error && (
          <div style={{ padding: 12, background: "var(--team-red-bg)", color: "var(--team-red)", borderRadius: 8, marginBottom: 24 }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          {/* Create Room Section (For TV/Master) */}
          <div style={{ background: "var(--team-yellow-bg)", padding: 24, borderRadius: 16 }}>
            <h2 className="brand-font" style={{ color: "var(--team-yellow)", marginBottom: 12 }}>새로운 게임 시작하기</h2>
            <p style={{ fontSize: "0.9rem", color: "var(--text-secondary)", marginBottom: 16 }}>
              거실 TV나 큰 모니터에서 방을 만들고, 다 함께 코드를 입력해 참가하세요.
            </p>
            <button
              className="btn btn-primary"
              style={{ width: "100%", padding: 16, fontSize: "1.2rem", background: "var(--team-yellow)", color: "#fff", boxShadow: "0 4px 12px rgba(253, 203, 110, 0.4)" }}
              onClick={handleCreateRoom}
              disabled={loading}
            >
              {loading ? "방 생성 중..." : "새 게임 방 만들기"}
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ flex: 1, height: 1, background: "var(--border-medium)" }} />
            <div style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>또는</div>
            <div style={{ flex: 1, height: 1, background: "var(--border-medium)" }} />
          </div>

          {/* Join Room Section (For Players) */}
          <div>
            <h2 className="brand-font" style={{ color: "var(--team-blue)", marginBottom: 16 }}>방 참가하기</h2>
            <form onSubmit={handleJoinRoom} style={{ display: "flex", gap: 12 }}>
              <input
                type="text"
                placeholder="방 코드 (4자리)"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={4}
                style={{
                  flex: 1,
                  padding: "16px 20px",
                  fontSize: "1.2rem",
                  borderRadius: "12px",
                  border: "2px solid var(--border-medium)",
                  outline: "none",
                  fontFamily: "monospace",
                  textTransform: "uppercase",
                  textAlign: "center",
                  letterSpacing: "4px"
                }}
                disabled={loading}
              />
              <button
                type="submit"
                className="btn btn-primary"
                style={{ padding: "0 32px", fontSize: "1.1rem" }}
                disabled={loading || roomCode.trim().length !== 4}
              >
                참가
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
