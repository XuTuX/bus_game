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
        router.push(`/game/${data.roomCode}/admin`);
      } else {
        throw new Error("방 생성에 실패했습니다.");
      }
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  const handleOpenRoomPage = async (
    destination: "master" | "dealer" | "public"
  ) => {
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
        const path =
          destination === "master"
            ? `/game/${code}/admin`
            : destination === "dealer"
            ? `/dealer/${code}`
            : `/game/${code}`;
        
        if (destination === "master") {
          router.push(path);
        } else {
          window.open(path, "_blank");
          setLoading(false);
        }
      } else {
        setError("존재하지 않는 방 코드입니다.");
        setLoading(false);
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setLoading(false);
    }
  };

  return (
    <div className="dealer-layout home-layout">
      <div className="dealer-panel home-panel">
        <h1 className="brand-font home-title">Bus Route</h1>
        <p className="home-subtitle">
          마스터가 사람을 입력하고, 딜러룸은 카드 입력, 공개판은 보드와 점수만 보여줍니다.
        </p>

        {error && <div className="error-box">{error}</div>}

        <div className="home-actions">
          <section className="home-section home-section-master">
            <h2 className="brand-font">마스터 페이지</h2>
            <p>
              새 방을 만들고 참가자 입력, 색상 변경, 게임 시작, 딜러룸 입력 시작을 진행합니다.
            </p>
            <button
              className="btn btn-primary"
              onClick={handleCreateRoom}
              disabled={loading}
            >
              {loading ? "방 생성 중..." : "새 게임 만들기"}
            </button>
          </section>

          <section className="home-section">
            <h2 className="brand-font">기존 방 들어가기</h2>
            <p>방 코드를 입력한 뒤 필요한 화면으로 바로 이동합니다.</p>
            <div className="room-code-form">
              <input
                type="text"
                placeholder="ABCD"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                maxLength={4}
                disabled={loading}
                className="room-code-input"
              />
            </div>
            <div className="home-page-buttons">
              <button
                type="button"
                className="btn btn-primary"
                disabled={loading || roomCode.trim().length !== 4}
                onClick={() => handleOpenRoomPage("master")}
              >
                마스터
              </button>

              <button
                type="button"
                className="btn btn-ghost"
                disabled={loading || roomCode.trim().length !== 4}
                onClick={() => handleOpenRoomPage("public")}
              >
                공개판
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
