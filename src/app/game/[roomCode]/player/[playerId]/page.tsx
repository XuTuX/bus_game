"use client";

import { useState } from "react";
import { usePrivateGame, submitAction } from "@/lib/useGameState";
import { BusType, cardLabel, type CardKind } from "@/lib/game";
import Link from "next/link";
import { useRouter } from "next/navigation";

const CARD_ICONS: Record<CardKind, string> = {
  STRAIGHT1: "➡️",
  STRAIGHT2: "⏩",
  STRAIGHT3: "⏭️",
  LEFT: "↩️",
  RIGHT: "↪️",
};

import { use } from "react";

export default function DealerRoomPage({
  params,
}: {
  params: Promise<{ roomCode: string; playerId: string }>;
}) {
  const { roomCode, playerId } = use(params);
  const router = useRouter();
  const state = usePrivateGame(roomCode, playerId);
  
  const [selectedActions, setSelectedActions] = useState<{ bus: BusType; cardIndex: number }[]>([]);
  const [pendingCardIndex, setPendingCardIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  if (!state) {
    return (
      <div className="dealer-layout">
        <div className="dealer-main" style={{ justifyContent: "center" }}>
          <h2>개인 공간 접속 중...</h2>
        </div>
      </div>
    );
  }

  const { hand, isMyTurn, status, team } = state;

  const usedOriginalIndices = new Set<number>();
  for (const sel of selectedActions) {
    let adjustedIndex = sel.cardIndex;
    const sortedUsed = [...usedOriginalIndices].sort((a, b) => a - b);
    for (const used of sortedUsed) {
      if (used <= adjustedIndex) {
        adjustedIndex += 1;
      }
    }
    usedOriginalIndices.add(adjustedIndex);
  }

  const handleCardClick = (index: number) => {
    if (!isMyTurn || submitting || status !== "CHOOSING") return;
    if (usedOriginalIndices.has(index) || selectedActions.length >= 3) return;
    setPendingCardIndex(index);
  };

  const handleBusSelect = (bus: BusType) => {
    if (pendingCardIndex === null) return;
    let adjustedIndex = pendingCardIndex;
    const sortedUsed = [...usedOriginalIndices].sort((a, b) => a - b);
    for (const used of sortedUsed) {
      if (used < pendingCardIndex) {
        adjustedIndex -= 1;
      }
    }
    setSelectedActions((prev) => [...prev, { bus, cardIndex: adjustedIndex }]);
    setPendingCardIndex(null);
  };

  const handleSubmit = async () => {
    if (selectedActions.length === 0) return;
    setSubmitting(true);
    setErrorMsg("");
    try {
      await submitAction(roomCode, playerId, selectedActions);
      setSelectedActions([]);
      // Turn submitted successfully
    } catch (e: any) {
      setErrorMsg(e.message || "제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePass = async () => {
    setSubmitting(true);
    setErrorMsg("");
    try {
      await submitAction(roomCode, playerId, []);
      setSelectedActions([]);
    } catch (e: any) {
      setErrorMsg(e.message || "패스에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dealer-layout">
      <header className="header">
        <h1 className="brand-font">🔒 딜러룸 - 나만 보는 개인 공간</h1>
        <Link href={`/game/${roomCode}`} className="btn btn-ghost">
          공개 게임판으로 돌아가기
        </Link>
      </header>

      <main className="dealer-main">
        <div className="dealer-panel">
          <h2 className="dealer-title" style={{ color: `var(--team-${team.toLowerCase()})` }}>
            {playerId} ({team})
          </h2>
          <p className="dealer-subtitle">보유 카드: {hand.length}장</p>

          {!isMyTurn ? (
            <div style={{ padding: 40, background: "var(--bg-tertiary)", borderRadius: 16 }}>
              <h3 className="brand-font" style={{ fontSize: "1.5rem", color: "var(--text-secondary)" }}>
                {status === "LOBBY" ? "참가 완료! 게임 시작을 기다리는 중..." :
                 status === "WAITING" ? "진행자가 턴을 시작할 때까지 대기하세요" :
                 status === "SUBMITTED" ? "결과 공개를 대기 중입니다..." : 
                 status === "REVEALED" ? "결과가 공개되었습니다!" :
                 "현재 내 차례가 아닙니다"}
              </h3>
              <p style={{ marginTop: 12, color: "var(--text-muted)" }}>
                내 차례가 오면 카드를 선택할 수 있습니다.
              </p>
            </div>
          ) : (
            <>
              {errorMsg && (
                <div style={{ padding: 12, background: "var(--team-red-bg)", color: "var(--team-red)", borderRadius: 8, marginBottom: 24 }}>
                  {errorMsg}
                </div>
              )}

              <div className="card-list">
                {hand.map((card, index) => {
                  const isUsed = usedOriginalIndices.has(index);
                  return (
                    <div
                      key={index}
                      className={`card ${isUsed ? "card-used" : ""}`}
                      onClick={() => handleCardClick(index)}
                    >
                      <span className="card-icon">{CARD_ICONS[card.kind as CardKind]}</span>
                      <span className="card-label">{cardLabel(card)}</span>
                    </div>
                  );
                })}
              </div>

              <div className="selected-tray">
                {selectedActions.length === 0 ? (
                  <div style={{ color: "var(--text-muted)", alignSelf: "center", fontStyle: "italic" }}>
                    카드를 클릭하여 액션을 선택하세요 (최대 3장)
                  </div>
                ) : (
                  selectedActions.map((sel, i) => (
                    <div
                      key={i}
                      className="selected-chip"
                      style={{ 
                        background: sel.bus === BusType.PLUS ? "var(--bus-plus)" : "var(--bus-minus)",
                        boxShadow: sel.bus === BusType.PLUS ? "var(--shadow-glow-plus)" : "var(--shadow-glow-minus)"
                      }}
                    >
                      <span>
                        {sel.bus === BusType.PLUS ? "＋" : "ー"} #{sel.cardIndex}
                      </span>
                      <button
                        className="chip-remove"
                        onClick={() => setSelectedActions((prev) => prev.filter((_, idx) => idx !== i))}
                        disabled={submitting}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div style={{ display: "flex", gap: 16, justifyContent: "center" }}>
                <button
                  className="btn btn-primary"
                  onClick={handleSubmit}
                  disabled={selectedActions.length === 0 || submitting}
                  style={{ padding: "16px 48px", fontSize: "1.2rem" }}
                >
                  {submitting ? "제출 중..." : "제출 완료"}
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={handlePass}
                  disabled={submitting}
                >
                  패스
                </button>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Bus Selection Modal */}
      {pendingCardIndex !== null && (
        <div className="modal-overlay" onClick={() => setPendingCardIndex(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="brand-font" style={{ marginBottom: 8 }}>어느 버스에 적용할까요?</h2>
            <p style={{ color: "var(--text-secondary)", marginBottom: 24 }}>
              {CARD_ICONS[hand[pendingCardIndex].kind as CardKind]} {cardLabel(hand[pendingCardIndex])}
            </p>
            <div className="bus-buttons">
              <button className="bus-btn bus-btn-plus" onClick={() => handleBusSelect(BusType.PLUS)}>
                ＋ PLUS 버스
              </button>
              <button className="bus-btn bus-btn-minus" onClick={() => handleBusSelect(BusType.MINUS)}>
                ー MINUS 버스
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
